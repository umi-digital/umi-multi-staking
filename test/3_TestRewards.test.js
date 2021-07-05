require("dotenv").config()
const TestRewards = artifacts.require("TestRewards")
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

contract('TestRewards', async (accounts) => {

    /**
     * calculate rewards by js
     * @param {*} principal principal amount
     * @param {*} n periods for calculating interest,  24H eq to one period
     * @param {*} apy annual percentage yield
     * @returns resJs sum of principal and rewards
     */
    function calculateRewardsByJs(principal, n, apy) {
        var div = apy / 36500; //day rate
        var sum = 1 + div
        var pow = Math.pow(sum, n);
        var resJs = pow * principal;
        // console.log('calculateRewardsByJs div=%s, sum=%s, pow=%s, resJs=%s', div, sum, pow, resJs)
        return resJs;
    }

    let APY = 12

    let testRewards

    before(async () => {
        testRewards = await TestRewards.new()
        // console.log('TestRewards deployed to %s', testRewards.address)
    })

    describe('Test rewards', async() => {
        it('1st test, 0.00000000001 ether 365 days later', async() => {
            const principal = ether('0.00000000001')
            const days = 365
            let res = await testRewards.calculateRewards(principal, days, APY)
            console.log('1st test calculate rewards by solidity res wei=%s', BN(res).toString());

            let resJs = calculateRewardsByJs(principal, days, APY)
            console.log('1st test calculate rewards by js     resJs wei=%s', parseInt(resJs))

            assert.equal(BN(res).toString(), parseInt(resJs).toString())
        })

        it('2nd test, 0.01 ether 365 days later', async() => {
            const principal = ether('0.01')
            const days = 365
            let res = await testRewards.calculateRewards(principal, days, APY)
            console.log('2nd test calculate rewards by solidity res wei=%s', BN(res).toString());

            let resJs = calculateRewardsByJs(principal, days, APY)
            console.log('2nd test calculate rewards by js     resJs wei=%s', parseInt(resJs))

            // assert.equal(BN(res).toString(), parseInt(resJs).toString())
        })

        it('3rd test, 100 ether 365 days later', async() => {
            const principal = ether('100')
            const days = 365
            let res = await testRewards.calculateRewards(principal, days, APY)
            console.log('3rd test calculate rewards by solidity res wei=%s', BN(res).toString());

            let resJs = calculateRewardsByJs(principal, days, APY)
            console.log('3rd test calculate rewards by js     resJs wei=%s', parseInt(resJs))

            // assert.equal(BN(res).toString(), parseInt(resJs).toString())
        })

        it('4th test, 1.05 ether 10 days later', async() => {
            const principal = ether('1.05')
            const days = 10
            let res = await testRewards.calculateRewards(principal, days, APY)
            console.log('4th test calculate rewards by solidity res wei=%s', BN(res).toString());

            let resJs = calculateRewardsByJs(principal, days, APY)
            console.log('4th test calculate rewards by js     resJs wei=%s', parseInt(resJs))

            // assert.equal(BN(res).toString(), parseInt(resJs).toString())
        })

        it('5th test, 100 ether 10 days later', async() => {
            const principal = ether('100')
            const days = 10
            let res = await testRewards.calculateRewards(principal, days, APY)
            console.log('5th test calculate rewards by solidity res wei=%s', BN(res).toString());

            let resJs = calculateRewardsByJs(principal, days, APY)
            console.log('5th test calculate rewards by js     resJs wei=%s', parseInt(resJs))

            // assert.equal(BN(res).toString(), parseInt(resJs).toString())
        })

        it('6th test, 100 ether 2 years later', async() => {
            const principal = ether('100')
            const days = 730
            let res = await testRewards.calculateRewards(principal, days, APY)
            console.log('6th test calculate rewards by solidity res wei=%s', BN(res).toString());

            let resJs = calculateRewardsByJs(principal, days, APY)
            console.log('6th test calculate rewards by js     resJs wei=%s', parseInt(resJs))

            // assert.equal(BN(res).toString(), parseInt(resJs).toString())
        })
    })

})