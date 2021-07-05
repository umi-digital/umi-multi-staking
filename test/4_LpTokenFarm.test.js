require("dotenv").config()
const { time } = require('@openzeppelin/test-helpers');
const UmiTokenMock = artifacts.require("UmiTokenMock");
const LpTokenMock = artifacts.require("LpTokenMock");
const LpTokenFarm = artifacts.require("LpTokenFarm");
const BigNumber = require('bignumber.js');
const { assert } = require("chai");
const { parse } = require("dotenv");

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

contract('LpTokenFarm', async (accounts) => {

    const ONE_YEAR = new BN(31536000); // in seconds
    const TEN_DAYS = new BN(10 * 24 * 60 * 60);
    const ONE_DAYS = new BN(24 * 60 * 60);
    const TWO_YEARS = new BN(2 * 31536000)

    async function getBlockTimestamp(receipt) {
        return new BN((await web3.eth.getBlock(receipt.receipt.blockNumber)).timestamp);
    }

    let umiTokenMock
    let lpTokenMock
    let lpTokenFarm

    before(async () => {
        umiTokenMock = await UmiTokenMock.new()
        lpTokenMock = await LpTokenMock.new()
        lpTokenFarm = await LpTokenFarm.new(umiTokenMock.address, lpTokenMock.address)
        // console.log('LpTokenFarm.test.js UmiTokenMock is deployed to %s', umiTokenMock.address)
        // console.log('LpTokenFarm.test.js lpTokenMock is deployed to %s', lpTokenMock.address)
        // console.log('LpTokenFarm.test.js lpTokenFarm is deployed to %s', lpTokenFarm.address)
        // transfer 100000 UmiToken to accounts[1]
        await umiTokenMock.transfer(accounts[1], ether('100000'), { from: accounts[0] })

        // transfer 1000000 LpToken to accounts[1]
        await lpTokenMock.transfer(accounts[1], ether('10000000'), { from: accounts[0] })
        // transfer 2000000 LpToken to accounts[2]
        await lpTokenMock.transfer(accounts[2], ether('20000000'), { from: accounts[0] })
    })

    // test constructor
    describe('Test constructor', async () => {
        it('1st test, constructor should be set up correctly', async () => {
            // 1. UmiToken address is correct
            const umiTokenAddress = await lpTokenFarm.umiToken();
            assert.equal(umiTokenAddress, umiTokenMock.address);
            // 2. LpToken address is correct
            const lpTokenMockAddress = await lpTokenFarm.lpToken();
            assert.equal(lpTokenMockAddress, lpTokenMock.address);
            // 3. default APY is correct
            const apy = await lpTokenFarm.APY();
            assert.equal(apy, 33);
        })

        it('2nd test, fail if _umiTokenAddress or _lpTokenAddress is incorrect', async () => {
            let lpTokenFarmFailed = false;
            try {
                await LpTokenFarm.new(accounts[0], lpTokenMock.address)
                assert.fail('LpTokenFarm constructor failed, _umiTokenAddress or _lpTokenAddress is not a contract address')
            } catch (e) {
                // console.log('2nd test case1 e=%s', e)
                lpTokenFarmFailed = true;
                assert.equal(lpTokenFarmFailed, true);
            }
            // reset flag
            lpTokenFarmFailed = false;
            try {
                await LpTokenFarm.new(umiTokenMock.address, accounts[0])
                assert.fail('LpTokenFarm constructor failed, _umiTokenAddress or _lpTokenAddress is not a contract address')
            } catch (e) {
                // console.log('2nd test case2 e=%s', e)
                lpTokenFarmFailed = true;
                assert.equal(lpTokenFarmFailed, true);
            }
        })

        it('3rd test, UmiToken, LpToken has a total suupply', async () => {
            // 1. UmiToken total supply is correct
            const umiTokenTotalSupply = await umiTokenMock.totalSupply()
            assert.equal(umiTokenTotalSupply, ether('33000000000'))
            // 2. LpToken total supply is correct
            const lpTokenTotalSupply = await lpTokenMock.totalSupply()
            assert.equal(lpTokenTotalSupply, ether('200000000'))
        })
    })

    // test fundingContract, in order to pay the user rewards later 
    describe('Test fundingContract', async () => {

        before(async () => {
            // accounts[0] approve 10000 tokens to LpTokenFarm
            await umiTokenMock.approve(lpTokenFarm.address, ether('10000'), { from: accounts[0] })
            // accounts[1] approve 10000 tokens to LpTokenFarm
            await umiTokenMock.approve(lpTokenFarm.address, ether('10000'), { from: accounts[1] })
        })

        it('4th test, fundingContract and UmiToken balance of the farming contract is correct', async () => {
            // 1. get UmiToken balance of LpTokenFarm, before funding it will be 0
            let umiTokenBalanceOfLpTokenFarm = await lpTokenFarm.getUmiTokenBalance(lpTokenFarm.address)
            assert.equal(0, umiTokenBalanceOfLpTokenFarm)

            // 2. accounts[0] fund 1000 to LpTokenFarm, balance will be 1000
            await lpTokenFarm.fundingContract(ether('1000'), { from: accounts[0] });
            umiTokenBalanceOfLpTokenFarm = await lpTokenFarm.getUmiTokenBalance(lpTokenFarm.address)
            assert.equal(1000, parseWei2Ether(umiTokenBalanceOfLpTokenFarm))

            // 3. accounts[1] fund another 1000 to LpTokenFarm, balance will be 2000
            await lpTokenFarm.fundingContract(ether('1000'), { from: accounts[1] });
            umiTokenBalanceOfLpTokenFarm = await lpTokenFarm.getUmiTokenBalance(lpTokenFarm.address)
            assert.equal(2000, parseWei2Ether(umiTokenBalanceOfLpTokenFarm))

            // 4. get farming rewards of user, accounts[0] store 1000, accounts[1] store 1000
            let account0FarmingRewards = await lpTokenFarm.funding(accounts[0])
            assert.equal(1000, parseWei2Ether(account0FarmingRewards))
            let account1FarmingRewards = await lpTokenFarm.funding(accounts[1])
            assert.equal(1000, parseWei2Ether(account1FarmingRewards))

            // 5. accounts[0] fund another 1000 to LpTokenFarm, balance will be 3000
            await lpTokenFarm.fundingContract(ether('1000'), { from: accounts[0] });
            umiTokenBalanceOfLpTokenFarm = await lpTokenFarm.getUmiTokenBalance(lpTokenFarm.address)
            assert.equal(3000, parseWei2Ether(umiTokenBalanceOfLpTokenFarm))
            account0FarmingRewards = await lpTokenFarm.funding(accounts[0])
            assert.equal(2000, parseWei2Ether(account0FarmingRewards))
        })

        it('5th test, fundingContract incorrect, amount should be more than 0', async () => {
            let fundingContractFailed = false;
            try {
                await lpTokenFarm.fundingContract(0, { from: accounts[0] });
                assert.fail('fundingContract incorrect, amount should be more than 0')
            } catch (e) {
                // console.log('fundingContract 0 error %s', e)
                fundingContractFailed = true;
                assert.equal(fundingContractFailed, true, 'fundingContract incorrect, amount should be more than 0');
            }
        })

        it('6th test, check total funding correct', async () => {
            let totalFunding = await lpTokenFarm.totalFunding();
            // console.log('6th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));
            assert.equal(3000, parseWei2Ether(totalFunding));
        })

    })

    // *** util now, total funding is 3000, accounts[0] -> 2000, accounts[1] -> 1000

    // test setAPY
    describe('Test setAPY', async () => {
        it('7th test, owner can set APY', async () => {
            await lpTokenFarm.setAPY(33, { from: accounts[0] });
        })

        it('8th test, can not set APY by non owner', async () => {
            let setAPYFailed = false;
            try {
                await umiTokenFarm.setAPY(33, { from: accounts[1] })
                assert.fail('set apy failed')
            } catch (e) {
                setAPYFailed = true;
                assert.equal(setAPYFailed, true, 'only owner can set apy');
            }
        })
    })

    // test getUmiTokenBalance
    describe('Test getUmiTokenBalance', async () => {
        it('9th test, get UmiToken balance of account is correct', async () => {
            let banlance0 = await lpTokenFarm.getUmiTokenBalance(accounts[0])
            let banlance1 = await lpTokenFarm.getUmiTokenBalance(accounts[1])
            let banlance2 = await lpTokenFarm.getUmiTokenBalance(accounts[2])
            // console.log('9th test, balance0=%s, balance1=%s, balance2=%s', parseWei2Ether(banlance0), parseWei2Ether(banlance1), parseWei2Ether(banlance2))
            assert.equal(banlance0, ether('32999898000'))
            assert.equal(banlance1, ether('99000'))
            assert.equal(banlance2, 0)

            // check umiToken balance of LpTokenFarm, is totalFunding
            let balanceOfLpTokenFarm = await lpTokenFarm.getUmiTokenBalance(lpTokenFarm.address)
            assert.equal(3000, parseWei2Ether(balanceOfLpTokenFarm))
        })
    })

    // test getLpTokenBalance
    describe('Test getLpTokenBalance', async () => {
        it('10th test, get LpToken balance of account is correct', async () => {
            let banlance0 = await lpTokenFarm.getLpTokenBalance(accounts[0])
            let banlance1 = await lpTokenFarm.getLpTokenBalance(accounts[1])
            let banlance2 = await lpTokenFarm.getLpTokenBalance(accounts[2])
            // console.log('10th test, balance0=%s, balance1=%s, balance2=%s', parseWei2Ether(banlance0), parseWei2Ether(banlance1), parseWei2Ether(banlance2))
            assert.equal(170000000, parseWei2Ether(banlance0))
            assert.equal(10000000, parseWei2Ether(banlance1))
            assert.equal(20000000, parseWei2Ether(banlance2))

            // check LpToken balance of LpTokenFarm
            let balanceOfLpTokenFarm = await lpTokenFarm.getLpTokenBalance(lpTokenFarm.address)
            assert.equal(0, parseWei2Ether(balanceOfLpTokenFarm))
        })
    })

    // test stake
    describe('Test stake', async () => {
        // before stake LpToken, owner shold approve LpTokenFarm contract
        before(async () => {
            // account[0] approve 10000 tokens to LpTokenFarm
            await lpTokenMock.approve(lpTokenFarm.address, ether('10000'), { from: accounts[0] })
        })

        // accounts[0] stake 1000 LpToken
        it('11th test, stake LpToken correct by accounts[0]', async () => {
            // 1. check allowance first after approve
            let allowance = await lpTokenMock.allowance(accounts[0], lpTokenFarm.address)
            assert.equal(allowance, ether('10000'))

            // 2. stake 1000 LpToken to LpTokenFarm
            let receipt = await lpTokenFarm.stake(ether('1000'), { from: accounts[0] })

            // 3. check allowance again
            allowance = await lpTokenMock.allowance(accounts[0], lpTokenFarm.address)
            assert.equal(allowance, ether('9000'))

            // 4. stake success, check lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await lpTokenFarm.lastStakeIds(accounts[0])
            assert.equal(lastStakeIdOfAccount0, 1)

            // 5. check timestamp
            const timestamp = await getBlockTimestamp(receipt);
            const stakeDate = await lpTokenFarm.stakeDates(accounts[0], lastStakeIdOfAccount0)
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())
            // console.log('11th test stake date=%s', BN(stakeDate).toString())

            // 6. check balance after stake 1000
            const balances = await lpTokenFarm.balances(accounts[0], lastStakeIdOfAccount0)
            assert.equal(parseWei2Ether(balances), 1000)

            // 7. check total staked
            const totalStaked = await lpTokenFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 1000)
        })

        it('12th test, stake incorrect with amount=0', async () => {
            // 1. stake 0 LpToken to LpTokenFarm contract, it will fail
            let stakeFailed = false;
            try {
                await lpTokenFarm.stake(0, { from: accounts[0] })
                assert.fail('stake fail with amount=0')
            } catch (e) {
                // console.log('12th test, e=%s', e)
                stakeFailed = true;
                assert.equal(stakeFailed, true, 'stake amount should be more than 0');
            }

            // 2. check lastStakeIds, balance of accounts[0] and total staked
            // check lastStakeIds
            const lastStakeIdOfAccount0 = await lpTokenFarm.lastStakeIds(accounts[0])
            assert.equal(1, lastStakeIdOfAccount0)

            // 3. check balance
            const balances = await lpTokenFarm.balances(accounts[0], lastStakeIdOfAccount0)
            assert.equal(1000, parseWei2Ether(balances))

            // 4. check total staked
            const totalStaked = await lpTokenFarm.totalStaked()
            assert.equal(1000, parseWei2Ether(totalStaked))
        })

        it('13th test, stake without approve, it will fail', async () => {
            // 1. check allowance of accounts[1]
            let allowance = await lpTokenMock.allowance(accounts[1], lpTokenFarm.address)
            assert.equal(0, allowance)

            // 2. stake from accounts[1]
            let stakeWithoutApproveFailed = false;
            try {
                await lpTokenFarm.stake(ether('100'), { from: accounts[1] })
                assert.fail('stake without approve')
            } catch (e) {
                // console.log('13th test, e=%s', e)
                stakeWithoutApproveFailed = true;
                assert.equal(stakeWithoutApproveFailed, true, 'stake fail without approve');
            }

            // 3. check total staked
            const totalStaked = await lpTokenFarm.totalStaked()
            assert.equal(1000, parseWei2Ether(totalStaked))
        })

        // *** until now, accounts[0] staked 1000 LpToken

        // accounts[1] stake 200
        it('14th test, stake correct by accounts[1]', async () => {
            // 1. account[1] approve 1000 LpToken to LpTokenFarm
            await lpTokenMock.approve(lpTokenFarm.address, ether('1000'), { from: accounts[1] })

            // 2. check allowance first after approve
            let allowance = await lpTokenMock.allowance(accounts[1], lpTokenFarm.address)
            assert.equal(allowance, ether('1000'))

            // 3. stake 200 LpToken to lpTokenFarm contract
            let receipt = await lpTokenFarm.stake(ether('200'), { from: accounts[1] })

            // 4. check allowance again
            allowance = await lpTokenMock.allowance(accounts[1], lpTokenFarm.address)
            assert.equal(allowance, ether('800'))

            // 5. stake success, check lastStakeIds of accounts[1]
            const lastStakeIdOfAccount1 = await lpTokenFarm.lastStakeIds(accounts[1])
            assert.equal(lastStakeIdOfAccount1, 1)

            // 6. check timestamp
            const timestamp = await getBlockTimestamp(receipt);
            const stakeDate = await lpTokenFarm.stakeDates(accounts[1], lastStakeIdOfAccount1)
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())

            // 7. check balance after stake 200
            const balances = await lpTokenFarm.balances(accounts[1], lastStakeIdOfAccount1)
            assert.equal(parseWei2Ether(balances), 200)

            // 8. check total staked
            const totalStaked = await lpTokenFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 1200)
        })

        // accounts[0] stake another 2000
        it('15th test, stake another 2000 correct by accounts[0]', async () => {
            // 1. check allowance first after approve
            let allowance = await lpTokenMock.allowance(accounts[0], lpTokenFarm.address)
            assert.equal(allowance, ether('9000'))

            // 2. stake 2000 LpToken to LpTokenFarm contract
            let receipt = await lpTokenFarm.stake(ether('2000'), { from: accounts[0] })

            // 3. check allowance again
            allowance = await lpTokenMock.allowance(accounts[0], lpTokenFarm.address)
            assert.equal(allowance, ether('7000'))

            // 4. stake success, check lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await lpTokenFarm.lastStakeIds(accounts[0])
            assert.equal(lastStakeIdOfAccount0, 2)

            // 5. check timestamp
            const timestamp = await getBlockTimestamp(receipt);
            const stakeDate = await lpTokenFarm.stakeDates(accounts[0], lastStakeIdOfAccount0)
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())

            // 6. check balance after stake 2000
            const balances = await lpTokenFarm.balances(accounts[0], lastStakeIdOfAccount0)
            assert.equal(parseWei2Ether(balances), 2000)

            // 7. check total staked
            const totalStaked = await lpTokenFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 3200)
        })
    })

    // *** util now, accounts[0] staked 3000 LpToken, accounts[1] staked 200 LpToken ****

    // test unstakeCertainAmount, see unstakeCertainAmount(uint256 _stakeId, uint256 _amount) method
    describe('Test unstakeCertainAmount', async () => {
        // before unstake, owner should approve LpTokenFarm contract
        before(async () => {
            // account[0] approve 10000 tokens to LpTokenFarm
            await lpTokenMock.approve(lpTokenFarm.address, ether('10000'), { from: accounts[0] })
            // account[1] approve 10000 tokens to LpTokenFarm
            await lpTokenMock.approve(lpTokenFarm.address, ether('10000'), { from: accounts[1] })
            // account[2] approve 10000 tokens to LpTokenFarm
            await lpTokenMock.approve(lpTokenFarm.address, ether('10000'), { from: accounts[2] })
        })

        // stake 1000 LpToken, ten days later, unstake all
        it('16th test, unstakeCertainAmount correct, to unstake all', async () => {
            // 1. stake 1000 LpToken to LpTokenFarm contract
            let receipt = await lpTokenFarm.stake(ether('1000'), { from: accounts[0] })

            // 2. get timestamp of stake
            const timestampStake = await getBlockTimestamp(receipt);

            // ****  increase time for ten days later
            await time.increase(TEN_DAYS)

            // 3. stake success, get lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await lpTokenFarm.lastStakeIds(accounts[0])

            // 4. before unstake LpToken balance of accounts[0]
            let beforeUnstakeLpTokenBalance = await lpTokenFarm.getLpTokenBalance(accounts[0]);
            console.log('16th test, after stake 1000 LpToken, LpToken balance of accounts[0] is %s', parseWei2Ether(beforeUnstakeLpTokenBalance))
            let beforeUnstakeUmiTokenBalance = await lpTokenFarm.getUmiTokenBalance(accounts[0]);
            console.log('16th test, before unstake LpToken, UmiToken balance of accounts[0] is %s', parseWei2Ether(beforeUnstakeUmiTokenBalance))

            // 5. unstakeCertainAmount
            await lpTokenFarm.unstakeCertainAmount(lastStakeIdOfAccount0, ether('1000'), { from: accounts[0] });

            // 6. unstakeRequestsDate will be 0
            const unstakeRequestsDate = await lpTokenFarm.unstakeRequestsDates(accounts[0], lastStakeIdOfAccount0);
            assert.equal(0, unstakeRequestsDate)

            // 7. LpToken balance will be 0
            const balances = await lpTokenFarm.balances(accounts[0], lastStakeIdOfAccount0)
            assert.equal(parseWei2Ether(balances), 0)

            // 8. after unstake LpToken balance of accounts[0]
            let afterUnstakeLpTokenBalance = await lpTokenFarm.getLpTokenBalance(accounts[0]);
            let afterUnstakeUmiTokenBalance = await lpTokenFarm.getUmiTokenBalance(accounts[0]);
            // LpToken balance will add 1000
            console.log('16th test, unstake 1000 LpToken ten days later, LpToken balance of accounts[0] is %s, umiToken balance of accounts[0] is %s, umiToken rewards %s', parseWei2Ether(afterUnstakeLpTokenBalance), parseWei2Ether(afterUnstakeUmiTokenBalance), parseWei2Ether(afterUnstakeUmiTokenBalance) - parseWei2Ether(beforeUnstakeUmiTokenBalance))

            // 9. LpToken increase 1000
            assert.equal(1000, parseWei2Ether(afterUnstakeLpTokenBalance) - parseWei2Ether(beforeUnstakeLpTokenBalance))


            // 10. check total funding
            let totalFunding = await lpTokenFarm.totalFunding();
            console.log('16th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));
        })

        it('17th test, unstakeCertainAmount correct, stake 1000 then unstake 500 ', async () => {
            // 1. stake 1000 LpToken to LpTokenFarm contract
            let receipt = await lpTokenFarm.stake(ether('1000'), { from: accounts[1] })

            // 2. get timestamp of stake
            const timestampStake = await getBlockTimestamp(receipt);

            // *** increase time for ten days later
            await time.increase(TEN_DAYS)

            // 3. stake success, get lastStakeIds of accounts[1]
            const lastStakeIdOfAccount1 = await lpTokenFarm.lastStakeIds(accounts[1])

            // 4. before unstake LpToken balance of accounts[1]
            let beforeUnstakeLpTokenBalance = await lpTokenFarm.getLpTokenBalance(accounts[1]);
            console.log('17th test, after stake 1000 LpToken, LpToken balance of accounts[1] is %s', parseWei2Ether(beforeUnstakeLpTokenBalance))
            let beforeUnstakeUmiTokenBalance = await lpTokenFarm.getUmiTokenBalance(accounts[1]);
            console.log('17th test, before unstake LpToken, UmiToken balance of accounts[1] is %s', parseWei2Ether(beforeUnstakeUmiTokenBalance))

            // 5. unstakeCertainAmount
            await lpTokenFarm.unstakeCertainAmount(lastStakeIdOfAccount1, ether('500'), { from: accounts[1] });
            const timestampUnstake = await getBlockTimestamp(receipt);

            // 6. unstakeRequestsDate will be 0
            const unstakeRequestsDate = await lpTokenFarm.unstakeRequestsDates(accounts[1], lastStakeIdOfAccount1);
            assert.equal(0, unstakeRequestsDate)

            // 7. balance will be 500
            const balances = await lpTokenFarm.balances(accounts[1], lastStakeIdOfAccount1)
            assert.equal(parseWei2Ether(balances), 500)

            // 8. after unstake LpToken balance of accounts[1]
            let afterUnstakeLpTokenBalance = await lpTokenFarm.getLpTokenBalance(accounts[1]);
            let afterUnstakeUmiTokenBalance = await lpTokenFarm.getUmiTokenBalance(accounts[1]);
            // LpToken balance will add 500
            console.log('17th test, unstake 500 LpToken ten days later, LpToken balance of accounts[1] is %s, umiToken balance of accounts[1] is %s, umiToken rewards %s', parseWei2Ether(afterUnstakeLpTokenBalance), parseWei2Ether(afterUnstakeUmiTokenBalance), parseWei2Ether(afterUnstakeUmiTokenBalance) - parseWei2Ether(beforeUnstakeUmiTokenBalance))

            // 9. LpToken increase 500
            assert.equal(500, parseWei2Ether(afterUnstakeLpTokenBalance) - parseWei2Ether(beforeUnstakeLpTokenBalance))

            // 10. check total funding
            let totalFunding = await lpTokenFarm.totalFunding();
            console.log('17th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));

            // 11. check total staked
            const totalStaked = await lpTokenFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 3700)
        })

        // *** util now, total funding is 2986.383047472870894

        // accounts[2] stake 1000 ether, and unstake all after 2 years later
        it('18th test, unstakeCertainAmount, unstake all after 2 years later', async () => {
            // 1. stake 1000 LpToken to LpTokenFarm contract
            let receipt = await lpTokenFarm.stake(ether('1000'), { from: accounts[2] })

            // 2. get timestamp of stake
            const timestampStake = await getBlockTimestamp(receipt);

            // *** increase time for 2 years later
            await time.increase(TWO_YEARS)

            // 3. stake success, get lastStakeIds of accounts[2]
            const lastStakeIdOfAccount2 = await lpTokenFarm.lastStakeIds(accounts[2])

            // 4. before unstake balance of accounts[2]
            let beforeUnstakeLpTokenBalance = await lpTokenFarm.getLpTokenBalance(accounts[2]);
            console.log('18th test, after stake 1000 LpToken, LpToken balance of accounts[2] is %s', parseWei2Ether(beforeUnstakeLpTokenBalance))
            let beforeUnstakeUmiTokenBalance = await lpTokenFarm.getUmiTokenBalance(accounts[2]);
            console.log('18th test, before unstake LpToken, UmiToken balance of accounts[2] is %s', parseWei2Ether(beforeUnstakeUmiTokenBalance))

            // 5. unstakeCertainAmount
            await lpTokenFarm.unstakeCertainAmount(lastStakeIdOfAccount2, ether('1000'), { from: accounts[2] });

            // 6. unstakeRequestsDate will be 0
            const unstakeRequestsDate = await lpTokenFarm.unstakeRequestsDates(accounts[2], lastStakeIdOfAccount2);
            assert.equal(0, unstakeRequestsDate)

            // 7. makeRequestedUnstake balance will be 0
            const balances = await lpTokenFarm.balances(accounts[2], lastStakeIdOfAccount2)
            assert.equal(parseWei2Ether(balances), 0)

            // 8. after unstake LpToken balance of accounts[2]
            let afterUnstakeLpTokenBalance = await lpTokenFarm.getLpTokenBalance(accounts[2]);
            let afterUnstakeUmiTokenBalance = await lpTokenFarm.getUmiTokenBalance(accounts[2]);
            // LpToken balance will add 1000
            console.log('18th test, unstake 1000 LpToken ten days later, LpToken balance of accounts[2] is %s, umiToken balance of accounts[2] is %s, umiToken rewards %s', parseWei2Ether(afterUnstakeLpTokenBalance), parseWei2Ether(afterUnstakeUmiTokenBalance), parseWei2Ether(afterUnstakeUmiTokenBalance) - parseWei2Ether(beforeUnstakeUmiTokenBalance))

            // 9. LpToken increase 1000
            assert.equal(1000, parseWei2Ether(afterUnstakeLpTokenBalance) - parseWei2Ether(beforeUnstakeLpTokenBalance))

            // 10. check total funding
            let totalFunding = await lpTokenFarm.totalFunding();
            console.log('18th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));
        })

        it('19th test, unstakeCertainAmount incorrect, with wrong stake id', async () => {
            let requestUnstakeFailed = false;
            try {
                await lpTokenFarm.unstakeCertainAmount(10, ether('1000'), { from: accounts[0] })
                assert.fail('unstakeCertainAmount incorrect, with wrong stake id')
            } catch (e) {
                // console.log('19th e=%s', e)
                requestUnstakeFailed = true;
                assert.equal(requestUnstakeFailed, true, 'unstakeCertainAmount incorrect, with wrong stake id');
            }
        })

        it('20th test, unstakeCertainAmount incorrect, amount should be more than 0', async () => {
            let requestUnstakeFailed = false;
            const lastStakeIdOfAccount1 = await lpTokenFarm.lastStakeIds(accounts[1])
            try {
                await lpTokenFarm.unstakeCertainAmount(lastStakeIdOfAccount1, 0, { from: accounts[1] })
                assert.fail('unstakeCertainAmount incorrect, amount should be more than 0')
            } catch (e) {
                // console.log('20th e=%s', e)
                requestUnstakeFailed = true;
                assert.equal(requestUnstakeFailed, true, 'unstakeCertainAmount incorrect, amount should be more than 0');
            }
        })

        it('21th test, _unstake insufficient funds', async () => {
            // 1. stake 1000 LpToken to LpTokenFarm contract
            let receipt = await lpTokenFarm.stake(ether('1000'), { from: accounts[2] })

            // 2. get timestamp of stake
            const timestampStake = await getBlockTimestamp(receipt);

            // *** increase time for 2 years later
            await time.increase(TWO_YEARS)

            // 3. stake success, get lastStakeIds of accounts[2]
            const lastStakeIdOfAccount2 = await lpTokenFarm.lastStakeIds(accounts[2])

            // 4. _unstake insufficient funds
            let requestUnstakeFailed = false;
            try {
                await lpTokenFarm.unstakeCertainAmount(lastStakeIdOfAccount2, ether('1001'), { from: accounts[2] })
                assert.fail('request unstake incorrect, _unstake insufficient funds')
            } catch (e) {
                // console.log('21th e=%s', e)
                requestUnstakeFailed = true;
                assert.equal(requestUnstakeFailed, true, 'unstakeCertainAmount incorrect, unstake insufficient funds');
            }
        })

    })

    // test unstake, see unstake(uint256 _stakeId) method, to unstake all
    describe('Test unstake, to unstake all', async () => {
        // before unstake, owner should approve LpTokenFarm contract
        before(async () => {
            // account[0] approve 10000 tokens to LpTokenFarm
            await lpTokenMock.approve(lpTokenFarm.address, ether('10000'), { from: accounts[0] })
        })

        it('22th test, request unstake all correct', async () => {
            // 1. stake 1000 LpToken to LpTokenFarm contract
            let receipt = await lpTokenFarm.stake(ether('1000'), { from: accounts[0] })

            // 2. get timestamp of stake
            const timestampStake = await getBlockTimestamp(receipt);

            // *** increase time for ten days later
            await time.increase(TEN_DAYS)

            // 3. stake success, get lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await lpTokenFarm.lastStakeIds(accounts[0])

            // 4. before unstake balance of accounts[0]
            let beforeUnstakeLpTokenBalance = await lpTokenFarm.getLpTokenBalance(accounts[0]);
            console.log('22th test, after stake 1000 LpToken, LpToken balance of accounts[0] is %s', parseWei2Ether(beforeUnstakeLpTokenBalance))
            let beforeUnstakeUmiTokenBalance = await lpTokenFarm.getUmiTokenBalance(accounts[0]);
            console.log('22th test, before unstake LpToken, UmiToken balance of accounts[0] is %s', parseWei2Ether(beforeUnstakeUmiTokenBalance))

            // 5. request unstake all
            await lpTokenFarm.unstake(lastStakeIdOfAccount0, { from: accounts[0] });

            // 6. unstakeRequestsDate will be 0
            const unstakeRequestsDate = await lpTokenFarm.unstakeRequestsDates(accounts[0], lastStakeIdOfAccount0);
            assert.equal(0, unstakeRequestsDate)

            // 7. balance will be 0
            const balances = await lpTokenFarm.balances(accounts[0], lastStakeIdOfAccount0)
            assert.equal(parseWei2Ether(balances), 0)

            // 8. after unstake LpToken balance of accounts[2]
            let afterUnstakeLpTokenBalance = await lpTokenFarm.getLpTokenBalance(accounts[0]);
            let afterUnstakeUmiTokenBalance = await lpTokenFarm.getUmiTokenBalance(accounts[0]);
            // LpToken balance will add 1000
            console.log('22th test, unstake 1000 LpToken ten days later, LpToken balance of accounts[0] is %s, umiToken balance of accounts[0] is %s, umiToken rewards %s', parseWei2Ether(afterUnstakeLpTokenBalance), parseWei2Ether(afterUnstakeUmiTokenBalance), parseWei2Ether(afterUnstakeUmiTokenBalance) - parseWei2Ether(beforeUnstakeUmiTokenBalance))

            // 9. LpToken increase 1000
            assert.equal(1000, parseWei2Ether(afterUnstakeLpTokenBalance) - parseWei2Ether(beforeUnstakeLpTokenBalance))

            // 10. check total funding
            let totalFunding = await lpTokenFarm.totalFunding();
            console.log('22th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));
        })

        it('23th test, unstake all incorrect, with wrong stake id', async () => {
            let requestUnstakeFailed = false;
            try {
                await lpTokenFarm.unstake(10, { from: accounts[0] })
                assert.fail('unstake all incorrect, with wrong stake id')
            } catch (e) {
                // console.log('23th e=%s', e)
                requestUnstakeFailed = true;
                assert.equal(requestUnstakeFailed, true, 'request unstake all incorrect, with wrong stake id');
            }
        })

        it('24th test, total funding is not enough to pay interest, just unstake LpToken without interest', async () => {
            await lpTokenMock.approve(lpTokenFarm.address, ether('1000000'), { from: accounts[0] })

            // 1. stake 1000000 LpToken to LpTokenFarm contract
            let receipt = await lpTokenFarm.stake(ether('1000000'), { from: accounts[0] })

            // 2. get timestamp of stake
            const timestampStake = await getBlockTimestamp(receipt);

            // *** increase time for two years later
            await time.increase(TWO_YEARS)

            // 3. stake success, get lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await lpTokenFarm.lastStakeIds(accounts[0])

            // 4. before unstake balance of accounts[0]
            let beforeUnstakeLpTokenBalance = await lpTokenFarm.getLpTokenBalance(accounts[0]);
            console.log('24th test, after stake 1000000 LpToken, LpToken balance of accounts[0] is %s', parseWei2Ether(beforeUnstakeLpTokenBalance))
            let beforeUnstakeUmiTokenBalance = await lpTokenFarm.getUmiTokenBalance(accounts[0]);
            console.log('24th test, before unstake LpToken, UmiToken balance of accounts[0] is %s', parseWei2Ether(beforeUnstakeUmiTokenBalance))

            // 5. request unstake all
            await lpTokenFarm.unstake(lastStakeIdOfAccount0, { from: accounts[0] });

            // 6. unstakeRequestsDate will be 0
            const unstakeRequestsDate = await lpTokenFarm.unstakeRequestsDates(accounts[0], lastStakeIdOfAccount0);
            assert.equal(0, unstakeRequestsDate)

            // 7. balance will be 0
            const balances = await lpTokenFarm.balances(accounts[0], lastStakeIdOfAccount0)
            assert.equal(parseWei2Ether(balances), 0)

            // 8. after unstake LpToken balance of accounts[0]
            let afterUnstakeLpTokenBalance = await lpTokenFarm.getLpTokenBalance(accounts[0]);
            let afterUnstakeUmiTokenBalance = await lpTokenFarm.getUmiTokenBalance(accounts[0]);
            // LpToken balance will add 1000000
            console.log('24th test, unstake 1000000 LpToken ten days later, LpToken balance of accounts[0] is %s, umiToken balance of accounts[0] is %s, umiToken rewards %s', parseWei2Ether(afterUnstakeLpTokenBalance), parseWei2Ether(afterUnstakeUmiTokenBalance), parseWei2Ether(afterUnstakeUmiTokenBalance) - parseWei2Ether(beforeUnstakeUmiTokenBalance))

            // 9. LpToken increase 1000000
            assert.equal(1000000, parseWei2Ether(afterUnstakeLpTokenBalance) - parseWei2Ether(beforeUnstakeLpTokenBalance))

            // 10. donot pay any umiToken, so umiToken balance won't change
            assert.equal(0, parseWei2Ether(afterUnstakeUmiTokenBalance) - parseWei2Ether(beforeUnstakeUmiTokenBalance))

            // 11. check total funding
            let totalFunding = await lpTokenFarm.totalFunding();
            console.log('24th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));
        })
    })

    // test claim
    describe('Test claim', async () => {
        // before stake, owner should approve LpTokenFarm contract
        before(async () => {
            // account[0] approve 10000 LpToken to LpTokenFarm
            await lpTokenMock.approve(lpTokenFarm.address, ether('10000'), { from: accounts[0] })
        })

        it('25th test, claim incorrect, claim wrong stake id', async() => {
            let claimFailed = false;
            try {
                await lpTokenFarm.claim(10);
                // assert.fail('claim incorrect, wrong stake id')
            } catch (e) {
                // console.log('25th test, claim incorrect e=%s', e)
                claimFailed = true;
                assert.equal(claimFailed, true, 'claim incorrect, wrong stake id');
            }
        })

        it('26th test, claim incorrect, claim balance must more than 0', async() => {
            // 1. stake 1000 umiTokenMock to umiTokenFarm contract
            await lpTokenFarm.stake(ether('1000'), { from: accounts[0] })

            // 2. stake success, get lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await lpTokenFarm.lastStakeIds(accounts[0])

            // 3. get balance of stake, will be 1000
            let balanceOfStake = await lpTokenFarm.balances(accounts[0], lastStakeIdOfAccount0);
            assert.equal(1000, parseWei2Ether(balanceOfStake))

            // increase time for one year later
            await time.increase(ONE_YEAR)

            // 4. unstake the stakeId
            await lpTokenFarm.unstake(lastStakeIdOfAccount0);
            // get balance of this stake again, will be 0
            balanceOfStake = await lpTokenFarm.balances(accounts[0], lastStakeIdOfAccount0);
            assert.equal(0, parseWei2Ether(balanceOfStake))

            // 5. check total funding
            let totalFunding = await lpTokenFarm.totalFunding();
            console.log('26th test, after unstake check total funding totalFunding=%s', parseWei2Ether(totalFunding));

            // 6. claim, it will fail
            let claimFailed = false;
            try {
                await lpTokenFarm.claim(lastStakeIdOfAccount0, {from: accounts[0]})
                assert.fail('claim incorrect, balance must more than 0')
            } catch (e) {
                // console.log('26th test, claim incorrect e=%s', e)
                claimFailed = true;
                assert.equal(claimFailed, true, 'claim incorrect, balance must more than 0');
            }
        })

        it('27th test, claim correct', async() => {
            // 1. stake 1000 LpToken to LpTokenFarm contract
            await lpTokenFarm.stake(ether('1000'), { from: accounts[0] })

            // 2. stake success, get lastStakeId of accounts[0]
            const lastStakeIdOfAccount0 = await lpTokenFarm.lastStakeIds(accounts[0])
            // console.log('27th test, lastStakeIdOfAccount0=%s', lastStakeIdOfAccount0)

            // 3. get lpToken balance of stake, will be 1000
            let balanceOfStake = await lpTokenFarm.balances(accounts[0], lastStakeIdOfAccount0);
            // console.log('27th test, lastStakeIdOfAccount0=%s, balanceOfStake=%s', lastStakeIdOfAccount0, parseWei2Ether(balanceOfStake))
            assert.equal(1000, parseWei2Ether(balanceOfStake))

            // 4. before claim get stakeDate
            const stakeDateBeforeClaim = await lpTokenFarm.stakeDates(accounts[0], lastStakeIdOfAccount0)
            // console.log('27th test, stakeDateBeforeClaim=%s', BN(stakeDateBeforeClaim).toString())

            // 5. increase time for one year later
            await time.increase(ONE_YEAR);

            // 6. before claim get umiToken, lpToken balance of accounts[0]
            let beforeClaimLpTokenBalance = await lpTokenFarm.getLpTokenBalance(accounts[0]);
            console.log('27th test, before claim LpToken balance of accounts[0] is %s', parseWei2Ether(beforeClaimLpTokenBalance));
            let beforeClaimUmiTokenBalance = await lpTokenFarm.getUmiTokenBalance(accounts[0]);
            console.log('27th test, before claim umiToken balance of accounts[0] is %s', parseWei2Ether(beforeClaimUmiTokenBalance));

            // 7. check total funding
            let totalFunding = await lpTokenFarm.totalFunding();
            // console.log('27th test, before claim check total funding totalFunding=%s', parseWei2Ether(totalFunding));

            // 8. claim
            await lpTokenFarm.claim(lastStakeIdOfAccount0)

            // 9. after claim get stakeDate
            const stakeDateAfterClaim = await lpTokenFarm.stakeDates(accounts[0], lastStakeIdOfAccount0)
            // console.log('27th test, stakeDateAfterClaim=%s', BN(stakeDateAfterClaim).toString())
            
            // 10. after claim get umiToken, lpToken balance of accounts[0]
            let afterClaimLpTokenBalance = await lpTokenFarm.getLpTokenBalance(accounts[0]);
            let afterClaimUmiTokenBalance = await lpTokenFarm.getUmiTokenBalance(accounts[0]);
            // LpToken balance wonnot changed
            console.log('27th test, stake 1000, claim one year later, LpToken balance of accounts[0] is %s, umiToken balance of accounts[0] is %s, umiToken rewards %s', parseWei2Ether(afterClaimLpTokenBalance), parseWei2Ether(afterClaimUmiTokenBalance), parseWei2Ether(afterClaimUmiTokenBalance) - parseWei2Ether(beforeClaimUmiTokenBalance))

            // 11. balance of stake is still 1000, because Withdraw the interest only
            balanceOfStake = await lpTokenFarm.balances(accounts[0], lastStakeIdOfAccount0);
            // console.log('27th test, balance of this stake is still %s', parseWei2Ether(balanceOfStake))
            assert.equal(1000, parseWei2Ether(balanceOfStake))

            // 12. lpToken balance won't changed
            assert.equal(0, parseWei2Ether(afterClaimLpTokenBalance) - parseWei2Ether(beforeClaimLpTokenBalance))

            // 13. check total funding
            totalFunding = await lpTokenFarm.totalFunding();
            console.log('27th test, after claim check total funding totalFunding=%s', parseWei2Ether(totalFunding));
        })

        it('28th test, total funding not enough to pay interest when claim', async() => {
            await lpTokenMock.approve(lpTokenFarm.address, ether('1000000'), { from: accounts[0] })

            // 1. stake 1000000 LpToken to LpTokenFarm contract
            await lpTokenFarm.stake(ether('1000000'), { from: accounts[0] })

            // 2.stake success, get lastStakeId of accounts[0]
            const lastStakeIdOfAccount0 = await lpTokenFarm.lastStakeIds(accounts[0])

            // 3. increase time for 2 years later
            await time.increase(TWO_YEARS)

            // 4. claim, total funding not enough to pay interest, it will revert
            let claimFailed = false;
            try {
                await lpTokenFarm.claim(lastStakeIdOfAccount0)
                assert.fail('claim incorrect, total funding not enough to pay interest')
            } catch (e) {
                // console.log('28th test, claim incorrect e=%s', e)
                claimFailed = true;
                assert.equal(claimFailed, true, 'claim incorrect, total funding not enough to pay interest');
            }

            // 5. check total funding
            let totalFunding = await lpTokenFarm.totalFunding();
            console.log('28th test, after claim fail check total funding totalFunding=%s', parseWei2Ether(totalFunding));
        })
    })

    // test getTotalLpTokenBalance
    describe('Test getTotalLpTokenBalance', async () => {
        // total lpToken balance of accounts[0] will be 3500, total balance of accounts[1] will be 200
        it('29th test, getTotalLpTokenBalance correct', async () => {
            let totalBalance = await lpTokenFarm.getTotalLpTokenBalance(accounts[0])
            // console.log('29 test, totalBalance accounts[0] is %s', parseWei2Ether(totalBalance))
            assert.equal(1004000, parseWei2Ether(totalBalance))
            totalBalance = await lpTokenFarm.getTotalLpTokenBalance(accounts[1])
            // console.log('29 test, totalBalance accounts[1] is %s', parseWei2Ether(totalBalance))
            assert.equal(700, parseWei2Ether(totalBalance))
            totalBalance = await lpTokenFarm.getTotalLpTokenBalance(accounts[2])
            // console.log('29 test, totalBalance accounts[2] is %s', parseWei2Ether(totalBalance))
            assert.equal(1000, parseWei2Ether(totalBalance))
        })
    })

    // test pause and unpause
    describe('Test pause and unpause', async () => {
        // before stake, owner should approve LpTokenFarm contract
        before(async () => {
            // account[0] approve 10000 LpToken to LpTokenFarm
            await lpTokenMock.approve(lpTokenFarm.address, ether('10000'), { from: accounts[0] })
        })

        it('30th test, pause,unpause incorrect, only owner can call them', async () => {
            let pauseFailed = false;
            try {
                await lpTokenFarm.pause({ from: accounts[1] });
                assert.fail('pause incorrect, only owner can call pause')
            } catch (e) {
                // console.log('30th test, pauseFailed e=%s', e)
                pauseFailed = true;
                assert.equal(pauseFailed, true, 'pause incorrect, only owner can call pause');
            }

            let unpauseFailed = false;
            try {
                await lpTokenFarm.unpause({ from: accounts[1] });
                assert.fail('unpause incorrect, only owner can call unpause')
            } catch (e) {
                // console.log('30th test, unpauseFailed e=%s', e)
                unpauseFailed = true;
                assert.equal(unpauseFailed, true, 'unpause incorrect, only owner can call unpause');
            }
        })

        it('31th test, stake will be failed when paused, and will be success when unpaused', async () => {
            // 1. before stake, pause
            await lpTokenFarm.pause({ from: accounts[0] });

            // 2. check paused state
            let pausedState = await lpTokenFarm.paused()
            // console.log('31th test, pause pausedState %s', pausedState)
            assert.equal(pausedState, true)

            // 3. stake 1000 LpToken to LpTokenFarm contract, it will fail
            let stakeFailed = false;
            try {
                await lpTokenFarm.stake(ether('1000'), { from: accounts[0] })
                assert.fail('stake incorrect, paused')
            } catch (e) {
                // console.log('31th test e=%s', e)
                stakeFailed = true;
                assert.equal(stakeFailed, true, 'stake incorrect, paused');
            }
            // 4. check accounts[0]'s balance
            let totalBalance = await lpTokenFarm.getTotalLpTokenBalance(accounts[0])
            assert.equal(1004000, parseWei2Ether(totalBalance))

            // 5. unpause, and stake
            await lpTokenFarm.unpause({ from: accounts[0] });

            // 6. check paused state
            pausedState = await lpTokenFarm.paused()
            // console.log('31th test, unpause pausedState %s', pausedState)
            assert.equal(pausedState, false)

            // 7. stake again
            await lpTokenFarm.stake(ether('1000'), { from: accounts[0] })

            // 8. check accounts[0]'s balance again
            totalBalance = await lpTokenFarm.getTotalLpTokenBalance(accounts[0])
            assert.equal(1005000, parseWei2Ether(totalBalance))
        })

        it('32th test, unstake will be failed when paused, and will be success when unpaused', async () => {
            // 1. stake 1000 LpToken to LpTokenFarm contract
            await lpTokenFarm.stake(ether('1000'), { from: accounts[0] })

            // 2. stake success, get lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await lpTokenFarm.lastStakeIds(accounts[0])

            // 3. before unstake, pause
            await lpTokenFarm.pause({ from: accounts[0] });

            // 4. check paused state
            let pausedState = await lpTokenFarm.paused()
            // console.log('32th test, pause pausedState %s', pausedState)
            assert.equal(pausedState, true)

            // 5. requestUnstake, it will fail
            let unstakeFailed = false;
            try {
                // unstake 1000, it will fail
                await lpTokenFarm.unstakeCertainAmount(lastStakeIdOfAccount0, ether('1000'), { from: accounts[0] });
                assert.fail('request unstake incorrect, paused')
            } catch (e) {
                // console.log('32th test, unstake will be failed when paused e=%s', e)
                unstakeFailed = true;
                assert.equal(unstakeFailed, true, 'request unstake incorrect, paused');
            }

            // 6. check accounts[0]'s LpToken balance
            let totalBalance = await lpTokenFarm.getTotalLpTokenBalance(accounts[0])
            assert.equal(1006000, parseWei2Ether(totalBalance))

            // *** increase time for ten days later
            await time.increase(TEN_DAYS)

            // 7. unpause, and unstake again
            await lpTokenFarm.unpause({ from: accounts[0] });

            // 8. check paused state
            pausedState = await lpTokenFarm.paused()
            // console.log('32th test, unpause pausedState %s', pausedState)
            assert.equal(pausedState, false)

            // 9. request unstake again, it will success
            await lpTokenFarm.unstakeCertainAmount(lastStakeIdOfAccount0, ether('1000'), { from: accounts[0] });

            // 10. check accounts[0]'s LpToken balance again
            totalBalance = await lpTokenFarm.getTotalLpTokenBalance(accounts[0])
            assert.equal(1005000, parseWei2Ether(totalBalance))
        })

    })

})