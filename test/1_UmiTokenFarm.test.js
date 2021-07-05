require("dotenv").config()
const { time } = require('@openzeppelin/test-helpers');
const UmiTokenMock = artifacts.require("UmiTokenMock");
const UmiTokenFarm = artifacts.require("UmiTokenFarm");
const envUtils = require("../src/utils/evnUtils");
const BigNumber = require('bignumber.js');
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

contract('UmiTokenFarm', async (accounts) => {

    const YEAR = new BN(31536000); // in seconds
    const TEN_DAYS = new BN(10 * 24 * 60 * 60);
    const ONE_DAYS = new BN(24 * 60 * 60);
    const TWO_YEARS = new BN(2 * 31536000)

    async function getBlockTimestamp(receipt) {
        return new BN((await web3.eth.getBlock(receipt.receipt.blockNumber)).timestamp);
    }

    let umiTokenMock
    let umiTokenFarm

    before(async () => {
        umiTokenMock = await UmiTokenMock.new()
        umiTokenFarm = await UmiTokenFarm.new(umiTokenMock.address)
        console.log('UmiTokenMock is deployed to %s', umiTokenMock.address)
        console.log('UmiTokenFarm is deployed to %s', umiTokenFarm.address)
        // transfer 2000000000 UmiToken to account[1]
        await umiTokenMock.transfer(accounts[1], ether('2000000000'), { from: accounts[0] })
        // transfer 1000000000 UmiTOken to account[2]
        await umiTokenMock.transfer(accounts[2], ether('1000000000'), { from: accounts[0] })
    })

    // test constructor
    describe('Test constructor', async () => {
        it('1st test, constructor should be set up correctly', async () => {
            // UmiToken address is correct
            const umiTokenAddress = await umiTokenFarm.umiToken();
            assert.equal(umiTokenAddress, umiTokenMock.address);
            // default APY is correct
            const apy = await umiTokenFarm.APY();
            assert.equal(apy, 12);
        })

        it('2nd test, fail if _tokenAddress is incorrect', async () => {
            let UmiTokenFarmFailed = false;
            try {
                await UmiTokenFarm.new(accounts[0])
                assert.fail('UmiTokenFarm constructor failed')
            } catch (e) {
                UmiTokenFarmFailed = true;
                assert.equal(UmiTokenFarmFailed, true);
            }
        })

        it('3rd test, UmiToken has a total supply', async () => {
            const umiTokenTotalSupply = await umiTokenMock.totalSupply()
            assert.equal(umiTokenTotalSupply, ether('33000000000'))
        })

        it('4th test, UmiToken address correct', async () => {
            const umiTokenAddress = await umiTokenFarm.umiToken()
            assert.equal(umiTokenAddress, umiTokenMock.address)
        })
    })

    // test fundingContract, in order to pay the user rewards later 
    describe('Test fundingContract', async () => {

        before(async () => {
            // account[0] approve 10000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[0] })
            // account[1] approve 10000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[2] })
        })

        it('fundingContract and UmiToken balance of the farming contract is correct', async () => {
            // 1. get UmiTokenFarm UmiToken balance
            let umiTokenFarmBalance = await umiTokenFarm.getUmiTokenBalance(umiTokenFarm.address)
            assert.equal(0, parseWei2Ether(umiTokenFarmBalance))
            // 2. account[0] fund 1000 to UmiTokenFarm, balance will be 1000
            await umiTokenFarm.fundingContract(ether('1000'), {from: accounts[0]});
            umiTokenFarmBalance = await umiTokenFarm.getUmiTokenBalance(umiTokenFarm.address)
            assert.equal(1000, parseWei2Ether(umiTokenFarmBalance))

            // 3. accounts[2] fund 1000 to UmiTokenFarm, balance will be 2000
            await umiTokenFarm.fundingContract(ether('1000'), {from: accounts[2]});
            umiTokenFarmBalance = await umiTokenFarm.getUmiTokenBalance(umiTokenFarm.address)
            assert.equal(2000, parseWei2Ether(umiTokenFarmBalance))

            // 4. get farming rewards by address, accounts[0] store 1000
            let account0FarmingRewards = await umiTokenFarm.funding(accounts[0])
            assert.equal(1000, parseWei2Ether(account0FarmingRewards))

            // 5. account[0] store another 1000 to UmiTokenFarm, balance will be 2000
            await umiTokenFarm.fundingContract(ether('1000'), {from: accounts[0]});
            account0FarmingRewards = await umiTokenFarm.funding(accounts[0])
            assert.equal(2000, parseWei2Ether(account0FarmingRewards))
        })

        it('fundingContract incorrect, amount should be more than 0', async() => {
            let fundingContractFailed = false;
            try {
                await umiTokenFarm.fundingContract(0, {from: accounts[0]}); 
                assert.fail('fundingContract incorrect, amount should be more than 0')
            } catch (e) {
                // console.log('fundingContract 0 error %s', e)
                fundingContractFailed = true;
                assert.equal(fundingContractFailed, true, 'fundingContract incorrect, amount should be more than 0');
            }
        })

        it('check total funding correct', async() => {
            let totalFunding = await umiTokenFarm.totalFunding();
            // console.log('check total funding totalFunding=%s', parseWei2Ether(totalFunding));
            assert.equal(3000, parseWei2Ether(totalFunding));
        })
    })

    // test APY
    describe('Test setAPY', async () => {
        it('5th test, owner can set APY', async () => {
            await umiTokenFarm.setAPY(12, { from: accounts[0] });
        })

        it('6th test, can not set APY by non owner', async () => {
            let setAPYFailed = false;
            try {
                await umiTokenFarm.setAPY(12, { from: accounts[1] })
                assert.fail('set apy failed')
            } catch (e) {
                setAPYFailed = true;
                assert.equal(setAPYFailed, true, 'only owner can set apy');
            }
        })
    })

    // test get UmiToken balance
    describe('Test getUmiTokenBalance', async () => {
        it('7th test, get UmiToken balance of account is correct', async () => {
            let banlance0 = await umiTokenFarm.getUmiTokenBalance(accounts[0])
            let banlance1 = await umiTokenFarm.getUmiTokenBalance(accounts[1])
            let banlance2 = await umiTokenFarm.getUmiTokenBalance(accounts[2])
            assert.equal(banlance0, ether('29999998000'))
            assert.equal(banlance1, ether('2000000000'))
            assert.equal(banlance2, ether('999999000'))
        })
    })

    // test stake
    describe('Test stake', async () => {
        // before stake, owner should approve UmiTokenFarm contract
        before(async () => {
            // account[0] approve 10000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[0] })
        })

        // accounts[0] stake 1000
        it('8th test, stake correct by accounts[0]', async () => {
            // 8.1. check allowance first after approve
            let allowance = await umiTokenMock.allowance(accounts[0], umiTokenFarm.address)
            assert.equal(allowance, ether('10000'))
            // 8.2. stake 1000 umiTokenMock to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(ether('1000'), { from: accounts[0] })
            // 8.3. check allowance again
            allowance = await umiTokenMock.allowance(accounts[0], umiTokenFarm.address)
            assert.equal(allowance, ether('9000'))
            // 8.4. stake success, check lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(accounts[0])
            assert.equal(lastStakeIdOfAccount0, 1)
            // 8.5. check timestamp
            const timestamp = await getBlockTimestamp(receipt);
            const stakeDate = await umiTokenFarm.stakeDates(accounts[0], lastStakeIdOfAccount0)
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())
            // console.log('8th test stake date=%s', BN(stakeDate).toString())
            // 8.6. check balance after stake 1000
            const balances = await umiTokenFarm.balances(accounts[0], lastStakeIdOfAccount0)
            assert.equal(parseWei2Ether(balances), 1000)
            // 8.7. check total staked
            const totalStaked = await umiTokenFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 1000)
        })

        it('9th test, stake incorrect with amount=0', async () => {
            // 9.1. stake 0 UmiToken to umiTokenFarm contract, it will fail
            let stakeFailed = false;
            try {
                await umiTokenFarm.stake(0, { from: accounts[0] })
                assert.fail('stake fail with amount=0')
            } catch (e) {
                // console.log('9th test, e=%s', e)
                stakeFailed = true;
                assert.equal(stakeFailed, true, 'stake amount should be more than 0');
            }
            // 9.2. check lastStakeIds, balance of accounts[0] and total staked
            // check lastStakeIds
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(accounts[0])
            assert.equal(1, lastStakeIdOfAccount0)
            // check balance
            const balances = await umiTokenFarm.balances(accounts[0], lastStakeIdOfAccount0)
            assert.equal(1000, parseWei2Ether(balances))
            // check total staked
            const totalStaked = await umiTokenFarm.totalStaked()
            assert.equal(1000, parseWei2Ether(totalStaked))
        })

        it('10th test, stake without approve, it will fail', async () => {
            // 10.1. check allowance of accounts[1]
            let allowance = await umiTokenMock.allowance(accounts[1], umiTokenFarm.address)
            assert.equal(0, allowance)
            // 10.2. stake from accounts[1]
            let stakeWithoutApproveFailed = false;
            try {
                await umiTokenFarm.stake(ether('100'), { from: accounts[1] })
                assert.fail('stake without approve')
            } catch (e) {
                stakeWithoutApproveFailed = true;
                assert.equal(stakeWithoutApproveFailed, true, 'stake fail without approve');
            }
            // check total staked
            const totalStaked = await umiTokenFarm.totalStaked()
            assert.equal(1000, parseWei2Ether(totalStaked))
        })

        // accounts[1] stake 200
        it('11th test, stake correct by accounts[1]', async () => {
            // 11.1. account[1] approve 1000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('1000'), { from: accounts[1] })

            // 11.2. check allowance first after approve
            let allowance = await umiTokenMock.allowance(accounts[1], umiTokenFarm.address)
            assert.equal(allowance, ether('1000'))
            // 11.3. stake 200 umiTokenMock to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(ether('200'), { from: accounts[1] })
            // 11.4. check allowance again
            allowance = await umiTokenMock.allowance(accounts[1], umiTokenFarm.address)
            assert.equal(allowance, ether('800'))
            // 11.5. stake success, check lastStakeIds of accounts[1]
            const lastStakeIdOfAccount1 = await umiTokenFarm.lastStakeIds(accounts[1])
            assert.equal(lastStakeIdOfAccount1, 1)
            // 11.6. check timestamp
            const timestamp = await getBlockTimestamp(receipt);
            const stakeDate = await umiTokenFarm.stakeDates(accounts[1], lastStakeIdOfAccount1)
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())
            // 11.7. check balance after stake 200
            const balances = await umiTokenFarm.balances(accounts[1], lastStakeIdOfAccount1)
            assert.equal(parseWei2Ether(balances), 200)
            // 11.8. check total staked
            const totalStaked = await umiTokenFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 1200)
        })

        // accounts[0] stake another 2000
        it('12th test, stake another 2000 correct by accounts[0]', async () => {
            // 12.1. check allowance first after approve
            let allowance = await umiTokenMock.allowance(accounts[0], umiTokenFarm.address)
            assert.equal(allowance, ether('9000'))
            // 12.2. stake 2000 umiTokenMock to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(ether('2000'), { from: accounts[0] })
            // 12.3. check allowance again
            allowance = await umiTokenMock.allowance(accounts[0], umiTokenFarm.address)
            assert.equal(allowance, ether('7000'))
            // 12.4. stake success, check lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(accounts[0])
            assert.equal(lastStakeIdOfAccount0, 2)
            // 12.5. check timestamp
            const timestamp = await getBlockTimestamp(receipt);
            const stakeDate = await umiTokenFarm.stakeDates(accounts[0], lastStakeIdOfAccount0)
            assert.equal(BN(timestamp).toString(), BN(stakeDate).toString())
            // 12.6. check balance after stake 2000
            const balances = await umiTokenFarm.balances(accounts[0], lastStakeIdOfAccount0)
            assert.equal(parseWei2Ether(balances), 2000)
            // 12.7. check total staked
            const totalStaked = await umiTokenFarm.totalStaked()
            assert.equal(parseWei2Ether(totalStaked), 3200)
        })
    })

    // test request unstake, see unstakeCertainAmount(uint256 _stakeId, uint256 _amount) method
    describe('Test unstakeCertainAmount', async () => {
        // before stake, owner should approve UmiTokenFarm contract
        before(async () => {
            // account[0] approve 10000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[0] })
            // account[1] approve 10000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[1] })
            // account[2] approve 10000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[2] })
        })

        it('13th test, unstakeCertainAmount correct, to unstake all', async () => {
            // 13.1. stake 1000 umiTokenMock to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(ether('1000'), { from: accounts[0] })
            // 13.2. get timestamp of stake
            const timestampStake = await getBlockTimestamp(receipt);
            // increase time for ten days later
            await time.increase(TEN_DAYS)
            // 13.3. stake success, get lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(accounts[0])

            // 13.4. before unstake balance of accounts[0]
            let beforeUnstakeBalance = await umiTokenFarm.getUmiTokenBalance(accounts[0]);
            console.log('13th test, Stake 1000, before unstake balance of accounts[0] %s', parseWei2Ether(beforeUnstakeBalance))

            // 13.5. unstakeCertainAmount
            await umiTokenFarm.unstakeCertainAmount(lastStakeIdOfAccount0, ether('1000'), { from: accounts[0] });

            // 13.6. unstakeRequestsDate will be 0
            const unstakeRequestsDate = await umiTokenFarm.unstakeRequestsDates(accounts[0], lastStakeIdOfAccount0);
            assert.equal(0, unstakeRequestsDate)
            // 13.7. balance will be 0
            const balances = await umiTokenFarm.balances(accounts[0], lastStakeIdOfAccount0)
            assert.equal(parseWei2Ether(balances), 0)

            // 13.8. after unstake balance of accounts[0]
            let afterUnstakeBalance = await umiTokenFarm.getUmiTokenBalance(accounts[0]);
            console.log('13th test, unstake 1000 ten days later, after unstake balance of accounts[0] %s, total with rewards %s', parseWei2Ether(afterUnstakeBalance), parseWei2Ether(afterUnstakeBalance) - parseWei2Ether(beforeUnstakeBalance))

            // 13.9. check total funding
            let totalFunding = await umiTokenFarm.totalFunding();
            console.log('13th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));
        })

        it('14th test, unstakeCertainAmount correct, stake 1000 then unstake 500 ', async () => {
            // 14.1. stake 1000 umiTokenMock to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(ether('1000'), { from: accounts[1] })
            // 14.2. get timestamp of stake
            const timestampStake = await getBlockTimestamp(receipt);
            // increase time for ten days later
            await time.increase(TEN_DAYS)
            // 14.3. stake success, get lastStakeIds of accounts[1]
            const lastStakeIdOfAccount1 = await umiTokenFarm.lastStakeIds(accounts[1])

            // 14.4. before unstake balance of accounts[1]
            let beforeUnstakeBalance = await umiTokenFarm.getUmiTokenBalance(accounts[1]);
            console.log('14 test, Stake 1000, before unstake balance of accounts[1] %s', parseWei2Ether(beforeUnstakeBalance))

            // 14.5. unstakeCertainAmount
            await umiTokenFarm.unstakeCertainAmount(lastStakeIdOfAccount1, ether('500'), { from: accounts[1] });
            const timestampUnstake = await getBlockTimestamp(receipt);

            // 14.6. unstakeRequestsDate will be 0
            const unstakeRequestsDate = await umiTokenFarm.unstakeRequestsDates(accounts[1], lastStakeIdOfAccount1);
            assert.equal(0, unstakeRequestsDate)
            // 14.7. balance will be 500
            const balances = await umiTokenFarm.balances(accounts[1], lastStakeIdOfAccount1)
            assert.equal(parseWei2Ether(balances), 500)

            // 14.8. after unstake balance of accounts[1]
            let afterUnstakeBalance = await umiTokenFarm.getUmiTokenBalance(accounts[1]);
            console.log('14 test, unstake 500 ten days later, after unstake balance of accounts[1] %s, total with rewards %s', parseWei2Ether(afterUnstakeBalance), parseWei2Ether(afterUnstakeBalance) - parseWei2Ether(beforeUnstakeBalance))

            // 14.9. check total funding
            let totalFunding = await umiTokenFarm.totalFunding();
            console.log('14th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));
        })

        // accounts[2] stake 1000 ether, and unstake all after 2 years later
        it('15th test, unstakeCertainAmount, unstake all after 2 years later', async () => {
            // 15.1. stake 1000 umiTokenMock to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(ether('1000'), { from: accounts[2] })
            // 15.2. get timestamp of stake
            const timestampStake = await getBlockTimestamp(receipt);
            // increase time for 2 years later
            await time.increase(TWO_YEARS)
            // 15.3. stake success, get lastStakeIds of accounts[2]
            const lastStakeIdOfAccount2 = await umiTokenFarm.lastStakeIds(accounts[2])

            // 15.4. before unstake balance of accounts[2]
            let beforeUnstakeBalance = await umiTokenFarm.getUmiTokenBalance(accounts[2]);
            console.log('15th test, stake 1000, before unstake balance of accounts[2] %s', parseWei2Ether(beforeUnstakeBalance))

            // 15.5. unstakeCertainAmount
            await umiTokenFarm.unstakeCertainAmount(lastStakeIdOfAccount2, ether('1000'), { from: accounts[2] });

            // 15.6. unstakeRequestsDate will be 0
            const unstakeRequestsDate = await umiTokenFarm.unstakeRequestsDates(accounts[2], lastStakeIdOfAccount2);
            assert.equal(0, unstakeRequestsDate)
            // 15.7. makeRequestedUnstake balance will be 0
            const balances = await umiTokenFarm.balances(accounts[2], lastStakeIdOfAccount2)
            assert.equal(parseWei2Ether(balances), 0)

            // 15.8. after unstake balance of accounts[2]
            let afterUnstakeBalance = await umiTokenFarm.getUmiTokenBalance(accounts[2]);
            console.log('15th test, unstake 1000 2 years later, after unstake balance of accounts[2] %s, total with rewards %s', parseWei2Ether(afterUnstakeBalance), parseWei2Ether(afterUnstakeBalance) - parseWei2Ether(beforeUnstakeBalance))

            // 15.9. check total funding
            let totalFunding = await umiTokenFarm.totalFunding();
            console.log('15th test, check total funding totalFunding=%s', parseWei2Ether(totalFunding));
        })

        it('16th test, unstakeCertainAmount incorrect, with wrong stake id', async () => {
            let requestUnstakeFailed = false;
            try {
                await umiTokenFarm.unstakeCertainAmount(10, ether('1000'), { from: accounts[0] })
                assert.fail('unstakeCertainAmount incorrect, with wrong stake id')
            } catch (e) {
                // console.log('16th e=%s', e)
                requestUnstakeFailed = true;
                assert.equal(requestUnstakeFailed, true, 'unstakeCertainAmount incorrect, with wrong stake id');
            }
        })

        it('17th test, unstakeCertainAmount incorrect, amount should be more than 0', async () => {
            let requestUnstakeFailed = false;
            const lastStakeIdOfAccount1 = await umiTokenFarm.lastStakeIds(accounts[1])
            try {
                await umiTokenFarm.unstakeCertainAmount(lastStakeIdOfAccount1, 0, { from: accounts[1] })
                assert.fail('unstakeCertainAmount incorrect, amount should be more than 0')
            } catch (e) {
                // console.log('17th e=%s', e)
                requestUnstakeFailed = true;
                assert.equal(requestUnstakeFailed, true, 'unstakeCertainAmount incorrect, amount should be more than 0');
            }
        })

        it('18th test, _unstake insufficient funds', async () => {
            // 18.1. stake 1000 umiTokenMock to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(ether('1000'), { from: accounts[2] })
            // 18.2. get timestamp of stake
            const timestampStake = await getBlockTimestamp(receipt);
            // increase time for 2 years later
            await time.increase(TWO_YEARS)
            // 18.3. stake success, get lastStakeIds of accounts[2]
            const lastStakeIdOfAccount2 = await umiTokenFarm.lastStakeIds(accounts[2])

            let requestUnstakeFailed = false;
            try {
                await umiTokenFarm.unstakeCertainAmount(lastStakeIdOfAccount2, ether('1001'), { from: accounts[2] })
                assert.fail('request unstake incorrect, _unstake insufficient funds')
            } catch (e) {
                // console.log('18th e=%s', e)
                requestUnstakeFailed = true;
                assert.equal(requestUnstakeFailed, true, 'unstakeCertainAmount incorrect, unstake insufficient funds');
            }
        })
    })

    // test unstake, see unstake(uint256 _stakeId) method, to unstake all
    describe('Test unstake all', async () => {
        // before stake, owner should approve UmiTokenFarm contract
        before(async () => {
            // account[0] approve 10000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[0] })
        })

        it('19th test, request unstake all correct', async () => {
            // 19.1. stake 1000 umiTokenMock to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(ether('1000'), { from: accounts[0] })
            // 19.2. get timestamp of stake
            const timestampStake = await getBlockTimestamp(receipt);
            // increase time for ten days later
            await time.increase(TEN_DAYS)
            // 19.3. stake success, get lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(accounts[0])

            // 19.4. before unstake balance of accounts[0]
            let beforeUnstakeBalance = await umiTokenFarm.getUmiTokenBalance(accounts[0]);
            console.log('19th test, Stake 1000, before unstake balance of accounts[0] %s', parseWei2Ether(beforeUnstakeBalance))

            // 19.5. request unstake all
            await umiTokenFarm.unstake(lastStakeIdOfAccount0, { from: accounts[0] });

            // 19.6. unstakeRequestsDate will be 0
            const unstakeRequestsDate = await umiTokenFarm.unstakeRequestsDates(accounts[0], lastStakeIdOfAccount0);
            assert.equal(0, unstakeRequestsDate)
            // 19.7. balance will be 0
            const balances = await umiTokenFarm.balances(accounts[0], lastStakeIdOfAccount0)
            assert.equal(parseWei2Ether(balances), 0)

            // 19.8. after unstake balance of accounts[0]
            let afterUnstakeBalance = await umiTokenFarm.getUmiTokenBalance(accounts[0]);
            console.log('19th test, Unstake 1000 ten days later, after unstake balance of accounts[0] %s, total with rewards %s', parseWei2Ether(afterUnstakeBalance), parseWei2Ether(afterUnstakeBalance) - parseWei2Ether(beforeUnstakeBalance))
        })

        it('20th test, unstake all incorrect, with wrong stake id', async () => {
            let requestUnstakeFailed = false;
            try {
                await umiTokenFarm.unstake(10, { from: accounts[0] })
                assert.fail('unstake all incorrect, with wrong stake id')
            } catch (e) {
                // console.log('20th e=%s', e)
                requestUnstakeFailed = true;
                assert.equal(requestUnstakeFailed, true, 'request unstake all incorrect, with wrong stake id');
            }
        })

        it('21th test, total funding is not enough to pay interest, just unstake capital without interest', async() => {
            await umiTokenMock.approve(umiTokenFarm.address, ether('1000000'), { from: accounts[0] })
            // 1. stake 1000000 umiTokenMock to umiTokenFarm contract
            let receipt = await umiTokenFarm.stake(ether('1000000'), { from: accounts[0] })
            // 2. get timestamp of stake
            const timestampStake = await getBlockTimestamp(receipt);
            // increase time for ten days later
            await time.increase(TWO_YEARS)
            // 3. stake success, get lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(accounts[0])

            // 4. before unstake balance of accounts[0]
            let beforeUnstakeBalance = await umiTokenFarm.getUmiTokenBalance(accounts[0]);
            console.log('21th test, Stake 1000000, before unstake balance of accounts[0] %s', parseWei2Ether(beforeUnstakeBalance))

            // 5. check total funding
            let totalFunding = await umiTokenFarm.totalFunding();
            console.log('21th test, before unstake check total funding totalFunding=%s', parseWei2Ether(totalFunding));

            // 5. request unstake all, total funding is not enough to pay interest 
            await umiTokenFarm.unstake(lastStakeIdOfAccount0, { from: accounts[0] });

            // 6. unstakeRequestsDate will be 0
            const unstakeRequestsDate = await umiTokenFarm.unstakeRequestsDates(accounts[0], lastStakeIdOfAccount0);
            assert.equal(0, unstakeRequestsDate)
            // 7. balance will be 0
            const balances = await umiTokenFarm.balances(accounts[0], lastStakeIdOfAccount0)
            assert.equal(parseWei2Ether(balances), 0)

            // 8. after unstake balance of accounts[0]
            let afterUnstakeBalance = await umiTokenFarm.getUmiTokenBalance(accounts[0]);
            console.log('21th test, Unstake 1000000 two years later, after unstake balance of accounts[0] %s, total with rewards %s', parseWei2Ether(afterUnstakeBalance), parseWei2Ether(afterUnstakeBalance) - parseWei2Ether(beforeUnstakeBalance))

            // 9. check total funding
            totalFunding = await umiTokenFarm.totalFunding();
            console.log('21th test, after unstake 1000000 check total funding totalFunding=%s', parseWei2Ether(totalFunding));
        })

    })

    // test getTotalBalanceOfUser
    describe('Test getTotalBalanceOfUser', async () => {
        // total balance of accounts[0] will be 3500, total balance of accounts[1] will be 200
        it('22th test, getTotalBalanceOfUser correct', async () => {
            let totalBalance = await umiTokenFarm.getTotalBalanceOfUser(accounts[0])
            assert.equal(3000, parseWei2Ether(totalBalance))
            totalBalance = await umiTokenFarm.getTotalBalanceOfUser(accounts[1])
            assert.equal(700, parseWei2Ether(totalBalance))
            totalBalance = await umiTokenFarm.getTotalBalanceOfUser(accounts[2])
            assert.equal(1000, parseWei2Ether(totalBalance))
        })
    })

    // test pause and unpause
    describe('Test pause and unpause', async () => {
        // before stake, owner should approve UmiTokenFarm contract
        before(async () => {
            // account[0] approve 10000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[0] })
        })

        it('23th test, pause,unpause incorrect, only owner can call them', async () => {
            let pauseFailed = false;
            try {
                await umiTokenFarm.pause({ from: accounts[1] });
                assert.fail('pause incorrect, only owner can call pause')
            } catch (e) {
                // console.log('pauseFailed e=%s', e)
                pauseFailed = true;
                assert.equal(pauseFailed, true, 'pause incorrect, only owner can call pause');
            }

            let unpauseFailed = false;
            try {
                await umiTokenFarm.unpause({ from: accounts[1] });
                assert.fail('unpause incorrect, only owner can call unpause')
            } catch (e) {
                // console.log('unpauseFailed e=%s', e)
                unpauseFailed = true;
                assert.equal(unpauseFailed, true, 'unpause incorrect, only owner can call unpause');
            }
        })

        it('24th test, stake will be failed when paused, and will be success when unpaused', async () => {
            // 1. before stake, pause
            await umiTokenFarm.pause({ from: accounts[0] });
            // check paused state
            let pausedState = await umiTokenFarm.paused()
            // console.log('pause pausedState %s', pausedState)
            assert.equal(pausedState, true)
            let stakeFailed = false;
            try {
                // 2. stake 1000 umiTokenMock to umiTokenFarm contract, it will fail
                await umiTokenFarm.stake(ether('1000'), { from: accounts[0] })
                assert.fail('stake incorrect, paused')
            } catch (e) {
                // console.log('23th test e=%s', e)
                stakeFailed = true;
                assert.equal(stakeFailed, true, 'stake incorrect, paused');
            }
            // 3. check accounts[0]'s balance
            let totalBalance = await umiTokenFarm.getTotalBalanceOfUser(accounts[0])
            assert.equal(3000, parseWei2Ether(totalBalance))
            // 4. unpause, and stake
            await umiTokenFarm.unpause({ from: accounts[0] });
            // check paused state
            pausedState = await umiTokenFarm.paused()
            // console.log('unpause pausedState %s', pausedState)
            assert.equal(pausedState, false)
            // 5. stake again
            await umiTokenFarm.stake(ether('1000'), { from: accounts[0] })
            // 6. check accounts[0]'s balance again
            totalBalance = await umiTokenFarm.getTotalBalanceOfUser(accounts[0])
            assert.equal(4000, parseWei2Ether(totalBalance))
        })

        it('25th test, unstake will be failed when paused, and will be success when unpaused', async () => {
            // 1. before stake, owner should approve UmiTokenFarm contract
            before(async () => {
                // account[0] approve 10000 tokens to UmiTokenFarm
                await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[0] })
            })

            // 2. stake 1000 umiTokenMock to umiTokenFarm contract
            await umiTokenFarm.stake(ether('1000'), { from: accounts[0] })

            // 3. stake success, get lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(accounts[0])

            // 4. before unstake, pause
            await umiTokenFarm.pause({ from: accounts[0] });

            // check paused state
            let pausedState = await umiTokenFarm.paused()
            // console.log('pause pausedState %s', pausedState)
            assert.equal(pausedState, true)

            // 5. requestUnstake, it will fail
            let unstakeFailed = false;
            try {
                // unstake 1000, it will fail
                await umiTokenFarm.unstakeCertainAmount(lastStakeIdOfAccount0, ether('1000'), { from: accounts[0] });
                assert.fail('request unstake incorrect, paused')
            } catch (e) {
                // console.log('unstake will be failed when paused e=%s', e)
                unstakeFailed = true;
                assert.equal(unstakeFailed, true, 'request unstake incorrect, paused');
            }
            // 6. check accounts[0]'s balance
            let totalBalance = await umiTokenFarm.getTotalBalanceOfUser(accounts[0])
            assert.equal(5000, parseWei2Ether(totalBalance))

            // increase time for ten days later
            await time.increase(TEN_DAYS)

            // 7. unpause, and unstake
            await umiTokenFarm.unpause({ from: accounts[0] });
            // check paused state
            pausedState = await umiTokenFarm.paused()
            // console.log('unpause pausedState %s', pausedState)
            assert.equal(pausedState, false)
            // 5. request unstake again, it will success
            await umiTokenFarm.unstakeCertainAmount(lastStakeIdOfAccount0, ether('1000'), { from: accounts[0] });
            // 6. check accounts[0]'s balance again
            totalBalance = await umiTokenFarm.getTotalBalanceOfUser(accounts[0])
            assert.equal(4000, parseWei2Ether(totalBalance))
        })

    })

    // test claim, Withdraws the interest of certain stake only,
    describe('Test claim', async() => {

        // 1. before stake, owner should approve UmiTokenFarm contract
        before(async () => {
            // account[0] approve 10000 tokens to UmiTokenFarm
            await umiTokenMock.approve(umiTokenFarm.address, ether('10000'), { from: accounts[0] })
        })

        it('26th test, claim incorrect, claim wrong stake id', async() => {
            let claimFailed = false;
            try {
                await umiTokenFarm.claim(10);
                assert.fail('claim incorrect, wrong stake id')
            } catch (e) {
                // console.log('25th test, claim incorrect e=%s', e)
                claimFailed = true;
                assert.equal(claimFailed, true, 'claim incorrect, wrong stake id');
            }
        })

        it('27th test, claim incorrect, claim balance must more than 0', async() => {
            // 1. stake 1000 umiTokenMock to umiTokenFarm contract
            await umiTokenFarm.stake(ether('1000'), { from: accounts[0] })

            // 2. stake success, get lastStakeIds of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(accounts[0])
            // console.log('26th test, lastStakeIdOfAccount0=%s', lastStakeIdOfAccount0)

            // 3. get balance of stake, will be 1000
            let balanceOfStake = await umiTokenFarm.balances(accounts[0], lastStakeIdOfAccount0);
            // console.log('26th test, lastStakeIdOfAccount0=%s, balanceOfStake=%s', lastStakeIdOfAccount0, balanceOfStake)
            assert.equal(1000, parseWei2Ether(balanceOfStake))

            // increase time for ten days later
            await time.increase(TEN_DAYS)

            // 4. unstake the stakeId
            await umiTokenFarm.unstake(lastStakeIdOfAccount0);
            // get balance of this stake again, will be 0
            balanceOfStake = await umiTokenFarm.balances(accounts[0], lastStakeIdOfAccount0);
            // console.log('26th test, get balanceOfStake again, lastStakeIdOfAccount0=%s, balanceOfStake=%s', lastStakeIdOfAccount0, balanceOfStake)
            assert.equal(0, parseWei2Ether(balanceOfStake))

            // 5. claim, it will fail
            let claimFailed = false;
            try {
                await umiTokenFarm.claim(lastStakeIdOfAccount0, {from: accounts[0]})
                assert.fail('claim incorrect, balance must more than 0')
            } catch (e) {
                // console.log('26th test, claim incorrect e=%s', e)
                claimFailed = true;
                assert.equal(claimFailed, true, 'claim incorrect, balance must more than 0');
            }
        })

        it('28th test, claim correct', async() => {
            // 1. stake 1000 umiTokenMock to umiTokenFarm contract
            await umiTokenFarm.stake(ether('1000'), { from: accounts[0] })

            // 2. stake success, get lastStakeId of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(accounts[0])
            // console.log('28th test, lastStakeIdOfAccount0=%s', lastStakeIdOfAccount0)

            // 3. get balance of stake, will be 1000
            let balanceOfStake = await umiTokenFarm.balances(accounts[0], lastStakeIdOfAccount0);
            // console.log('28th test, lastStakeIdOfAccount0=%s, balanceOfStake=%s', lastStakeIdOfAccount0, balanceOfStake)
            assert.equal(1000, parseWei2Ether(balanceOfStake))

            // 4. before claim get stakeDate
            const stakeDateBeforeClaim = await umiTokenFarm.stakeDates(accounts[0], lastStakeIdOfAccount0)
            // console.log('28th test, stakeDateBeforeClaim=%s', BN(stakeDateBeforeClaim).toString())

            // 5. increase time for one year later
            await time.increase(YEAR);

            // 6. before claim get umi token balance of accounts[0]
            let beforeClaimBalance = await umiTokenFarm.getUmiTokenBalance(accounts[0]);
            console.log('28th test, before claim umi balance of accounts[0] is %s', parseWei2Ether(beforeClaimBalance));

            // check total funding
            let totalFunding = await umiTokenFarm.totalFunding();
            console.log('28th test, before claim check total funding totalFunding=%s', parseWei2Ether(totalFunding));

            // 7. claim
            await umiTokenFarm.claim(lastStakeIdOfAccount0)

            // 8. after claim get stakeDate
            const stakeDateAfterClaim = await umiTokenFarm.stakeDates(accounts[0], lastStakeIdOfAccount0)
            // console.log('28th test, stakeDateAfterClaim=%s', BN(stakeDateAfterClaim).toString())
            
            // 9. after claim get umi token balance of accounts[0]
            let afterClaimBalance = await umiTokenFarm.getUmiTokenBalance(accounts[0]);
            console.log('28th test, one year later, after claim umi balance of accounts[0] is %s, interest is %s', parseWei2Ether(afterClaimBalance), parseWei2Ether(afterClaimBalance) - parseWei2Ether(beforeClaimBalance));

            // 10. balance of stake is still 1000, because Withdraw the interest only,
            balanceOfStake = await umiTokenFarm.balances(accounts[0], lastStakeIdOfAccount0);
            console.log('28th test, balance of this stake is still %s', parseWei2Ether(balanceOfStake))
            assert.equal(1000, parseWei2Ether(balanceOfStake))

            // 11. check total balance of accounts[0]
            let totalBalance = await umiTokenFarm.getTotalBalanceOfUser(accounts[0])
            assert.equal(5000, parseWei2Ether(totalBalance))

            // check total funding
            totalFunding = await umiTokenFarm.totalFunding();
            console.log('28th test, after claim check total funding totalFunding=%s', parseWei2Ether(totalFunding));
        })

        it('29th test, total funding not enough to pay interest when claim', async() => {
            await umiTokenMock.approve(umiTokenFarm.address, ether('1000000'), { from: accounts[0] })
            // 1. stake 1000000 umiTokenMock to umiTokenFarm contract
            await umiTokenFarm.stake(ether('1000000'), { from: accounts[0] })
            // 2.stake success, get lastStakeId of accounts[0]
            const lastStakeIdOfAccount0 = await umiTokenFarm.lastStakeIds(accounts[0])
            // 3. increase time for 2 years later
            await time.increase(TWO_YEARS)

            // 4. claim, total funding not enough to pay interest, it will revert
            let claimFailed = false;
            try {
                await umiTokenFarm.claim(lastStakeIdOfAccount0)
                assert.fail('claim incorrect, total funding not enough to pay interest')
            } catch (e) {
                // console.log('29th test, claim incorrect e=%s', e)
                claimFailed = true;
                assert.equal(claimFailed, true, 'claim incorrect, total funding not enough to pay interest');
            }
        })

    })
    
})