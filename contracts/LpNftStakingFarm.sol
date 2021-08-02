//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.3;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "./ERC20Interface.sol";
import "./Calculator.sol";
import "./erc1155/ERC1155TokenReceiver.sol";

/**
 * lp nft staking farm
 */
contract LpNftStakingFarm is
    Context,
    Ownable,
    ReentrancyGuard,
    Pausable,
    ERC1155TokenReceiver
{
    using Address for address;
    using SafeMath for uint256;
    using Calculator for uint256;

    /**
     * Emitted when a user store farming rewards(ERC20 token).
     * @param sender User address.
     * @param amount Current store amount.
     * @param timestamp The time when store farming rewards.
     */
    event ContractFunded(
        address indexed sender,
        uint256 amount,
        uint256 timestamp
    );

    /**
     * Emitted when a user stakes tokens(ERC20 token).
     * @param sender User address.
     * @param balance Current user balance.
     * @param timestamp The time when stake tokens.
     */
    event Staked(address indexed sender, uint256 balance, uint256 timestamp);

    /**
     * Emitted when a user unstakes erc20 tokens.
     * @param sender User address.
     * @param apy The apy of user.
     * @param balance The balance of user.
     * @param umiInterest The amount of interest(umi token).
     * @param timePassed TimePassed seconds.
     * @param timestamp The time when unstake tokens.
     */
    event Unstaked(
        address indexed sender,
        uint256 apy,
        uint256 balance,
        uint256 umiInterest,
        uint256 timePassed,
        uint256 timestamp
    );

    /**
     * Emitted when a new BASE_APY value is set.
     * @param value A new APY value.
     * @param sender The owner address at the moment of BASE_APY changing.
     */
    event BaseApySet(uint256 value, address sender);

    /**
     * Emitted when a new nft apy value is set.
     * @param nftId The nft id.
     * @param value A new APY value.
     * @param sender The owner address at the moment of apy changing.
     */
    event NftApySet(uint256 nftId, uint256 value, address sender);

    /**
     * Emitted when a user stakes nft token.
     * @param sender User address.
     * @param nftId The nft id.
     * @param amount The amount of nft id.
     * @param timestamp The time when stake nft.
     */
    event NftStaked(
        address indexed sender,
        uint256 nftId,
        uint256 amount,
        uint256 timestamp
    );

    /**
     * Emitted when a user batch stakes nft token.
     * @param sender User address.
     * @param nftIds The nft id.
     * @param amounts The amount of nft id.
     * @param timestamp The time when batch stake nft.
     */
    event NftsBatchStaked(
        address indexed sender,
        uint256[] nftIds,
        uint256[] amounts,
        uint256 timestamp
    );

    /**
     * Emitted when a user unstake nft token.
     * @param sender User address.
     * @param nftId The nft id.
     * @param amount The amount of nft id.
     * @param timestamp The time when unstake nft.
     */
    event NftUnstaked(
        address indexed sender,
        uint256 nftId,
        uint256 amount,
        uint256 timestamp
    );

    /**
     * Emitted when a user batch unstake nft token.
     * @param sender User address.
     * @param nftIds The nft id array.
     * @param amounts The amount array of nft id.
     * @param timestamp The time when batch unstake nft.
     */
    event NftsBatchUnstaked(
        address indexed sender,
        uint256[] nftIds,
        uint256[] amounts,
        uint256 timestamp
    );

    /**
     * @dev Emitted when a user withdraw interest only.
     * @param sender User address.
     * @param principal The principal of user.
     * @param interest The amount of interest.
     * @param claimTimestamp claim timestamp.
     */
    event Claimed(
        address indexed sender,
        uint256 principal,
        uint256 interest,
        uint256 claimTimestamp
    );

    // lp token
    ERC20Interface public lpToken;
    // rewards token(umi token now)
    ERC20Interface public umiToken;
    // nft token contract
    IERC1155 public nftContract;

    // lp token about
    // The stake balances of users, it will contains interest(user address->amount), input token is umi
    mapping(address => uint256) public balances;
    // The dates of users' stakes(user address->timestamp)
    mapping(address => uint256) public stakeDates;
    // The total staked amount
    uint256 public totalStaked;

    // umi token about
    // The farming rewards of users(address => total amount)
    mapping(address => uint256) public funding;
    // The total farming rewards for users
    uint256 public totalFunding;

    // ERC1155 about
    // Store each nft apy(ntfId->apy)
    mapping(uint256 => uint8) public nftApys;
    // Nft balance of users(user address->(nftId->amount))
    mapping(address => mapping(uint256 => uint256)) public nftBalances;
    // Store user's nft ids(user address -> NftSet)
    mapping(address => NftSet) userNftIds;
    // The total nft staked amount
    uint256 public totalNftStaked;
    // To store user's nft ids, it is more convenient to know if nft id of user exists
    struct NftSet {
        // user's nft id array
        uint256[] ids;
        // nft id -> bool, if nft id exist
        mapping(uint256 => bool) isIn;
    }

    // other constants
    // base APY when staking just lp token is 33%, only contract owner can modify it
    uint256 public BASE_APY = 33; // stand for 33%

    constructor(address _umiAddress, address _lpAddress, address _nftContract) {
        require(
            _umiAddress.isContract() && _lpAddress.isContract() && _nftContract.isContract(),
            "must use contract address"
        );
        umiToken = ERC20Interface(_umiAddress);
        lpToken = ERC20Interface(_lpAddress);
        nftContract = IERC1155(_nftContract);
        // initialize apys
        initApys();
    }

    /**
     * Store farming rewards to UmiStakingFarm contract, in order to pay the user interest later.
     *
     * Note: _amount should be more than 0
     * @param _amount The amount to funding contract.
     */
    function fundingContract(uint256 _amount) external nonReentrant {
        require(_amount > 0, "fundingContract _amount should be more than 0");
        funding[msg.sender] += _amount;
        // increase total funding
        totalFunding += _amount;
        require(
            umiToken.transferFrom(msg.sender, address(this), _amount),
            "fundingContract transferFrom failed"
        );
        // send event
        emit ContractFunded(msg.sender, _amount, _now());
    }

    /**
     * Only owner can set base apy.
     *
     * Note: If you want to set apy 12%, just pass 12
     *
     * @param _APY annual percentage yield
     */
    function setBaseApy(uint256 _APY) public onlyOwner {
        BASE_APY = _APY;
        emit BaseApySet(BASE_APY, msg.sender);
    }

    /**
     * This method is used to stake tokens(input token is LpToken).
     * Note: It calls another internal "_stake" method. See its description.
     * @param _amount The amount to stake.
     */
    function stake(uint256 _amount) public whenNotPaused nonReentrant {
        _stake(msg.sender, _amount);
    }

    /**
     * Increases the user's balance, totalStaked and updates the stake date.
     * @param _sender The address of the sender.
     * @param _amount The amount to stake.
     */
    function _stake(address _sender, uint256 _amount) internal {
        require(_amount > 0, "stake amount should be more than 0");
        // calculate rewards of umi token
        uint256 umiInterest = calculateUmiTokenRewards(_sender);

        // increase balances
        balances[_sender] = balances[_sender].add(_amount);
        // increase totalStaked
        totalStaked = totalStaked.add(_amount);
        uint256 stakeTimestamp = _now();
        stakeDates[_sender] = stakeTimestamp;
        // send staked event
        emit Staked(_sender, _amount, stakeTimestamp);
        // transfer lp token to contract
        require(
            lpToken.transferFrom(_sender, address(this), _amount),
            "transfer failed"
        );
        // Transfer umiToken interest to user
        transferUmiInterest(_sender, umiInterest);
    }
    
    /**
     * Transfer umiToken interest to user.
     */ 
    function transferUmiInterest(address recipient, uint256 amount) internal {
        if (amount <= 0) {
            return;
        }
        // reduce total funding
        totalFunding = totalFunding.sub(amount);
        require(
                umiToken.transfer(recipient, amount),
                "transfer umi nterest failed"
            );
    }

    /**
     * This method is used to unstake all the amount of lp token.
     * Note: It calls another internal "_unstake" method. See its description.
     * Note: unstake lp token.
     */
    function unstake() external whenNotPaused nonReentrant {
        _unstake(msg.sender);
    }

    /**
     * Call internal "calculateRewardsAndTimePassed" method to calculate user's latest balance,
     * and then transfer tokens to the sender.
     *
     * @param _sender The address of the sender.
     */
    function _unstake(address _sender) internal {
        // get lp token balance of current user
        uint256 balance = balances[msg.sender];
        require(balance > 0, "insufficient funds");
        // calculate total balance with interest(the interest is umi token)
        (uint256 totalWithInterest, uint256 timePassed) =
            calculateRewardsAndTimePassed(_sender, 0);
        require(
            totalWithInterest > 0 && timePassed > 0,
            "totalWithInterest<=0 or timePassed<=0"
        );
        // update balance of user to 0
        balances[_sender] = 0;
        // update date of stake
        stakeDates[_sender] = 0;
        // update totalStaked of lpToken
        totalStaked = totalStaked.sub(balance);

        // interest to be paid, rewards is umi token
        uint256 interest = totalWithInterest.sub(balance);
        uint256 umiInterestAmount = 0;
        if (interest > 0 && totalFunding >= interest) {
            // interest > 0 and total funding is enough to pay interest
            umiInterestAmount = interest;
            // reduce total funding
            totalFunding = totalFunding.sub(interest);
        }
        // total funding is not enough to pay interest, the contract's UMI has been completely drained. make sure users can unstake their lp tokens.
        // 1. rewards are paid in more umi
        if (umiInterestAmount > 0) {
            require(
                umiToken.transfer(_sender, umiInterestAmount),
                "_unstake umi transfer failed"
            );
        }
        // 2. unstake lp token of user
        require(
            lpToken.transfer(_sender, balance),
            "_unstake: lp transfer failed"
        );
        // send event
        emit Unstaked(
            _sender,
            getTotalApyOfUser(_sender),
            balance,
            umiInterestAmount,
            timePassed,
            _now()
        );
    }

    /**
     * stake nft token to this contract.
     * Note: It calls another internal "_stakeNft" method. See its description.
     */
    function stakeNft(
        uint256 id,
        uint256 value,
        bytes calldata data
    ) external whenNotPaused nonReentrant {
        require(isInWhitelist(id), "stakeNft: nft id not in whitelist");
        _stakeNft(msg.sender, address(this), id, value, data);
    }

    /**
     * Transfers `_value` tokens of token type `_id` from `_from` to `_to`.
     *
     * Note: when nft staked, apy will changed, should recalculate balance.
     * update nft balance, nft id, totalNftStaked.
     *
     * @param _from The address of the sender.
     * @param _to The address of the receiver.
     * @param _id The nft id.
     * @param _value The amount of nft token.
     */
    function _stakeNft(
        address _from,
        address _to,
        uint256 _id,
        uint256 _value,
        bytes calldata _data
    ) internal {
        // calculate rewards of umi token
        uint256 umiInterest = calculateUmiTokenRewards(_from);
        // update stakeDate of user
        stakeDates[_from] = balances[_from] > 0 ?  _now() : 0;

        // modify nftBalances of user
        nftBalances[_from][_id] = nftBalances[_from][_id].add(_value);
        // modify user's nft id array
        setUserNftIds(_from, _id);
        totalNftStaked = totalNftStaked.add(_value);

        // transfer nft token to this contract
        nftContract.safeTransferFrom(_from, _to, _id, _value, _data);
        // Transfer umiToken interest to user
        transferUmiInterest(_from, umiInterest);
        // send event
        emit NftStaked(_from, _id, _value, _now());
    }

    /**
     * Batch stake nft token to this contract.
     *
     * Note: It calls another internal "_batchStakeNfts" method. See its description.
     *       Reverts if ids and values length mismatch.
     * @param ids The nft id array to be staked.
     * @param values The nft amount array.
     */
    function batchStakeNfts(
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) external whenNotPaused nonReentrant {
        require(
            ids.length == values.length,
            "ids and values length mismatch"
        );
        _batchStakeNfts(msg.sender, address(this), ids, values, data);
    }

    /**
     * Batch transfers `_values` tokens of token type `_ids` from `_from` to `_to`.
     *
     * Note: when nft staked, apy will changed, should recalculate balance.
     * update nft balance, nft id and totalNftStaked.
     *
     * @param _from The address of sender.
     * @param _to The address of receiver.
     * @param _ids The nft id array to be staked.
     * @param _values The nft amount array.
     */
    function _batchStakeNfts(
        address _from,
        address _to,
        uint256[] memory _ids,
        uint256[] memory _values,
        bytes calldata _data
    ) internal {
        // calculate rewards of umi token
        uint256 umiInterest = calculateUmiTokenRewards(_from);
        // update stakeDate of user
        stakeDates[_from] = balances[_from] > 0 ?  _now() : 0;

        // update data
        for (uint256 i = 0; i < _ids.length; i++) {
            // get nft id from id array
            uint256 id = _ids[i];
            // get amount
            uint256 value = _values[i];

            require(isInWhitelist(id), "nft id not in whitelist");

            // increase nft balance of user
            nftBalances[_from][id] = nftBalances[_from][id].add(value);
            // update user's nft id array
            setUserNftIds(_from, id);
            // increase total nft amount
            totalNftStaked = totalNftStaked.add(value);
        }

        // batch transfer nft tokens
        nftContract.safeBatchTransferFrom(_from, _to, _ids, _values, _data);
        // Transfer umiToken interest to user
        transferUmiInterest(msg.sender, umiInterest);
        // send event
        emit NftsBatchStaked(_from, _ids, _values, _now());
    }

    /**
     * Unstake nft token from this contract.
     *
     * Note: It calls another internal "_unstakeNft" method. See its description.
     *
     * @param id The nft id.
     * @param value The amount of nft id.
     */
    function unstakeNft(
        uint256 id,
        uint256 value,
        bytes calldata data
    ) external whenNotPaused nonReentrant {
        _unstakeNft(id, value, data);
    }

    /**
     * Unstake nft token with sufficient balance.
     *
     * Note: when nft unstaked, apy will changed, should recalculate balance.
     * update nft balance, nft id and totalNftStaked.
     *
     * @param _id The nft id.
     * @param _value The amount of nft id.
     */
    function _unstakeNft(
        uint256 _id,
        uint256 _value,
        bytes calldata _data
    ) internal {
        // calculate rewards of umi token
        uint256 umiInterest = calculateUmiTokenRewards(msg.sender);
        // update stakeDate of user
        stakeDates[msg.sender] = balances[msg.sender] > 0 ?  _now() : 0;

        uint256 nftBalance = nftBalances[msg.sender][_id];
        require(
            nftBalance >= _value,
            "insufficient balance for unstake"
        );

        // reduce nft balance
        nftBalances[msg.sender][_id] = nftBalance.sub(_value);
        // reduce total nft amount
        totalNftStaked = totalNftStaked.sub(_value);
        if (nftBalances[msg.sender][_id] == 0) {
            // if balance of the nft id is 0, remove nft id and set flag=false
            removeUserNftId(_id);
        }

        // transfer nft token from this contract
        nftContract.safeTransferFrom(
            address(this),
            msg.sender,
            _id,
            _value,
            _data
        );
        // Transfer umiToken interest to user
        transferUmiInterest(msg.sender, umiInterest);
        // send event
        emit NftUnstaked(msg.sender, _id, _value, _now());
    }

    /**
     * Batch unstake nft token from this contract.
     *
     * Note: It calls another internal "_batchUnstakeNfts" method. See its description.
     *       Reverts if ids and values length mismatch.
     *
     * @param ids The nft id array to be staked.
     * @param values The nft amount array.
     */
    function batchUnstakeNfts(
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) external whenNotPaused nonReentrant {
        require(
            ids.length == values.length,
            "ids and values length mismatch"
        );
        _batchUnstakeNfts(address(this), msg.sender, ids, values, data);
    }

    /**
     * Batch unstake nft token from this contract.
     *
     * Note: when nft unstaked, apy will changed, should recalculate balance.
     * update nft balance, nft id and totalNftStaked.
     *
     * @param _from The address of sender.
     * @param _to The address of receiver.
     * @param _ids The nft id array to be unstaked.
     * @param _values The nft amount array.
     */
    function _batchUnstakeNfts(
        address _from,
        address _to,
        uint256[] calldata _ids,
        uint256[] calldata _values,
        bytes calldata _data
    ) internal {
        // calculate rewards of umi token
        uint256 umiInterest = calculateUmiTokenRewards(_from);
        // update stakeDate of user
        stakeDates[_from] = balances[_from] > 0 ?  _now() : 0;

        // update data
        for (uint256 i = 0; i < _ids.length; i++) {
            // get nft id
            uint256 id = _ids[i];
            // get amount of nft id
            uint256 value = _values[i];

            uint256 nftBalance = nftBalances[msg.sender][id];
            require(
                nftBalance >= value,
                "insufficient nft balance for unstake"
            );
            nftBalances[msg.sender][id] = nftBalance.sub(value);
            totalNftStaked = totalNftStaked.sub(value);
            if (nftBalances[msg.sender][id] == 0) {
                // if balance of the nft id is 0, remove nft id and set flag=false
                removeUserNftId(id);
            }
        }

        // transfer nft token from this contract
        nftContract.safeBatchTransferFrom(_from, _to, _ids, _values, _data);
        // Transfer umiToken interest to user
        transferUmiInterest(msg.sender, umiInterest);
        // send event
        emit NftsBatchUnstaked(msg.sender, _ids, _values, _now());
    }

    /**
    * Withdraws the interest only of user, and updates the stake date, balance and etc..
    */
    function claim() external whenNotPaused nonReentrant {
        uint256 balance = balances[msg.sender];
        require(balance > 0, "balance should more than 0");
        // calculate total balance with interest
        (uint256 totalWithInterest, uint256 timePassed) = calculateRewardsAndTimePassed(msg.sender, 0);
        require(
            totalWithInterest > 0 && timePassed >= 0,
            "calculate rewards and TimePassed error"
        );
        // interest to be paid
        uint256 interest = totalWithInterest.sub(balance);
        require(interest > 0, "claim interest must more than 0");
        require(totalFunding >= interest, "total funding not enough to pay interest");
        // enough to pay interest
        // reduce total funding
        totalFunding = totalFunding.sub(interest);
        uint256 claimTimestamp = _now();
        // update stake date
        stakeDates[msg.sender] = claimTimestamp;
        // transfer interest to user
        require(
            umiToken.transfer(msg.sender, interest),
            "claim: transfer failed"
        );
        // send claim event
        emit Claimed(msg.sender, balance, interest, claimTimestamp);
    }

    /**
     * Calculate user's umiToken rewards.
     *
     * @param _from User address.
     */
    function calculateUmiTokenRewards(address _from) public view returns(uint256) {
        // if lpToken balance>0, pass time > 1day, should calculate rewards of umiToken.
        // get current lp token balance
        uint256 balance = balances[_from];
        if (balance <= 0) {
            // stake first time, balance is 0, donot need to calculate rewards.
            return 0;
        }
        // calculate total balance with interest
        (uint256 totalWithInterest, uint256 timePassed) =
            calculateRewardsAndTimePassed(_from, 0);
        require(
            totalWithInterest > 0 && timePassed >= 0,
            "calculate rewards and TimePassed error"
        );
        // return rewards amount
        return totalWithInterest.sub(balance);
    }

    /**
     * Calculate interest and time passed.
     *
     * @param _user User's address.
     * @param _amount Amount based on which interest is calculated. When 0, current stake balance is used.
     * @return Return total with interest and time passed.
     */
    function calculateRewardsAndTimePassed(address _user, uint256 _amount)
        internal
        view
        returns (uint256, uint256)
    {
        uint256 currentBalance = balances[_user];
        uint256 amount = _amount == 0 ? currentBalance : _amount;
        uint256 stakeDate = stakeDates[_user];
        // one day seconds
        uint256 oneDay = 1 days;
        // seconds
        uint256 timePassed = _now().sub(stakeDate);
        if (timePassed < oneDay) {
            // if timePassed less than one day, rewards will be 0
            return (amount, timePassed);
        }
        // get total apy of user
        uint256 totalApy = getTotalApyOfUser(_user);
        // timePassed bigger than one day
        uint256 _days = timePassed.div(oneDay);
        uint256 totalWithInterest =
            Calculator.calculator(amount, _days, totalApy);
        return (totalWithInterest, timePassed);
    }

    /**
     * Get umi token balance by address.
     * @param addr The address of the account that needs to check the balance.
     * @return Return balance of umi token.
     */
    function getUmiBalance(address addr) public view returns (uint256) {
        return umiToken.balanceOf(addr);
    }

    /**
     * Get lp token balance by address.
     * @param addr The address of the account that needs to check the balance
     * @return Return balance of lp token.
     */
    function getLpBalance(address addr) public view returns (uint256) {
        return lpToken.balanceOf(addr);
    }

    /**
     * Get nft balance by user address and nft id.
     *
     * @param user The address of user.
     * @param id The nft id.
     */
    function getNftBalance(address user, uint256 id)
        public
        view
        returns (uint256)
    {
        return nftContract.balanceOf(user, id);
    }

    /**
     * Get user's nft ids array.
     * @param user The address of user.
     */
    function getUserNftIds(address user)
        public
        view
        returns (uint256[] memory)
    {
        return userNftIds[user].ids;
    }

    /**
     * Get length of user's nft id array.
     * @param user The address of user.
     */
    function getUserNftIdsLength(address user) public view returns (uint256) {
        return userNftIds[user].ids.length;
    }

    /**
     * Check if nft id exist.
     * @param user The address of user.
     * @param nftId The nft id of user.
     */
    function isNftIdExist(address user, uint256 nftId)
        public
        view
        returns (bool)
    {
        NftSet storage nftSet = userNftIds[user];
        mapping(uint256 => bool) storage isIn = nftSet.isIn;
        return isIn[nftId];
    }

    /**
     * Set user's nft id.
     *
     * Note: when nft id donot exist, the nft id will be added to ids array, and the idIn flag will be setted true;
     * otherwise do nothing.
     *
     * @param user The address of user.
     * @param nftId The nft id of user.
     */
    function setUserNftIds(address user, uint256 nftId) internal {
        NftSet storage nftSet = userNftIds[user];
        uint256[] storage ids = nftSet.ids;
        mapping(uint256 => bool) storage isIn = nftSet.isIn;
        if (!isIn[nftId]) {
            ids.push(nftId);
            isIn[nftId] = true;
        }
    }

    /**
     * Remove nft id of user.
     *
     * Note: when user's nft id amount=0, remove it from nft ids array, and set flag=false
     */
    function removeUserNftId(uint256 nftId) internal {
        NftSet storage nftSet = userNftIds[msg.sender];
        uint256[] storage ids = nftSet.ids;
        mapping(uint256 => bool) storage isIn = nftSet.isIn;
        require(ids.length > 0, "remove user nft ids, ids length must > 0");

        // find nftId index
        for (uint256 i = 0; i < ids.length; i++) {
            if (ids[i] == nftId) {
                ids[i] = ids[ids.length - 1];
                isIn[nftId] = false;
                ids.pop();
            }
        }
    }

    /**
     * Set apy of nft.
     *
     * Note: apy will be an integer value, 40 stands for 40%
     */
    function setApyByTokenId(uint256 id, uint8 apy) public onlyOwner {
        require(id > 0 && apy > 0, "setApyByTokenId: nft and apy must > 0");
        nftApys[id] = apy;
        emit NftApySet(id, apy, msg.sender);
    }

    /**
     * Check if nft id is in whitelist.
     * @param id The nft id.
     */
    function isInWhitelist(uint256 id) public view returns(bool) {
        return nftApys[id] > 0;
    }

    /**
     * Get user's total apy.
     *
     * Note: when umi token staked, base apy will be 12%; otherwise total apy will be 0.
     *
     * @param user The address of user.
     */
    function getTotalApyOfUser(address user) public view returns (uint256) {
        uint256 balanceOfUmi = balances[user];
        // if umi balance=0, the apy will be 0
        if (balanceOfUmi <= 0) {
            return 0;
        }
        uint256[] memory nftIds = getUserNftIds(user);
        // non nft staked, apy will be 12%
        if (nftIds.length <= 0) {
            return BASE_APY;
        }
        // totalApy
        uint256 totalApy = BASE_APY;
        // iter nftIds and calculate total apy
        for (uint256 i = 0; i < nftIds.length; i++) {
            uint256 nftId = nftIds[i];
            // get user balance of nft
            uint256 balance = nftBalances[user][nftId];
            // get apy of certain nft id
            uint256 apy = nftApys[nftId];
            totalApy = totalApy.add(balance.mul(apy));
        }
        return totalApy;
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

    /**
     * Init apys when deploy contract.
     */
    function initApys() internal onlyOwner {
        // category 1(total 3)
        nftApys[18] = 2;
        nftApys[19] = 2;
        nftApys[20] = 2;
        // category 2(total 27)
        nftApys[1] = 10;
        nftApys[2] = 10;
        nftApys[4] = 10;
        nftApys[5] = 10;
        nftApys[6] = 10;
        nftApys[7] = 10;
        nftApys[8] = 10;
        nftApys[9] = 10;
        nftApys[12] = 10;
        nftApys[13] = 10;
        nftApys[14] = 10;
        nftApys[15] = 10;
        nftApys[16] = 10;
        nftApys[22] = 10;
        nftApys[23] = 10;
        nftApys[24] = 10;
        nftApys[26] = 10;
        nftApys[27] = 10;
        nftApys[28] = 10;
        nftApys[29] = 10;
        nftApys[30] = 10;
        nftApys[31] = 10;
        nftApys[32] = 10;
        nftApys[33] = 10;
        nftApys[35] = 10;
        nftApys[36] = 10;
        nftApys[37] = 10;
        // category 3(total 4)
        nftApys[3] = 20;
        nftApys[11] = 20;
        nftApys[25] = 20;
        nftApys[34] = 20;
        // category 4(total 1)
        nftApys[17] = 30;
        // category 5(total 7)
        nftApys[38] = 40;
        nftApys[39] = 40;
        nftApys[40] = 40;
        nftApys[41] = 40;
        nftApys[42] = 40;
        nftApys[43] = 40;
        nftApys[44] = 40;
        // category 6(total 6)
        nftApys[45] = 80;
        nftApys[46] = 80;
        nftApys[47] = 80;
        nftApys[48] = 80;
        nftApys[49] = 80;
        nftApys[50] = 80;
    }
    
}