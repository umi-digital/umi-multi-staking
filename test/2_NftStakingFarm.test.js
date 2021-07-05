require("dotenv").config()
const { time } = require('@openzeppelin/test-helpers');
const UmiTokenMock = artifacts.require("UmiTokenMock");
const UmiERC1155 = artifacts.require("ERC1155Mock");
const NftStakingFarm = artifacts.require("NftStakingFarm");
const { assert } = require("chai");

require('chai')
    .use(require('chai-as-promised'))
    .should()

var BN = web3.utils.BN;

function ether(n) {
    return web3.utils.toWei(n, 'ether')
}

function parseWei2Ether(wei) {
    return web3.utils.fromWei(wei, 'ether')
}

contract('NftStakingFarm', async (accounts) => {
    const ONE_YEAR = new BN(31536000); // in seconds
    const TEN_DAYS = new BN(10 * 24 * 60 * 60);
    const ONE_DAYS = new BN(24 * 60 * 60);
    const TWO_YEARS = new BN(2 * 31536000)

    async function getBlockTimestamp(receipt) {
        return new BN((await web3.eth.getBlock(receipt.receipt.blockNumber)).timestamp);
    }

    let umiTokenMock
    let umiERC1155
    let nftStakingFarm

    before(async () => {
        umiTokenMock = await UmiTokenMock.new()
        umiERC1155 = await UmiERC1155.new('uri')
        nftStakingFarm = await NftStakingFarm.new(umiTokenMock.address, umiERC1155.address)
        console.log('UmiTokenMock is deployed to %s', umiTokenMock.address)
        console.log('UmiERC1155 is deployed to %s', umiERC1155.address)
        console.log('NftStakingFarm is deployed to %s', nftStakingFarm.address)
        // transfer 2000000000 UmiToken to account[1]
        await umiTokenMock.transfer(accounts[1], ether('2000000000'), { from: accounts[0] })
        // transfer 1000000000 UmiToken to account[2]
        await umiTokenMock.transfer(accounts[2], ether('1000000000'), { from: accounts[0] })
        // transfer 1000000000 UmiToken to account[3]
        await umiTokenMock.transfer(accounts[3], ether('1000000000'), { from: accounts[0] })

        // mint erc1155 token, each nft id mint 10
        await umiERC1155.mint(accounts[0], 1, 10, "0x1111", { from: accounts[0] });
        await umiERC1155.mint(accounts[0], 2, 10, "0x2222", { from: accounts[0] });
        await umiERC1155.mint(accounts[0], 3, 10, "0x3333", { from: accounts[0] });

        await umiERC1155.mint(accounts[2], 1, 10, "0x1111", { from: accounts[0] });
        await umiERC1155.mint(accounts[2], 2, 10, "0x2222", { from: accounts[0] });
        await umiERC1155.mint(accounts[2], 3, 10, "0x3333", { from: accounts[0] });

        await umiERC1155.mint(accounts[3], 1, 10, "0x1111", { from: accounts[0] });
        await umiERC1155.mint(accounts[3], 2, 10, "0x2222", { from: accounts[0] });
        await umiERC1155.mint(accounts[3], 3, 10, "0x3333", { from: accounts[0] });

        // mock, set apy of token
        await nftStakingFarm.setApyByTokenId(1, 10)
        await nftStakingFarm.setApyByTokenId(2, 20)
        await nftStakingFarm.setApyByTokenId(3, 30)
    })

    // test constructor
    describe('Test constructor', async () => {
        it('1st test, constructor should be set up correctly', async () => {
            // UmiToken address is correct
            const umiTokenAddress = await nftStakingFarm.umiToken();
            assert.equal(umiTokenAddress, umiTokenMock.address);
            // erc1155 address is correct
            const erc1155Address = await nftStakingFarm.nftContract()
            assert.equal(erc1155Address, umiERC1155.address)
        })

        it('2nd test, fail if _tokenAddress or _nftContract is incorrect', async () => {
            // 1. _tokenAddress incorrect
            let NftStakingFarmFailed = false;
            try {
                await NftStakingFarm.new(accounts[0], umiERC1155.address)
                assert.fail('NftStakingFarm constructor failed, _tokenAddress incorrect')
            } catch (e) {
                // console.log('_tokenAddress incorrect e=%s', e)
                NftStakingFarmFailed = true;
                assert.equal(NftStakingFarmFailed, true);
            }
            // 2. _nftContract incorrect
            try {
                await NftStakingFarm.new(umiTokenMock.address, accounts[0])
                assert.fail('NftStakingFarm constructor failed, _nftContract incorrect')
            } catch (e) {
                // console.log('_nftContract incorrect e=%s', e)
                NftStakingFarmFailed = true;
                assert.equal(NftStakingFarmFailed, true);
            }
        })
    })

    // test fundingContract, in order to pay the user rewards later 
    describe('Test fundingContract', async () => {

        before(async () => {
            // account[0] approve 10000 tokens to nftStakingFarm
            await umiTokenMock.approve(nftStakingFarm.address, ether('10000'), { from: accounts[0] })
            // account[1] approve 10000 tokens to nftStakingFarm
            await umiTokenMock.approve(nftStakingFarm.address, ether('10000'), { from: accounts[2] })
        })

        it('3rd test, fundingContract and UmiToken balance of the farming contract is correct', async () => {
            // 1. get nftStakingFarm UmiToken balance
            let nftStakingFarmBalance = await nftStakingFarm.getUmiBalance(nftStakingFarm.address)
            assert.equal(0, parseWei2Ether(nftStakingFarmBalance))
            // 2. account[0] fund 1000 to nftStakingFarm, balance will be 1000
            await nftStakingFarm.fundingContract(ether('1000'), { from: accounts[0] });
            nftStakingFarmBalance = await nftStakingFarm.getUmiBalance(nftStakingFarm.address)
            assert.equal(1000, parseWei2Ether(nftStakingFarmBalance))

            // 3. accounts[2] fund 1000 to nftStakingFarm, balance will be 2000
            await nftStakingFarm.fundingContract(ether('1000'), { from: accounts[2] });
            nftStakingFarmBalance = await nftStakingFarm.getUmiBalance(nftStakingFarm.address)
            assert.equal(2000, parseWei2Ether(nftStakingFarmBalance))

            // 4. get farming rewards by address, accounts[0] store 1000
            let account0FarmingRewards = await nftStakingFarm.funding(accounts[0])
            assert.equal(1000, parseWei2Ether(account0FarmingRewards))

            // 5. account[0] store another 1000 to nftStakingFarm, balance will be 2000
            await nftStakingFarm.fundingContract(ether('1000'), { from: accounts[0] });
            account0FarmingRewards = await nftStakingFarm.funding(accounts[0])
            assert.equal(2000, parseWei2Ether(account0FarmingRewards))
        })

        it('4th test, fundingContract incorrect, amount should be more than 0', async () => {
            let fundingContractFailed = false;
            try {
                await nftStakingFarm.fundingContract(0, { from: accounts[0] });
                assert.fail('fundingContract incorrect, amount should be more than 0')
            } catch (e) {
                // console.log('fundingContract 0 error %s', e)
                fundingContractFailed = true;
                assert.equal(fundingContractFailed, true, 'fundingContract incorrect, amount should be more than 0');
            }
        })

        it('5th, check total funding correct', async () => {
            let totalFunding = await nftStakingFarm.totalFunding();
            // console.log('check total funding totalFunding=%s', parseWei2Ether(totalFunding));
            assert.equal(3000, parseWei2Ether(totalFunding));
        })
    })

    // ********  Note: until now, totalFunding is 3000 ether  ********

    // test setBaseApy
    describe('Test setBaseApy', async () => {
        it('6th test, owner can set BASE_APY', async () => {
            await nftStakingFarm.setBaseApy(12, { from: accounts[0] });
        })

        it('7th test, can not set BASE_APY by non owner', async () => {
            let setAPYFailed = false;
            try {
                await nftStakingFarm.setBaseApy(12, { from: accounts[1] })
                assert.fail('set apy failed')
            } catch (e) {
                setAPYFailed = true;
                assert.equal(setAPYFailed, true, 'only owner can set apy');
            }
        })
    })

    // test stake
    describe('Test stake', async () => {
        // before stake, owner should approve nftStakingFarm contract
        before(async () => {
            // account[0] approve 10000 tokens to nftStakingFarm
            await umiTokenMock.approve(nftStakingFarm.address, ether('10000'), { from: accounts[0] })
        })

        // accounts[0] stake 1000 ether
        it('8th test, accounts[0] stake correct', async () => {
            // when not stake umi, apy is 0
            let totalApyOfAccount0 = await nftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApyOfAccount0, 0)
            let totalApyOfAccount1 = await nftStakingFarm.getTotalApyOfUser(accounts[1])
            assert.equal(totalApyOfAccount1, 0)

            // 1. check allowance first after approve
            let allowance = await umiTokenMock.allowance(accounts[0], nftStakingFarm.address)
            assert.equal(allowance, ether('10000'))
            // 2. stake 1000 to nftStakingFarm contract
            let receipt = await nftStakingFarm.stake(ether('1000'), { from: accounts[0] })
            // 3. check allowance again
            allowance = await umiTokenMock.allowance(accounts[0], nftStakingFarm.address)
            assert.equal(allowance, ether('9000'))
            // 4. stake success, check balance of accounts[0] in nftStakingFarm contract
            let account0Balance = await nftStakingFarm.balances(accounts[0])
            // console.log('8th test stake account0Balance=%s', BN(account0Balance).toString())
            assert.equal(account0Balance, ether('1000'))
            // 5. stake success, check principal of accounts[0] in nftStakingFarm contract
            let account0Principal = await nftStakingFarm.principal(accounts[0])
            // console.log('8th test stake account0Principal=%s', BN(account0Principal).toString())
            assert.equal(account0Principal, ether('1000'))
            // 6. stake success, check stakeDate of accounts[0]
            const timestamp = await getBlockTimestamp(receipt);
            let account0StakeDate = await nftStakingFarm.stakeDates(accounts[0])
            // console.log('8th stake success, timestamp=%s, account0StakeDate=%s', BN(timestamp).toString(), BN(account0StakeDate).toString())
            assert.equal(BN(timestamp).toString(), BN(account0StakeDate).toString())
            // 7. stake success, check total staked
            const totalStaked = await nftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 1000)
        })

        // stake incorrect with amount 0
        it('9th test, stake incorrect with amount=0', async () => {
            // 1. stake 0 UmiToken to nftStakingFarm contract, it will fail
            let stakeFailed = false;
            try {
                await nftStakingFarm.stake(0, { from: accounts[0] })
                assert.fail('stake fail with amount=0')
            } catch (e) {
                // console.log('9th test, e=%s', e)
                stakeFailed = true;
                assert.equal(stakeFailed, true, 'stake amount should be more than 0');
            }
        })

        // accounts[1] stake without approve, it will fail
        it('10th test, accounts[1] stake without approve, it will fail', async () => {
            // 1. check allowance of accounts[1]
            let allowance = await umiTokenMock.allowance(accounts[1], nftStakingFarm.address)
            assert.equal(0, allowance)
            // 2. stake from accounts[1]
            let stakeWithoutApproveFailed = false;
            try {
                await nftStakingFarm.stake(ether('100'), { from: accounts[1] })
                assert.fail('stake without approve')
            } catch (e) {
                stakeWithoutApproveFailed = true;
                assert.equal(stakeWithoutApproveFailed, true, 'stake fail without approve');
            }
            // 3. check total staked
            const totalStaked = await nftStakingFarm.totalStaked()
            assert.equal(1000, parseWei2Ether(totalStaked))
            // 4. stake fail, check balance of accounts[1] in nftStakingFarm contract, will be 0
            let account1Balance = await nftStakingFarm.balances(accounts[1])
            assert.equal(account1Balance, 0)
            // 5. stake fail, check principal of accounts[1] in nftStakingFarm contract, will be 0
            let account1Principal = await nftStakingFarm.principal(accounts[1])
            assert.equal(account1Principal, 0)
        })

        // accounts[1] stake 1000 ether success
        it('11th test, accounts[1] stake correct', async () => {
            // account[1] approve 10000 tokens to nftStakingFarm
            await umiTokenMock.approve(nftStakingFarm.address, ether('10000'), { from: accounts[1] })

            // 1. check allowance first after approve
            let allowance = await umiTokenMock.allowance(accounts[1], nftStakingFarm.address)
            assert.equal(allowance, ether('10000'))
            // 2. stake 1000 to nftStakingFarm contract
            let receipt = await nftStakingFarm.stake(ether('1000'), { from: accounts[1] })
            // 3. check allowance again
            allowance = await umiTokenMock.allowance(accounts[1], nftStakingFarm.address)
            assert.equal(allowance, ether('9000'))
            // 4. stake success, check balance of accounts[1] in nftStakingFarm contract
            let account1Balance = await nftStakingFarm.balances(accounts[1])
            // console.log('11th test stake account1Balance=%s', BN(account1Balance).toString())
            assert.equal(account1Balance, ether('1000'))
            // 5. stake success, check principal of accounts[1] in nftStakingFarm contract
            let account1Principal = await nftStakingFarm.principal(accounts[1])
            // console.log('11th test stake account1Principal=%s', BN(account1Principal).toString())
            assert.equal(account1Principal, ether('1000'))
            // 6. stake success, check stakeDate of accounts[1]
            const timestamp = await getBlockTimestamp(receipt);
            let account1StakeDate = await nftStakingFarm.stakeDates(accounts[1])
            // console.log('11th stake success, timestamp=%s, account1StakeDate=%s', BN(timestamp).toString(), BN(account1StakeDate).toString())
            assert.equal(BN(timestamp).toString(), BN(account1StakeDate).toString())
            // 7. stake success, check total staked
            const totalStaked = await nftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 2000)
        })

        // accounts[0] stake another 2000 ether
        it('12th test, accounts[0] stake correct', async () => {
            // 1. check allowance first after approve
            let allowance = await umiTokenMock.allowance(accounts[0], nftStakingFarm.address)
            assert.equal(allowance, ether('9000'))
            // 2. stake 2000 to nftStakingFarm contract
            let receipt = await nftStakingFarm.stake(ether('2000'), { from: accounts[0] })
            // 3. check allowance again
            allowance = await umiTokenMock.allowance(accounts[0], nftStakingFarm.address)
            assert.equal(allowance, ether('7000'))
            // 4. stake success, check balance of accounts[0] in nftStakingFarm contract
            let account0Balance = await nftStakingFarm.balances(accounts[0])
            // console.log('12th test stake account0Balance=%s', BN(account0Balance).toString())
            assert.equal(account0Balance, ether('3000'))
            // 5. stake success, check principal of accounts[0] in nftStakingFarm contract
            let account0Principal = await nftStakingFarm.principal(accounts[0])
            // console.log('12th test stake account0Principal=%s', BN(account0Principal).toString())
            assert.equal(account0Principal, ether('3000'))
            // 6. stake success, check stakeDate of accounts[0]
            const timestamp = await getBlockTimestamp(receipt);
            let account0StakeDate = await nftStakingFarm.stakeDates(accounts[0])
            // console.log('12th stake success, timestamp=%s, account0StakeDate=%s', BN(timestamp).toString(), BN(account0StakeDate).toString())
            assert.equal(BN(timestamp).toString(), BN(account0StakeDate).toString())
            // 7. stake success, check total staked
            const totalStaked = await nftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 4000)
        })

        // when just stake umi token, total apy of user is base_apy=12
        it('13th test, when just stake umi token, total apy of user is base_apy=12', async () => {
            let totalApyOfAccount0 = await nftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApyOfAccount0, 12)
            let totalApyOfAccount1 = await nftStakingFarm.getTotalApyOfUser(accounts[1])
            assert.equal(totalApyOfAccount1, 12)
        })

        // accounts[0] stake 1000 ether umi token after 10 days later, balance of user will update by adding interest
        it('14th test, accounts[0] stake 1000 ether after 10 days later, balance and stakeDate of user will updated', async () => {
            // 1. increase time to 10 days later
            // increase time for ten days later
            await time.increase(TEN_DAYS)
            // 2. before stake, check stakeDate of accounts[0]
            let account0StakeDateBeforeStake = await nftStakingFarm.stakeDates(accounts[0])
            // 3. before stake, check balance of accounts[0]
            let account0BalanceBeforeStake = await nftStakingFarm.balances(accounts[0])
            assert.equal(account0BalanceBeforeStake, ether('3000'))
            console.log('14th test, before stake, stakeDate=%s, balance=%s', account0StakeDateBeforeStake, parseWei2Ether(account0BalanceBeforeStake))
            // 4. stake 1000 to nftStakingFarm contract
            let receipt = await nftStakingFarm.stake(ether('1000'), { from: accounts[0] })
            // 5. after stake, check stateDate of accounts[0]
            let account0StakeDateAfterStake = await nftStakingFarm.stakeDates(accounts[0])
            // 6. after stake, check balance of accounts[0] in nftStakingFarm contract
            let account0BalanceAfterStake = await nftStakingFarm.balances(accounts[0])
            // 3000 ether after 10 days later, check interest
            console.log('14th test, 10 days later, stake another 1000, stakeDate=%s, balance=%s, principal=3000, apy=12%, timePassed=10 days, calculate interest=%s', account0StakeDateAfterStake, parseWei2Ether(account0BalanceAfterStake), parseWei2Ether(account0BalanceAfterStake) - parseWei2Ether(account0BalanceBeforeStake) - 1000)
            // 7. stake success, check principal of accounts[0] in nftStakingFarm contract
            let account0Principal = await nftStakingFarm.principal(accounts[0])
            assert.equal(account0Principal, ether('4000'))
            // 8. check total staked
            const totalStaked = await nftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 5000)
        })
    })

    // ********  Note: until now, accounts[0] staked 4000 ether, accounts[1] staked 1000 ether  ********

    // test unstake
    describe('Test unstake', async () => {
        // unstake accounts[0]'s balance
        it('15th test, unstake accounts[0] balance', async () => {
            // mock time pass
            await time.increase(1)
            // 1. before unstake, check balance of accounts[0]
            let account0BalanceBeforeUnstake = await nftStakingFarm.balances(accounts[0])
            // 2. before unstake, check total umi balance of accounts[0]'s 
            let account0TotalUmiBalanceBefore = await nftStakingFarm.getUmiBalance(accounts[0])
            console.log('15th test, before unstake, balance of accounts[0] in nftStakingFarm=%s, total umi balance=%s', parseWei2Ether(account0BalanceBeforeUnstake), parseWei2Ether(account0TotalUmiBalanceBefore))
            // 3. unstake
            await nftStakingFarm.unstake({ from: accounts[0] })
            // 4. after unstake, check balance of accounts[0]
            let account0BalanceAfterUnstake = await nftStakingFarm.balances(accounts[0])
            // 5. after unstake, check total umi balance of accounts[0]
            let account0TotalUmiBalanceAfter = await nftStakingFarm.getUmiBalance(accounts[0])
            console.log('15th test, after unstake, balance of accounts[0] in nftStakingFarm=%s, total umi balance=%s', parseWei2Ether(account0BalanceAfterUnstake), parseWei2Ether(account0TotalUmiBalanceAfter))
            // 6. unstake success, check principal of accounts[0] in nftStakingFarm contract
            let account0Principal = await nftStakingFarm.principal(accounts[0])
            // console.log('15th test stake account0Principal=%s', BN(account0Principal).toString())
            assert.equal(account0Principal, 0)
            // 7. check totalFunding
            let totalFunding = await nftStakingFarm.totalFunding();
            console.log('15th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));
            // 8. unstake success, check total staked
            const totalStaked = await nftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 1000)
        })

        // unstake with insufficient funds
        it('16th test, unstake incorrect, insufficient funds', async () => {
            let unstakeFail = false;
            try {
                await nftStakingFarm.unstake({ from: accounts[2] })
                assert.fail('unstake with insufficient funds')
            } catch (e) {
                // console.log('16th test, unstake with insufficient funds e=%s', e)
                unstakeFail = true;
                assert.equal(unstakeFail, true, 'unstake with insufficient funds');
            }
        })

        // total funding is not enough to pay interest, return capital of user
        // total funding now is 2990.122381645263827371 ether
        it('17th test, total funding is not enough to pay interest, just unstake capital without interest', async () => {
            // 1. approve 1000000, and stake 1000000 to mock total funding is not enough to pay interest case
            await umiTokenMock.approve(nftStakingFarm.address, ether('1000000'), { from: accounts[1] })
            // 2. stake 1000000 umiTokenMock to nftStakingFarm contract
            await nftStakingFarm.stake(ether('1000000'), { from: accounts[1] })
            // 3. increase time for two years, two years later, total funding is not enough to pay interest
            await time.increase(TWO_YEARS)
            // 4. before unstake, check balance of accounts[1]
            let account1BalanceBeforeUnstake = await nftStakingFarm.balances(accounts[1])
            // 5. before unstake, check total umi balance of accounts[1]
            let account1TotalUmiBalanceBefore = await nftStakingFarm.getUmiBalance(accounts[1])
            console.log('17th test, before unstake, balance of accounts[1] in nftStakingFarm=%s, total umi balance=%s', parseWei2Ether(account1BalanceBeforeUnstake), parseWei2Ether(account1TotalUmiBalanceBefore))
            // 6. unstake
            await nftStakingFarm.unstake({ from: accounts[1] })
            // 7. after unstake, check balance of accounts[1]
            let account1BalanceAfterUnstake = await nftStakingFarm.balances(accounts[1])
            // 8. after unstake, check total umi balance of accounts[1]
            let account1TotalUmiBalanceAfter = await nftStakingFarm.getUmiBalance(accounts[1])
            console.log('17th test, after unstake, balance of accounts[1] in nftStakingFarm=%s, total umi balance=%s', parseWei2Ether(account1BalanceAfterUnstake), parseWei2Ether(account1TotalUmiBalanceAfter))
            // 9. unstake success, check principal of accounts[1] in nftStakingFarm contract
            let account1Principal = await nftStakingFarm.principal(accounts[1])
            // console.log('17th test stake account1Principal=%s', BN(account1Principal).toString())
            assert.equal(account1Principal, 0)
            // 10. unstake success, check stateDate of accounts[1]
            let stakeDate = await nftStakingFarm.stakeDates(accounts[1])
            assert.equal(stakeDate, 0)
            // 11. check totalFunding, 2990.122381645263827371
            let totalFunding = await nftStakingFarm.totalFunding();
            // console.log('17th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));
            // 12. unstake success, check total staked
            const totalStaked = await nftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 0)
        })
    })

    // ********  Note: until now, totalStaked is 0  ********

    // test stakeNft
    describe('Test stakeNft', async () => {
        // stake nft without approve, it will fail
        it('18th test, stake nft without approve, it will fail', async () => {
            let stakeFail = false;
            try {
                await nftStakingFarm.stakeNft(1, 1, '0x1111', { from: accounts[0] })
                assert.fail('ERC1155: caller is not owner nor approved')
            } catch (e) {
                // console.log('18th test, stake nft error e=%s', e)
                stakeFail = true;
                assert.equal(stakeFail, true, 'ERC1155: caller is not owner nor approved');
            }
        })

        it('19th test, stake nft correct', async () => {
            // 1. before stake nft, setApprovalForAll
            await umiERC1155.setApprovalForAll(nftStakingFarm.address, true, { from: accounts[0] });
            // 2. check user's total nft balance
            let nftIdBalance = await nftStakingFarm.getNftBalance(accounts[0], 1);
            assert.equal(nftIdBalance, 10)
            // 3. stake nft
            await nftStakingFarm.stakeNft(1, 1, '0x1111', { from: accounts[0] })
            // 4. stake success, check balance of nft token
            let amount = await nftStakingFarm.nftBalances(accounts[0], 1)
            // console.log('19th test, amount of nft id 1=%s', amount)
            assert.equal(amount, 1)
            // 5. check total nft staked
            let totalNftStaked = await nftStakingFarm.totalNftStaked()
            assert.equal(totalNftStaked, 1)
            // 6. check nft id array of user, will be 1
            let idArray = await nftStakingFarm.getUserNftIds(accounts[0])
            // console.log('19th test, idArray=%s', String(idArray))
            assert.equal(String(idArray), '1')
            // 7. stake 2, id array will be 1,2
            await nftStakingFarm.stakeNft(2, 1, '0x1111', { from: accounts[0] })
            idArray = await nftStakingFarm.getUserNftIds(accounts[0])
            // console.log('19th test, idArray=%s', String(idArray))
            assert.equal(String(idArray), '1,2')
            // 8. stake another 1, id array will also be 1,2
            await nftStakingFarm.stakeNft(1, 1, '0x1111', { from: accounts[0] })
            idArray = await nftStakingFarm.getUserNftIds(accounts[0])
            // console.log('19th test, idArray=%s', String(idArray))
            assert.equal(String(idArray), '1,2')
            // 9. check user's total nft balance again, will be 8
            nftIdBalance = await nftStakingFarm.getNftBalance(accounts[0], 1);
            assert.equal(nftIdBalance, 8)
            // 10. with no umi token staked, totalApyOf will be 0
            let totalApyOfAccount0 = await nftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApyOfAccount0, 0)
        })

        it('20th test, stake nft incorrect, nft id not in whitelist', async () => {
            // before stake nft, setApprovalForAll
            await umiERC1155.setApprovalForAll(nftStakingFarm.address, true, { from: accounts[0] });
            let stakeNftFailed = false;
            try {
                // stake nft
                await nftStakingFarm.stakeNft(1, 1000, '0x1111', { from: accounts[0] })
                assert.fail('stake fail, nft id not in whitelist')
            } catch (e) {
                // console.log('20th test, e=%s', e)
                stakeNftFailed = true;
                assert.equal(stakeNftFailed, true, 'stake fail, nft id not in whitelist');
            }
        })
    })

    // ********  Note: until now, accounts[0] staked 2 tokens whose nft id is 1, staked 1 token whose nft id is 2  ********

    // test batchStakeNfts
    describe('Test batchStakeNfts', async () => {
        it('21th test, batchStakeNfts incorrect, nft id not in whitelist', async () => {
            // before stake nft, setApprovalForAll
            await umiERC1155.setApprovalForAll(nftStakingFarm.address, true, { from: accounts[0] });
            let stakeNftFailed = false;
            try {
                // batch stake nft
                await nftStakingFarm.batchStakeNfts([1001], [1], '0x1111')
                assert.fail('batchStakeNfts fail, nft id not in whitelist')
            } catch (e) {
                // console.log('21th test, e=%s', e)
                stakeNftFailed = true;
                assert.equal(stakeNftFailed, true, 'batchStakeNfts fail, nft id not in whitelist');
            }
        })

        // accounts[0] stake staked 1 tokens whose nft id is 1, stake 2 token whose nft id is 2
        it('22th test, accounts[0] call batchStakeNfts correct', async () => {
            // 1. before stake nft, setApprovalForAll
            await umiERC1155.setApprovalForAll(nftStakingFarm.address, true, { from: accounts[0] });
            // 2. stake staked 1 tokens whose nft id is 1, stake 2 token whose nft id is 2
            await nftStakingFarm.batchStakeNfts([1, 2], [1, 2], '0x1111')
            // 3. stake success, check balance of nft token
            let amount = await nftStakingFarm.nftBalances(accounts[0], 1)
            // console.log('22th test, amount of nft id 1 = %s', amount)
            assert.equal(amount, 3)
            amount = await nftStakingFarm.nftBalances(accounts[0], 2)
            // console.log('22th test, amount of nft id 2 = %s', amount)
            assert.equal(amount, 3)
        })
    })

    // ****  Note: until now, accounts[0] staked 3 tokens whose nft id is 1, staked 3 token whose nft id is 2  ****

    // test unstakeNft
    describe('Test unstakeNft', async () => {
        // unstake 1 token whose nft id is 1, unstake 1 token whose nft id is 2
        it('23th test, accounts[0] unstake nft correct', async () => {
            // 1. before stake nft, setApprovalForAll
            await umiERC1155.setApprovalForAll(nftStakingFarm.address, true, { from: accounts[0] });
            // 2. unstake 1 token whose nft id is 1
            await nftStakingFarm.unstakeNft(1, 1, '0x1111')
            // 3. unstake success, check balance of nft token 1
            let amount = await nftStakingFarm.nftBalances(accounts[0], 1)
            // console.log('23th test, amount of nft id 1 = %s', amount)
            assert.equal(amount, 2)
            // 4. unstake 1 token whose nft id is 2
            await nftStakingFarm.unstakeNft(2, 1, '0x1111')
            // 5. unstake success, check balance of nft token 2
            amount = await nftStakingFarm.nftBalances(accounts[0], 2)
            // console.log('23th test, amount of nft id 2 = %s', amount)
            assert.equal(amount, 2)
            // 6. check total nft staked
            let totalNftStaked = await nftStakingFarm.totalNftStaked()
            assert.equal(totalNftStaked, 4)
        })
    })

    // ****  Note: until now, accounts[0] staked 2 tokens whose nft id is 1, staked 2 token whose nft id is 2  ****

    // test batchUnstakeNfts
    describe('Test batchUnstakeNfts', async () => {
        // batch unstake nfts ids: [1,2] values:[1,1]
        it('24th test, batchUnstakeNfts correct', async () => {
            // 1. before stake nft, setApprovalForAll
            await umiERC1155.setApprovalForAll(nftStakingFarm.address, true, { from: accounts[0] });
            // 2. batch unstake ntfs
            await nftStakingFarm.batchUnstakeNfts([1, 2], [1, 1], '0x1111', { from: accounts[0] })
            // 3. unstake success, check balance of nft token 1
            let amount = await nftStakingFarm.nftBalances(accounts[0], 1)
            // console.log('24th test, amount of nft id 1 = %s', amount)
            assert.equal(amount, 1)
            // 4. check balance of nft token 2
            amount = await nftStakingFarm.nftBalances(accounts[0], 2)
            // console.log('24th test, amount of nft id 2 = %s', amount)
            assert.equal(amount, 1)
            // 5. check user's total nft balance
            let nftIdBalance = await nftStakingFarm.getNftBalance(accounts[0], 1);
            assert.equal(nftIdBalance, 9)
            nftIdBalance = await nftStakingFarm.getNftBalance(accounts[0], 2);
            assert.equal(nftIdBalance, 9)
        })
    })

    // ****  Note: until now, accounts[0] staked 1 token whose nft id is 1, staked 1 token whose nft id is 2  ****

    // test getUmiBalance by address
    describe('Test getUmiBalance', async () => {
        it('25th test, getUmiBalance correct', async () => {
            let banlance0 = await nftStakingFarm.getUmiBalance(accounts[0])
            let banlance1 = await nftStakingFarm.getUmiBalance(accounts[1])
            assert.equal(2000000000, parseWei2Ether(banlance1))
            let banlance2 = await nftStakingFarm.getUmiBalance(accounts[2])
            assert.equal(999999000, parseWei2Ether(banlance2))
            // console.log('25th test, accounts[0] balance=%s, accounts[1] balance=%s, accounts[2] balance=%s,', parseWei2Ether(banlance0), parseWei2Ether(banlance1), parseWei2Ether(banlance2))
        })
    })

    // test getNftBalance
    describe('Test getNftBalance', async () => {
        it('26th test, get total nft balance of user correct', async () => {
            // nftId=1, value=9
            let nftIdBalance = await nftStakingFarm.getNftBalance(accounts[0], 1);
            assert.equal(nftIdBalance, 9)
            // nftId=2, value=9
            nftIdBalance = await nftStakingFarm.getNftBalance(accounts[0], 2);
            assert.equal(nftIdBalance, 9)
            // nftId=3, value=10
            nftIdBalance = await nftStakingFarm.getNftBalance(accounts[0], 3);
            assert.equal(nftIdBalance, 10)
        })
    })

    // test getUserNftIds
    describe('Test getUserNftIds', async () => {
        it('27th test, getUserNftIds correct', async () => {
            let idArray = [];
            idArray = await nftStakingFarm.getUserNftIds(accounts[0])
            // console.log('27th test, idArray=%s', String(idArray))
            assert.equal(String(idArray), '1,2')
        })
    })

    // test getUserNftIdsLength
    describe('Test getUserNftIdsLength', async () => {
        it('28th test, getUserNftIdsLength correct', async () => {
            // 1. accounts[0] userNftIds.ids array length is 2
            let length = await nftStakingFarm.getUserNftIdsLength(accounts[0])
            // console.log('28th test, accounts[0] userNftIds.ids array length is %s ', length)
            assert.equal(2, length)
            // 2. accounts[1] userNftIds.ids array length is 0
            length = await nftStakingFarm.getUserNftIdsLength(accounts[1])
            // console.log('28th test, accounts[1] userNftIds.ids array length is %s ', length)
            assert.equal(0, length)
        })
    })

    // test isNftIdExist, check whether user's nft id is exist
    describe('Test isNftIdExist', async () => {
        it('29th test, check isNftIdExist correct', async () => {
            // 1. accounts[0] have token whose nft id is 1
            let isNftIdExist = await nftStakingFarm.isNftIdExist(accounts[0], 1)
            assert.equal(true, isNftIdExist)
            // 2. accounts[0] have token whose nft id is 2
            isNftIdExist = await nftStakingFarm.isNftIdExist(accounts[0], 2)
            assert.equal(true, isNftIdExist)
            // 3. accounts[0] donot have token whose nft id is 3
            isNftIdExist = await nftStakingFarm.isNftIdExist(accounts[0], 3)
            assert.equal(false, isNftIdExist)
            // 4. accounts[1] donot have token whose nft id is 1
            isNftIdExist = await nftStakingFarm.isNftIdExist(accounts[1], 1)
            assert.equal(false, isNftIdExist)
        })
    })

    // test setApyByTokenId
    describe('Test setApyByTokenId', async () => {
        it('30th test, check setApyByTokenId correct', async () => {
            // 1. get apy of nft id 1
            let apy = await nftStakingFarm.nftApys(1)
            // console.log('30th test, apy of nftId1=%s', apy)
            assert.equal(10, apy)
            // 2. get apy of nft id 2
            apy = await nftStakingFarm.nftApys(2)
            // console.log('30th test, apy of nftId2=%s', apy)
            assert.equal(20, apy)
            // 3. get apy of nft id 3
            apy = await nftStakingFarm.nftApys(3)
            // console.log('30th test, apy of nftId3=%s', apy)
            assert.equal(30, apy)
            // 4. modify apy of nft id 1
            await nftStakingFarm.setApyByTokenId(1, 15)
            // 5. get apy of nft id 1 again, check if set correct
            apy = await nftStakingFarm.nftApys(1)
            // console.log('30th test, apy of nftId1=%s', apy)
            assert.equal(15, apy)
        })

        it('31th test, can not call setApyByTokenId by non owner', async () => {
            let setApyFailed = false;
            try {
                await nftStakingFarm.setApyByTokenId(1, 10, { from: accounts[1] })
                assert.fail('non owner call setApyByTokenId failed')
            } catch (e) {
                // console.log('31th test, non owner call setApyByTokenId failed e=', e)
                setApyFailed = true;
                assert.equal(setApyFailed, true, 'non owner call setApyByTokenId failed');
            }
        })

        it('32th test, nft and apy must>0', async () => {
            let setApyFailed = false;
            try {
                await nftStakingFarm.setApyByTokenId(0, 10, { from: accounts[0] })
                assert.fail('nft=0 case, nft and apy must>0')
            } catch (e) {
                // console.log('32th test, nft=0 case, nft and apy must>0 e=', e)
                setApyFailed = true;
                assert.equal(setApyFailed, true, 'nft=0 case, nft and apy must>0');
            }

            let setApyFailed2 = false;
            try {
                await nftStakingFarm.setApyByTokenId(1, 0, { from: accounts[0] })
                assert.fail('apy=0 case, nft and apy must>0')
            } catch (e) {
                // console.log('32th test, apy=0 case, nft and apy must>0 e=', e)
                setApyFailed2 = true;
                assert.equal(setApyFailed2, true, 'apy=0 case, nft and apy must>0');
            }
        })
    })

    // test getTotalApyOfUser
    // Note: when umi token staked, base apy will be 12%; otherwise total apy will be 0. total apy will change when nft stake or unstake
    describe('Test getTotalApyOfUser', async () => {
        it('33th test, no umi token staked, total apy of user is 0', async () => {
            // 1. get principal of accounts[0] in nftStakingFarm contract
            let principal = await nftStakingFarm.principal(accounts[0])
            // console.log('33th test, principal of accounts[0] is %s', parseWei2Ether(principal))
            assert.equal(principal, 0)
            // 2. get balance of accounts[0] in nftStakingFarm contract
            let balance = await nftStakingFarm.balances(accounts[0])
            // console.log('33th test, balance of accounts[0] is %s', parseWei2Ether(balance))
            assert.equal(balance, 0)
            // 3. get stakeDate of accounts[0]
            let stakeDate = await nftStakingFarm.stakeDates(accounts[0])
            // console.log('33th test, stake date of accounts[0] is %s', stakeDate)
            assert.equal(stakeDate, 0)
            // *** make sure no umi token staked in nftStakingFarm contract
            // 4. check total apy of accounts[0], it will be 0
            let totalApy = await nftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApy, 0)

            // 5. batch unstake nft of accounts[0]
            await nftStakingFarm.batchUnstakeNfts([1, 2], [1, 1], '0x1111', { from: accounts[0] })
            // 6. check amount of nft id 1
            let amount = await nftStakingFarm.nftBalances(accounts[0], 1)
            assert.equal(amount, 0)
            amount = await nftStakingFarm.nftBalances(accounts[0], 2)
            assert.equal(amount, 0)
        })

        // stake umi token, base apy will be 12
        it('34th test, stake umi token, then check total apy', async () => {
            // 1. account[0] approve 10000 tokens to nftStakingFarm
            await umiTokenMock.approve(nftStakingFarm.address, ether('10000'), { from: accounts[0] })
            // 2. stake 1000 ether to nftStakingFarm
            let receipt = await nftStakingFarm.stake(ether('1000'), { from: accounts[0] })
            // 3. stake success, check balance of accounts[0] in nftStakingFarm contract
            let account0Balance = await nftStakingFarm.balances(accounts[0])
            // console.log('34th test stake account0Balance=%s', parseWei2Ether(account0Balance))
            assert.equal(account0Balance, ether('1000'))
            // 4. stake success, check principal of accounts[0] in nftStakingFarm contract
            let account0Principal = await nftStakingFarm.principal(accounts[0])
            // console.log('34th test stake account0Principal=%s',  parseWei2Ether(account0Principal))
            assert.equal(account0Principal, ether('1000'))
            // 5. stake success, check stakeDate of accounts[0]
            const timestamp = await getBlockTimestamp(receipt);
            let account0StakeDate = await nftStakingFarm.stakeDates(accounts[0])
            // console.log('34th stake success, timestamp=%s, account0StakeDate=%s', BN(timestamp).toString(), BN(account0StakeDate).toString())
            assert.equal(BN(timestamp).toString(), BN(account0StakeDate).toString())
            // 6. stake success, check total staked
            const totalStaked = await nftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 1000)
            // *** stake umi success ***
            // 7. check total apy now, it will be 12
            let totalApy = await nftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApy, 12)
        })

        // stake nft, total apy will change
        it('35th test, stake nft, total apy is correct', async () => {
            // total apy of accounts[0] is 12 now, stake nft
            // 1. change apy of nftId1 to 10
            await nftStakingFarm.setApyByTokenId(1, 10)
            // 2. check apy of nft id 1
            let apyOfNftId1 = await nftStakingFarm.nftApys(1)
            // console.log('35th test, apyOfNftId1=%s', apyOfNftId1)
            assert.equal(apyOfNftId1, 10)
            // 3. stake 1 nft id 1
            await nftStakingFarm.stakeNft(1, 1, '0x111')
            // 4. after stake nft, check total apy again, it will be 22
            let totalApy = await nftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApy, 22)
            // 5. stake 1 more nftId1, it will be 32
            await nftStakingFarm.stakeNft(1, 1, '0x111')
            totalApy = await nftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApy, 32)
            // 6. batch stake nft, check total apy 32 + 2*10 + 4 * 20=132
            await nftStakingFarm.batchStakeNfts([1, 2], [2, 4], '0x1111')
            totalApy = await nftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApy, 132)
        })

        // ****  Note: until now, accounts[0] staked 4 token whose nft id is 1, staked 4 token whose nft id is 2  ****
        it('36th test, unstake nft, total apy is correct', async () => {
            // 1. unstake 1 nftId1, total apy will be 122
            await nftStakingFarm.unstakeNft(1, 1, '0x1111')
            let totalApy = await nftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApy, 122)
            // 2. batch unstake all of nft, total apy will be 12 again
            await nftStakingFarm.batchUnstakeNfts([1, 2], [3, 4], '0x1111', { from: accounts[0] })
            totalApy = await nftStakingFarm.getTotalApyOfUser(accounts[0])
            assert.equal(totalApy, 12)
        })

    })

    // ****  Note: until now, no nft staked  ****

    // test pause and unpause
    describe('Test pause and unpause', async () => {
        // before stake, owner should approve nftStakingFarm contract
        before(async () => {
            // account[0] approve 10000 tokens to nftStakingFarm
            await umiTokenMock.approve(nftStakingFarm.address, ether('10000'), { from: accounts[0] })
        })

        it('37th test, pause,unpause incorrect, only owner can call them', async () => {
            let pauseFailed = false;
            try {
                await nftStakingFarm.pause({ from: accounts[1] });
                assert.fail('pause incorrect, only owner can call pause')
            } catch (e) {
                // console.log('37th test, pauseFailed e=%s', e)
                pauseFailed = true;
                assert.equal(pauseFailed, true, 'pause incorrect, only owner can call pause');
            }

            let unpauseFailed = false;
            try {
                await nftStakingFarm.unpause({ from: accounts[1] });
                assert.fail('unpause incorrect, only owner can call unpause')
            } catch (e) {
                // console.log('37th test, unpauseFailed e=%s', e)
                unpauseFailed = true;
                assert.equal(unpauseFailed, true, 'unpause incorrect, only owner can call unpause');
            }
        })

        it('38th test, stake will be failed when paused, it will be success when unpaused', async () => {
            // 1. before stake, pause
            await nftStakingFarm.pause({ from: accounts[0] });
            // 2. check paused state
            let pausedState = await nftStakingFarm.paused()
            // console.log('38th test, pause pausedState %s', pausedState)
            assert.equal(pausedState, true)
            // 3. stake 1000 umiTokenMock to nftStakingFarm contract, it will fail
            let stakeFailed = false;
            try {
                await nftStakingFarm.stake(ether('1000'), { from: accounts[0] })
                assert.fail('stake incorrect, paused')
            } catch (e) {
                // console.log('38th test stake incorrect e=%s', e)
                stakeFailed = true;
                assert.equal(stakeFailed, true, 'stake incorrect, paused');
            }
            // 4. check balance of accounts[0] in nftStakingFarm contract
            let account0Balance = await nftStakingFarm.balances(accounts[0])
            // console.log('38th test stake account0Balance=%s', parseWei2Ether(account0Balance))
            assert.equal(account0Balance, ether('1000'))
            // 5. check principal of accounts[0] in nftStakingFarm contract
            let account0Principal = await nftStakingFarm.principal(accounts[0])
            // console.log('38th test stake account0Principal=%s',  parseWei2Ether(account0Principal))
            assert.equal(account0Principal, ether('1000'))
            // 6. unpause, and stake again
            await nftStakingFarm.unpause({ from: accounts[0] });
            // check pause state
            pausedState = await nftStakingFarm.paused()
            // console.log('38th test, pause pausedState %s', pausedState)
            // stake again
            await nftStakingFarm.stake(ether('1000'), { from: accounts[0] })
            // 7. check balance and principal again
            account0Balance = await nftStakingFarm.balances(accounts[0])
            assert.equal(account0Balance, ether('2000'))
            account0Principal = await nftStakingFarm.principal(accounts[0])
            assert.equal(account0Principal, ether('2000'))
        })

        it('39th test, unstake will be failed when paused, it will be success when unpaused', async () => {
            // 1. before unstake, pause
            await nftStakingFarm.pause({ from: accounts[0] });
            // 2. check paused state
            let pausedState = await nftStakingFarm.paused()
            // console.log('39th test, pause pausedState %s', pausedState)
            assert.equal(pausedState, true)
            // 3. unstake, it will fail when paused
            let unstakeFailed = false;
            try {
                await nftStakingFarm.unstake({ from: accounts[0] });
                assert.fail('unstake incorrect, paused')
            } catch (e) {
                // console.log('39th test, unstake will be failed when paused e=%s', e)
                unstakeFailed = true;
                assert.equal(unstakeFailed, true, 'unstake incorrect, paused');
            }
            // 4. unpause, and unstake
            // mock time pass
            await time.increase(1)
            await nftStakingFarm.unpause({ from: accounts[0] });
            // check paused state
            pausedState = await nftStakingFarm.paused()
            // console.log('39th test, unpause pausedState %s', pausedState)
            assert.equal(pausedState, false)
            // 5. unstake again
            await nftStakingFarm.unstake({ from: accounts[0] });
            // 6. check balance of accounts[0] in nftStakingFarm contract
            let account0Balance = await nftStakingFarm.balances(accounts[0])
            // console.log('39th test stake account0Balance=%s', parseWei2Ether(account0Balance))
            assert.equal(account0Balance, 0)
            // 7. check principal of accounts[0] in nftStakingFarm contract
            let account0Principal = await nftStakingFarm.principal(accounts[0])
            // console.log('39th test stake account0Principal=%s',  parseWei2Ether(account0Principal))
            assert.equal(account0Principal, 0)
        })

        it('40th test, stakeNft will be failed when paused, it will be success when unpaused', async () => {
            // 1. before stakeNft, pause
            await nftStakingFarm.pause({ from: accounts[0] });
            // 2. stakeNft, it will fail when paused
            let stakeNftFailed = false;
            try {
                await nftStakingFarm.stakeNft(1, 1, '0x1111', { from: accounts[0] })
                assert.fail('stakeNftFailed incorrect, paused')
            } catch (e) {
                // console.log('40th test, stakeNftFailed will be failed when paused e=%s', e)
                stakeNftFailed = true;
                assert.equal(stakeNftFailed, true, 'stakeNftFailed incorrect, paused');
            }
            // 3. check balance of nft token
            let amount = await nftStakingFarm.nftBalances(accounts[0], 1)
            // console.log('40th test, amount of nftId1=%s', amount)
            assert.equal(amount, 0)
            // 4. unpause and stakeNft again
            // mock time pass
            await time.increase(1)
            await nftStakingFarm.unpause({ from: accounts[0] });
            // stake nft again, it will success
            await nftStakingFarm.stakeNft(1, 1, '0x1111', { from: accounts[0] })
            amount = await nftStakingFarm.nftBalances(accounts[0], 1)
            // console.log('40th test, amount of nftId1=%s', amount)
            assert.equal(amount, 1)
        })
    })

    // full test for stake, stakeNft, batchStakeNfts, unstake, unstakeNft, batchUnstakeNfts
    describe('Full test for accounts[2]', async () => {
        before(async () => {
            // account[2] approve 10000 tokens to nftStakingFarm
            await umiTokenMock.approve(nftStakingFarm.address, ether('10000'), { from: accounts[2] })
            // before stake nft, setApprovalForAll
            await umiERC1155.setApprovalForAll(nftStakingFarm.address, true, { from: accounts[2] });
        })

        it('41th test, stake twice and unstake, without nft', async () => {
            // 1. check balance, principal, total staked
            let balance = await nftStakingFarm.balances(accounts[2])
            assert.equal(balance, 0)
            let principal = await nftStakingFarm.principal(accounts[2])
            assert.equal(principal, 0)
            let totalStaked = await nftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 0)
            // 2. stake 1000 ether
            let receipt = await nftStakingFarm.stake(ether('1000'), { from: accounts[2] })
            // 3. check balance, principal, total staked again
            balance = await nftStakingFarm.balances(accounts[2])
            assert.equal(balance, ether('1000'))
            principal = await nftStakingFarm.principal(accounts[2])
            assert.equal(principal, ether('1000'))
            totalStaked = await nftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 1000)
            // 4. stake success, check stakeDate of accounts[2]
            let timestamp = await getBlockTimestamp(receipt);
            let stakeDate = await nftStakingFarm.stakeDates(accounts[2])
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())

            // 5. increase 10 days
            await time.increase(TEN_DAYS)

            // 6. stake another 1000
            receipt = await nftStakingFarm.stake(ether('1000'), { from: accounts[2] })
            // 7. check balance, principal, total staked again
            // balance will more than 2000 ether
            balance = await nftStakingFarm.balances(accounts[2])
            console.log('41th test, stake 1000, 10 days later, stake another 1000 balance=%s', parseWei2Ether(balance))
            console.log('41th test, balance=1000, apy=12%, timePassed=10 days, calculate interest=%s', parseWei2Ether(balance) - 2000)
            // Notice:  balance=1000, apy=12%, timePassed=10 days, calculate interest= 3.292539451578724209
            assert.equal(parseWei2Ether(balance), 2003.292539451578724209)
            principal = await nftStakingFarm.principal(accounts[2])
            assert.equal(principal, ether('2000'))
            totalStaked = await nftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 2000)
            // 8. stake success, check stakeDate of accounts[2]
            timestamp = await getBlockTimestamp(receipt)
            stakeDate = await nftStakingFarm.stakeDates(accounts[2])
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())

            // 9. now balance of accounts[2] is 2003.292539451578724209, unstake after ten days later, increase time
            await time.increase(TEN_DAYS)

            // 10. before unstake, check total umi balance of accounts[2]
            let balanceBeforeUnstake = await nftStakingFarm.balances(accounts[2])
            let totalUmiBalanceBefore = await nftStakingFarm.getUmiBalance(accounts[2])
            console.log('41th test, another 10 days later, before unstake, balance of accounts[2] in nftStakingFarm=%s, total umi balance=%s', parseWei2Ether(balanceBeforeUnstake), parseWei2Ether(totalUmiBalanceBefore))
            // 11. unstake
            await nftStakingFarm.unstake({ from: accounts[2] })
            // 12. after unstake, check balance of accounts[2]
            let balanceAfterUnstake = await nftStakingFarm.balances(accounts[2])
            // 13. after unstake, check total umi balance of accounts[2]
            let totalUmiBalanceAfter = await nftStakingFarm.getUmiBalance(accounts[2])
            console.log('41th test, another 10 days later, after unstake, balance of accounts[2] in nftStakingFarm=%s, total umi balance=%s', parseWei2Ether(balanceAfterUnstake), parseWei2Ether(totalUmiBalanceAfter))
            console.log('41th test, balance=2003.292539451578724209, apy=12%, timePassed=10 days, calculate interest=%s', parseWei2Ether(totalUmiBalanceAfter) - parseWei2Ether(totalUmiBalanceBefore) - 2003.292539451578724209)
            // 14. unstake success, check principal of accounts[2] in nftStakingFarm contract
            principal = await nftStakingFarm.principal(accounts[2])
            assert.equal(principal, 0)
            totalStaked = await nftStakingFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 0)
            // 15. check total funding
            let totalFunding = await nftStakingFarm.totalFunding();
            console.log('41th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));
            // 16. no umi token to unstake, revert with insufficient funds
            let unstakeFail = false;
            try {
                await nftStakingFarm.unstake({ from: accounts[2] })
                assert.fail('unstake with insufficient funds')
            } catch (e) {
                // console.log('41th test, unstake with insufficient funds e=%s', e)
                unstakeFail = true;
                assert.equal(unstakeFail, true, 'unstake with insufficient funds');
            }
        })

        it('42th test, stake, unstake with nft apy boosters', async () => {
            // 1. check balance, principal
            let balance = await nftStakingFarm.balances(accounts[2])
            assert.equal(balance, 0)
            let principal = await nftStakingFarm.principal(accounts[2])
            assert.equal(principal, 0)
            // 2. check total apy of accounts[2]
            let totalApy = await nftStakingFarm.getTotalApyOfUser(accounts[2])
            assert.equal(totalApy, 0)
            // 3. stake 1000 ether
            let receipt = await nftStakingFarm.stake(ether('1000'), { from: accounts[2] })
            // 4. check balance, principal, total apy again
            balance = await nftStakingFarm.balances(accounts[2])
            assert.equal(balance, ether('1000'))
            principal = await nftStakingFarm.principal(accounts[2])
            assert.equal(principal, ether('1000'))
            totalApy = await nftStakingFarm.getTotalApyOfUser(accounts[2])
            assert.equal(totalApy, 12)
            // 5. stake success, check stakeDate of accounts[2]
            let timestamp = await getBlockTimestamp(receipt);
            let stakeDate = await nftStakingFarm.stakeDates(accounts[2])
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())

            // 6. check apy of nft
            let apy = await nftStakingFarm.nftApys(1)
            // [nft,apy]->[1,10]
            assert.equal(apy, 10)
            apy = await nftStakingFarm.nftApys(2)
            // [nft,apy]->[2,20]
            assert.equal(apy, 20)
            apy = await nftStakingFarm.nftApys(3)
            // [nft,apy]->[3,40]
            assert.equal(apy, 30)

            // until now, staked 1000 in contract

            // 7. increase time(one year later)
            await time.increase(ONE_YEAR)

            // 8. one year later, stake nft, total apy, balance will change
            // staked 1 token whose nft id is 1, its apy=10
            await nftStakingFarm.stakeNft(1, 1, '0x1111', { from: accounts[2] })
            // 9. check nft ids array, if nft id exist, total apy
            let idArray = await nftStakingFarm.getUserNftIds(accounts[2])
            assert.equal(String(idArray), '1')
            let ifNftIdExist = await nftStakingFarm.isNftIdExist(accounts[2], 1)
            assert.equal(ifNftIdExist, true)
            // total apy will be 22
            totalApy = await nftStakingFarm.getTotalApyOfUser(accounts[2])
            assert.equal(totalApy, 22)

            // 10. principal=1000, apy=12%, timePassed=1 year
            balance = await nftStakingFarm.balances(accounts[2])
            console.log('42th test, balance=1000, apy=12%, timePassed=1 year, then new balance=%s, interest=%s', parseWei2Ether(balance), parseWei2Ether(balance) - 1000)
            principal = await nftStakingFarm.principal(accounts[2])
            assert.equal(principal, ether('1000'))

            // 11. another one year later
            await time.increase(ONE_YEAR)
            // *** until now, balance=1127.47461563840261, total apy=22%, stake 1 more nft
            // 11. staked 1 more token whose nft id is 1, its apy=10
            await nftStakingFarm.stakeNft(1, 1, '0x1111', { from: accounts[2] })
            // 12. check nft ids array, if nft id exist, total apy again
            idArray = await nftStakingFarm.getUserNftIds(accounts[2])
            // id array will still be 1
            assert.equal(String(idArray), '1')
            ifNftIdExist = await nftStakingFarm.isNftIdExist(accounts[2], 1)
            assert.equal(ifNftIdExist, true)
            // total apy will be 32
            totalApy = await nftStakingFarm.getTotalApyOfUser(accounts[2])
            assert.equal(totalApy, 32)

            // 13. check balance, principal again
            balance = await nftStakingFarm.balances(accounts[2])
            console.log('42th test, balance=1127.47461563840261, apy=22%, timePassed=1 year, then new balance=%s, interest=%s', parseWei2Ether(balance), parseWei2Ether(balance) - 1127.47461563840261)
            principal = await nftStakingFarm.principal(accounts[2])
            assert.equal(principal, ether('1000'))

            // until now, balance=1404.826775260024370288, total apy=32%, stake 1000 umi again
            // 14. one year later
            await time.increase(ONE_YEAR)
            // 15. stake 1000 umi
            receipt = await nftStakingFarm.stake(ether('1000'), { from: accounts[2] })
            // 16. check balance, principal, total apy again
            balance = await nftStakingFarm.balances(accounts[2])
            console.log('42th test, balance=1404.826775260024370288, apy=32%, timePassed=1 year, then new balance=%s, interest=%s', parseWei2Ether(balance), parseWei2Ether(balance) - 1404.826775260024370288 - 1000)
            principal = await nftStakingFarm.principal(accounts[2])
            assert.equal(principal, ether('2000'))
            // 17. stake success, check stakeDate of accounts[2]
            timestamp = await getBlockTimestamp(receipt);
            stakeDate = await nftStakingFarm.stakeDates(accounts[2])
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())

            // until now, balance=2934.354756144446042525, total apy=32%
            // 18. mock time increase 
            await time.increase(1)
            // batch stake nfts ids:[2,3]-> values:[2,2]
            await nftStakingFarm.batchStakeNfts([2, 3], [2, 2], '0x1111', { from: accounts[2] })
            // 19. check nft ids array, if nft id exist, total apy again
            idArray = await nftStakingFarm.getUserNftIds(accounts[2])
            // id array will still be 1
            assert.equal(String(idArray), '1,2,3')
            ifNftIdExist = await nftStakingFarm.isNftIdExist(accounts[2], 1)
            assert.equal(ifNftIdExist, true)
            ifNftIdExist = await nftStakingFarm.isNftIdExist(accounts[2], 2)
            assert.equal(ifNftIdExist, true)
            ifNftIdExist = await nftStakingFarm.isNftIdExist(accounts[2], 3)
            assert.equal(ifNftIdExist, true)
            // total apy will be 162, ids: [1,2,3]-> values: [2,2,2]
            totalApy = await nftStakingFarm.getTotalApyOfUser(accounts[2])
            assert.equal(totalApy, 132)

            // 20. check total funding
            let totalFunding = await nftStakingFarm.totalFunding();
            // console.log('42th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));

            // 20. funding contract again
            await umiTokenMock.approve(nftStakingFarm.address, ether('1000000'), { from: accounts[0] })
            await nftStakingFarm.fundingContract(ether('100000'), { from: accounts[0] });
            // check total funding again
            totalFunding = await nftStakingFarm.totalFunding();
            console.log('42th test, check total funding totalFunding before unstake=%s', parseWei2Ether(totalFunding));

            // until now, balance=2934.354756144446042525, total apy=132%
            // 21. before unstake, check balance, total umi balance of accounts[2]
            let balanceBeforeUnstake = await nftStakingFarm.balances(accounts[2])
            let totalUmiBalanceBefore = await nftStakingFarm.getUmiBalance(accounts[2])
            console.log('42th test, before unstake, balance of accounts[2] in nftStakingFarm=%s, total umi balance=%s', parseWei2Ether(balanceBeforeUnstake), parseWei2Ether(totalUmiBalanceBefore))

            // 22. two years later, unstake
            await time.increase(TWO_YEARS)
            await nftStakingFarm.unstake({ from: accounts[2] })
            // 23. after unstake, check balance of accounts[2]
            let balanceAfterUnstake = await nftStakingFarm.balances(accounts[2])
            // 24. after unstake, check balance, total umi balance of accounts[2]
            let totalUmiBalanceAfter = await nftStakingFarm.getUmiBalance(accounts[2])
            // after unstake balance in nftStakingFarm will be 0
            console.log('42th test, another 2 years later, after unstake, balance of accounts[2] in nftStakingFarm=%s, total umi balance=%s', parseWei2Ether(balanceAfterUnstake), parseWei2Ether(totalUmiBalanceAfter))
            console.log('42th test, balance=2934.354756144446042525, apy=132%, timePassed=2 years, calculate interest=%s', parseWei2Ether(totalUmiBalanceAfter) - parseWei2Ether(totalUmiBalanceBefore) - 2934.35475614444604252)

            // 25. when unstaked all umi, check total apy again
            totalApy = await nftStakingFarm.getTotalApyOfUser(accounts[2])
            assert.equal(totalApy, 0)
            totalFunding = await nftStakingFarm.totalFunding();
            console.log('42th test, check total funding totalFunding after unstake=%s', parseWei2Ether(totalFunding));
        })

    })

})