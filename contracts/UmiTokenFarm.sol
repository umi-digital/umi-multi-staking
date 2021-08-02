//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.3;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./ERC20Interface.sol";
import "./Calculator.sol";

/**
 * Umi token farm.
 * 
 * Note: The contract can accept any ERC20 token.
 * 
 * 1st. Staking smart contract where users can connect via metamask and stake ERC20 tokens.
 * 2nd. Rewards are paid in more the staked ERC20 token.
 * 3rd. Rewards can be collected anytime.
 */
contract UmiTokenFarm is Context, Ownable, ReentrancyGuard, Pausable {
    using Address for address;
    using SafeMath for uint256;
    using Calculator for uint256;

    /**
     * Emitted when a user store farming rewards.
     * @param token ERC20 token address.
     * @param sender User address.
     * @param amount Current store amount.
     * @param storeTimestamp The time when store farming rewards.
     */
    event ContractFunded(
        address indexed token,
        address indexed sender,
        uint256 amount,
        uint256 storeTimestamp
    );

    /**
     * Emitted when a user stakes tokens.
     * @param token ERC20 token address.
     * @param sender User address.
     * @param id User's unique stake ID.
     * @param balance Current user balance.
     * @param stakeTimestamp The time when stake tokens.
     */
    event Staked(
        address indexed token,
        address indexed sender,
        uint256 indexed id,
        uint256 balance,
        uint256 stakeTimestamp
    );

    /**
     * @dev Emitted when a new APY value is set.
     * @param token ERC20 token address.
     * @param value A new APY value.
     * @param sender The owner address at the moment of APY changing.
     */
    event ApySet(address token, uint256 value, address sender);

    /**
     * @dev Emitted when a user requests unstake.
     * @param token ERC20 token address.
     * @param sender User address.
     * @param id User's unique stake ID.
     */
    event UnstakeRequested(address indexed token, address indexed sender, uint256 indexed id);

    /**
     * @dev Emitted when a user unstakes tokens.
     * @param token ERC20 token address.
     * @param sender User address.
     * @param id User's unique stake ID.
     * @param amount The amount of ustake tokens.
     * @param balance Current user balance.
     * @param totalWithInterest The amount of unstake tokens with interest.
     * @param timePassed TimePassed seconds.
     */
    event Unstake(
        address indexed token,
        address indexed sender,
        uint256 indexed id,
        uint256 amount,
        uint256 balance,
        uint256 totalWithInterest,
        uint256 timePassed
    );

    /**
     * @dev Emitted when a user withdraw interest only.
     * @param token ERC20 token address.
     * @param sender User address.
     * @param id User's unique stake ID.
     * @param balance Current user balance of this stake.
     * @param timePassed TimePassed seconds.
     * @param interest The amount of interest.
     * @param claimTimestamp claim timestamp.
     */
    event Claimed(
        address indexed token,
        address indexed sender,
        uint256 indexed id,
        uint256 balance,
        uint256 interest,
        uint256 timePassed,
        uint256 claimTimestamp
    );

    // The stake balances of users(erc20 token address->(account address->(stakeId->amount)))
    mapping(address => mapping(address => mapping(uint256 => uint256))) public balances;
    // The dates of users' stakes(erc20 token address->(account address->(stakeId->timestamp)))
    mapping(address => mapping(address => mapping(uint256 => uint256))) public stakeDates;
    // The dates of users' unstake requests(erc20 token address->(account address->(stakeId->timestamp)))
    mapping(address => mapping(address => mapping(uint256 => uint256))) public unstakeRequestsDates;
    // The last stake id(erc20 token address->(account address->last stake id))
    mapping(address => mapping(address => uint256)) public lastStakeIds;
    // The total staked amount(erc20 token address => amount)
    mapping(address => uint256) public totalStaked;
    // The farming rewards of users(erc20 token address->(account address => total amount))
    mapping(address => mapping(address => uint256)) public funding;
    // the total farming rewards for users(erc20 token address => amount)
    mapping(address => uint256) public totalFunding;
    // tokens which staked
    TokenSet private tokenSet;
    
    // struct for tokens which staked
    struct TokenSet {
        address[] tokens;
        mapping(address => bool) isIn;
    }

    // The apy of each tokens(erc20 token address->apy)
    mapping(address => uint256) public apys;
    // default annual percentage yield is 12% (in percentage), only contract owner can modify it
    uint256 internal DEFAULT_APY = 12; // stand for 12%
    
    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    modifier isContract(address _tokenAddress) {
        require(
            _tokenAddress.isContract(),
            "_tokenAddress is not a contract address"
        );
        _;
    }

    /**
     * Get erc20 token instance by address.
     */
    function getToken(address _tokenAddress) internal view isContract(_tokenAddress) returns(ERC20Interface) {
       ERC20Interface token = ERC20Interface(_tokenAddress);
       return token;
    }

    /**
     * Store farming rewards to UmiTokenFarm contract, in order to pay the user interest later.
     *
     * Note: _amount should be more than 0
     */
    function fundingContract(address _tokenAddress, uint256 _amount) external isContract(_tokenAddress) nonReentrant {
        require(_amount > 0, "fundingContract _amount should be more than 0");
        funding[_tokenAddress][msg.sender] += _amount;
        // increase total funding
        totalFunding[_tokenAddress] += _amount;
        require(
            getToken(_tokenAddress).transferFrom(msg.sender, address(this), _amount),
            "fundingContract transferFrom failed"
        );
        // send event
        emit ContractFunded(_tokenAddress, msg.sender, _amount, _now());
    }

    /**
     * Only owner can set APY
     *
     * Note: If you want to set apy 12%, just pass 12
     * 
     * @param _tokenAddress ERC20 token address.
     * @param apy Annual percentage yield of token
     */
    function setApy(address _tokenAddress, uint256 apy) public onlyOwner {
        apys[_tokenAddress] = apy;
        emit ApySet(_tokenAddress, apy, msg.sender);
    }

    /**
     * Get the apy of certain token.
     * Note: if not setted, it will be DEFAULT_APY=12%
     * @param _tokenAddress ERC20 token address.
     */
    function getApy(address _tokenAddress) public view returns(uint256) {
        uint apy = apys[_tokenAddress];
        return (apy == 0) ? DEFAULT_APY : apy;
    }

    /**
     * Get erc20 token balance by address.
     * @param _tokenAddress ERC20 token address.
     * @param addr The address of the account that needs to check the balance
     * @return Return balance of umi token
     */
    function getERC20TokenBalance(address _tokenAddress, address addr) public view isContract(_tokenAddress) returns (uint256) {
        return getToken(_tokenAddress).balanceOf(addr);
    }

    /**
     * This method is used to stake tokens to a new stake.
     * It generates a new stake ID and calls another internal "stake" method. See its description.
     * @param _tokenAddress ERC20 token address.
     * @param _amount The amount to stake.
     */
    function stake(address _tokenAddress, uint256 _amount) public isContract(_tokenAddress) whenNotPaused {
        storeToTokenSet(_tokenAddress);
        stake(_tokenAddress, ++lastStakeIds[_tokenAddress][msg.sender], _amount);
    }

    /**
     * This method is used to stake tokens.
     * It calls the internal "_stake" method and transfers tokens from sender to contract.
     * Sender must approve tokens first.
     *
     * Instead this, user can use the simple "transfer" method of STAKE token contract to make a stake.
     * Sender's approval is not needed in this case.
     *
     * Note: each call updates the stake date so be careful if you want to make a long staking.
     *
     * @param _tokenAddress ERC20 token address.
     * @param _stakeId User's unique stake ID.
     * @param _amount The amount to stake.
     */
    function stake(address _tokenAddress, uint256 _stakeId, uint256 _amount) internal {
        require(
            _stakeId > 0 && _stakeId <= lastStakeIds[_tokenAddress][msg.sender],
            "wrong stake id"
        );
        _stake(_tokenAddress, msg.sender, _stakeId, _amount);
        require(
            getToken(_tokenAddress).transferFrom(msg.sender, address(this), _amount),
            "transfer failed"
        );
    }

    /**
     * @dev Increases the user balance, and updates the stake date.
     * @param _tokenAddress ERC20 token address.
     * @param _sender The address of the sender.
     * @param _id User's unique stake ID.
     * @param _amount The amount to stake.
     */
    function _stake(
        address _tokenAddress,
        address _sender,
        uint256 _id,
        uint256 _amount
    ) internal {
        require(_amount > 0, "stake amount should be more than 0");
        balances[_tokenAddress][_sender][_id] = _amount;
        totalStaked[_tokenAddress] = totalStaked[_tokenAddress].add(_amount);
        uint256 stakeTimestamp = _now();
        stakeDates[_tokenAddress][_sender][_id] = stakeTimestamp;
        emit Staked(_tokenAddress, _sender, _id, _amount, stakeTimestamp);
    }

    /**
     * This method is used to request a unstake, with certain amount(it also can be used to unstake all).
     * It sets the date of the request.
     *
     * Note: each call updates the date of the request so don't call this method twice during the lock.
     *
     * @param _tokenAddress ERC20 token address.
     * @param _stakeId User's unique stake ID.
     * @param _amount The amount to unstake, 
     */
    function unstakeCertainAmount(address _tokenAddress, uint256 _stakeId, uint256 _amount) external isContract(_tokenAddress) whenNotPaused nonReentrant {
        require(
            _stakeId > 0 && _stakeId <= lastStakeIds[_tokenAddress][msg.sender],
            "wrong stake id"
        );
        require(_amount > 0, "amount should be more than 0");
        unstakeRequestsDates[_tokenAddress][msg.sender][_stakeId] = _now();
        emit UnstakeRequested(_tokenAddress, msg.sender, _stakeId);
        // make unstake
        makeRequestedUnstake(_tokenAddress, _stakeId, _amount);
    }

    /**
     * This method is used to request a unstake, and unstake all the amount of stake.
     * It sets the date of the request.
     *
     * Note: each call updates the date of the request so don't call this method twice during the lock.
     *
     * @param _tokenAddress ERC20 token address.
     * @param _stakeId User's unique stake ID.
     */
    function unstake(address _tokenAddress, uint256 _stakeId) external isContract(_tokenAddress) whenNotPaused nonReentrant {
        require(
            _stakeId > 0 && _stakeId <= lastStakeIds[_tokenAddress][msg.sender],
            "wrong stake id"
        );
        unstakeRequestsDates[_tokenAddress][msg.sender][_stakeId] = _now();
        emit UnstakeRequested(_tokenAddress, msg.sender, _stakeId);
        // make unstake
        makeRequestedUnstake(_tokenAddress, _stakeId, 0);
    }

    /**
     * This method is used to make a requested unstake.
     * It calls the internal "_unstake" method and resets the date of the request.
     *
     * @param _tokenAddress ERC20 token address.
     * @param _stakeId User's unique stake ID.
     * @param _amount The amount to unstake (0 - to unstake all).
     */
    function makeRequestedUnstake(address _tokenAddress, uint256 _stakeId, uint256 _amount)
        internal
    {
        uint256 requestDate = unstakeRequestsDates[_tokenAddress][msg.sender][_stakeId];
        require(requestDate > 0, "unstake wasn't requested");
        unstakeRequestsDates[_tokenAddress][msg.sender][_stakeId] = 0;
        _unstake(_tokenAddress, msg.sender, _stakeId, _amount);
    }

    /**
     * Calls internal "calculateRewardsAndTimePassed" method and then transfers tokens to the sender.
     * 
     * @param _tokenAddress ERC20 token address.
     * @param _sender The address of the sender.
     * @param _id User's unique stake ID.
     * @param _amount The amount to unstake (0 - to unstake all).
     */
    function _unstake(
        address _tokenAddress,
        address _sender,
        uint256 _id,
        uint256 _amount
    ) internal {
        require(
            _id > 0 && _id <= lastStakeIds[_tokenAddress][_sender],
            "wrong stake id"
        );
        require(
            balances[_tokenAddress][_sender][_id] > 0 && balances[_tokenAddress][_sender][_id] >= _amount,
            "insufficient funds"
        );
        // calculate interest
        (uint256 totalWithInterest, uint256 timePassed) =
            calculateRewardsAndTimePassed(_tokenAddress, _sender, _id, _amount);
        require(
            totalWithInterest > 0 && timePassed > 0,
            "totalWithInterest<=0 or timePassed<=0"
        );
        uint256 amount = _amount == 0 ? balances[_tokenAddress][_sender][_id] : _amount;
        balances[_tokenAddress][_sender][_id] = balances[_tokenAddress][_sender][_id].sub(amount);
        totalStaked[_tokenAddress] = totalStaked[_tokenAddress].sub(amount);
        if (balances[_tokenAddress][_sender][_id] == 0) {
            stakeDates[_tokenAddress][_sender][_id] = 0;
        }
        // interest to be paid
        uint256 interest = totalWithInterest.sub(amount);
        uint256 unstakeAmount = 0;
        if (totalFunding[_tokenAddress] >= interest) {
            // total funding is enough to pay interest
            unstakeAmount = totalWithInterest;
            // reduce total funding
            totalFunding[_tokenAddress] = totalFunding[_tokenAddress].sub(interest);
        } else {
            // total funding is not enough to pay interest, the contract's UMI has been completely drained.
            // make sure users can unstake their capital.
            unstakeAmount = amount;
        }
        require(
            getToken(_tokenAddress).transfer(_sender, unstakeAmount),
            "transfer failed"
        );
        emit Unstake(
            _tokenAddress,
            _sender,
            _id,
            amount,
            balances[_tokenAddress][_sender][_id],
            totalWithInterest,
            timePassed
        );
    }

    /**
    * Withdraws the interest only of certain stake, and updates the stake date.
    *
    * @param _tokenAddress ERC20 token address.
    * @param _id User's unique stake ID.
    */
    function claim(address _tokenAddress, uint256 _id) external isContract(_tokenAddress) whenNotPaused nonReentrant {
        require(_id > 0 && _id <= lastStakeIds[_tokenAddress][msg.sender], "claim wrong stake id");
        uint256 balance = balances[_tokenAddress][msg.sender][_id];
        require(balance > 0, "claim balance must more than 0");
        // calculate interest
        (uint256 totalWithInterest, uint256 timePassed) =
            calculateRewardsAndTimePassed(_tokenAddress, msg.sender, _id, 0);
        require(
            totalWithInterest > 0 && timePassed > 0,
            "totalWithInterest<=0 or timePassed<=0"
        );
        uint256 interest = totalWithInterest.sub(balance);
        require(interest > 0, "interest must more than 0");
        require(totalFunding[_tokenAddress] >= interest, "not enough to pay interest");
        // reduce total funding
        totalFunding[_tokenAddress] = totalFunding[_tokenAddress].sub(interest);
        uint256 claimTimestamp = _now();
        // update stake date, and withdraw interest
        stakeDates[_tokenAddress][msg.sender][_id] = claimTimestamp;
        require(
            getToken(_tokenAddress).transfer(msg.sender, interest),
            "claim transfer failed"
        );
        // send claim event
        emit Claimed(_tokenAddress, msg.sender, _id, balance, interest, timePassed, claimTimestamp);
    }

    /**
     * calculate interest and time passed
     * 
     * @param _tokenAddress ERC20 token address.
     * @param _user User's address.
     * @param _id User's unique stake ID.
     * @param _amount Amount based on which interest is calculated. When 0, current stake balance is used.
     * @return Return total with interest and time passed
     */
    function calculateRewardsAndTimePassed(
        address _tokenAddress,
        address _user,
        uint256 _id,
        uint256 _amount
    ) internal view isContract(_tokenAddress) returns (uint256, uint256) {
        uint256 currentBalance = balances[_tokenAddress][_user][_id];
        uint256 amount = _amount == 0 ? currentBalance : _amount;
        uint256 stakeDate = stakeDates[_tokenAddress][_user][_id];
        // one day seconds
        uint256 oneDay = 1 days;
        // seconds
        uint256 timePassed = _now().sub(stakeDate);
        if (timePassed < oneDay) {
            // if timePassed less than one day, rewards will be 0
            return (amount, timePassed);
        }
        // timePassed bigger than one day
        uint256 _days = timePassed.div(oneDay);
        // the apy of token
        uint256 apy = getApy(_tokenAddress);
        uint256 totalWithInterest = Calculator.calculator(amount, _days, apy);
        return (totalWithInterest, timePassed);
    }

    /**
     * Get total balance of user.
     *
     * Note: Iter balances mapping to get total balance of address.
     *
     * @param _tokenAddress ERC20 token address.
     * @param _address User's address or Contract's address
     * @return Returns current _address's total balance
     */
    function getTotalBalanceOfUser(address _tokenAddress, address _address)
        public
        view 
        isContract(_tokenAddress)
        returns (uint256)
    {
        require(_address != address(0), "getTotalBalanceOfUser zero address");
        uint256 lastStakeId = lastStakeIds[_tokenAddress][_address];
        if (lastStakeId <= 0) {
            return 0;
        }
        uint256 totalBalance;
        mapping(uint256 => uint256) storage stakeBalanceMapping =
            balances[_tokenAddress][_address];
        for (uint256 i = 1; i <= lastStakeId; i++) {
            totalBalance += stakeBalanceMapping[i];
        }
        return totalBalance;
    }
    
    /**
     * Store token address to set.
     * 
     * @param _tokenAddress The token address.
     */
    function storeToTokenSet(address _tokenAddress) internal {
        address[] storage tokens = tokenSet.tokens;
        mapping(address => bool) storage isIn = tokenSet.isIn;
        if (!isIn[_tokenAddress]) {
            tokens.push(_tokenAddress);
            isIn[_tokenAddress] = true;
        }
    }
    
    /**
     * Get address array of tokens which has staked.
     */
    function getTokenArray() public view returns(address[] memory) {
        return tokenSet.tokens;
    }

    /**
     * @return Returns current timestamp.
     */
    function _now() internal view returns (uint256) {
        // Note that the timestamp can have a 900-second error:
        // https://github.com/ethereum/wiki/blob/c02254611f218f43cbb07517ca8e5d00fd6d6d75/Block-Protocol-2.0.md
        return block.timestamp; // solium-disable-line security/no-block-members
    }

    /**
     * Pauses all token stake, unstake.
     * 
     * See {Pausable-_pause}.
     * 
     * Requirements: the caller must be the owner.
     */
    function pause() public onlyOwner {
        _pause();
    }

    /**
     * Unpauses all token stake, unstake.
     * 
     * See {Pausable-_unpause}.
     * 
     * Requirements: the caller must be the owner.
     */
    function unpause() public onlyOwner {
        _unpause();
    }

}
