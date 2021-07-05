require("dotenv").config()
const envUtils = require("../src/utils/evnUtils");
const UmiERC20 = artifacts.require("UmiTokenMock");
const LpTokenMock = artifacts.require("LpTokenMock");
const LpTokenFarm = artifacts.require("LpTokenFarm");

module.exports = async function(deployer, network, accounts) {

    // UmiToken address(default is mainnet address), on local ganache or rinkeby network it will be UmiTokenMock‘s address
    let umiTokenAddress = process.env.MAINNET_UMI_TOKEN_ADDRESS;
    let lpSakeswapAddress = process.env.MAINNET_LP_SAKESWAP_ADDRESS;
    let lpUniswapAddress = process.env.MAINNET_LP_UNISWAP_ADDRESS;
    let lpBalancerAddress = process.env.MAINNET_LP_BALANCER_ADDRESS;

    if (envUtils.isMainnet(network)) {
        // mainnet should add three lp token address in .env
        if (!lpSakeswapAddress || !lpUniswapAddress || !lpBalancerAddress) {
            console.log('4_deploy_lp, mainnet should add three lp token address in .env. Cancel deploy.')
            return;
        }
    }

    // Deploy UmiTokenMock, LpTokenMock when on local ganache or rinkeby network
    if (!envUtils.isMainnet(network)) {
        await deployer.deploy(UmiERC20)
        const umiERC20 = await UmiERC20.deployed()
        umiTokenAddress = umiERC20.address

        console.log('deploy lp umiTokenMock deployed to %s', umiTokenAddress);
        
        // lp token will deploy three times
        // 1. deployed to sakeswap
        await deployer.deploy(LpTokenMock)
        const lpSakeswap = await LpTokenMock.deployed()
        console.log('deploy lp lpSakeswap deployed to %s', lpSakeswap.address);
        lpSakeswapAddress = lpSakeswap.address;
        
        // 2. deployed to Uniswap
        await deployer.deploy(LpTokenMock)
        const lpUniswap = await LpTokenMock.deployed()
        console.log('deploy lp lpUniswap deployed to %s', lpUniswap.address);
        lpUniswapAddress = lpUniswap.address;

        // 3. deployed to Balancer
        await deployer.deploy(LpTokenMock)
        const lpBalancer = await LpTokenMock.deployed()
        console.log('deploy lp lpBalancer deployed to %s', lpBalancer.address);
        lpBalancerAddress = lpBalancer.address;
    }

    // deploy LpTokenFarm
    // 1. deploy LpTokenFarm for sakeswap
    await deployer.deploy(LpTokenFarm, umiTokenAddress, lpSakeswapAddress);
    const sakeswapLpTokenFarm = await LpTokenFarm.deployed()
    console.log('deploy lp sakeswapLpTokenFarm deployed to %s', sakeswapLpTokenFarm.address)

    // 2. deploy LpTokenFarm for Uniswap
    await deployer.deploy(LpTokenFarm, umiTokenAddress, lpUniswapAddress);
    const uniswapLpTokenFarm = await LpTokenFarm.deployed()
    console.log('deploy lp uniswapLpTokenFarm deployed to %s', uniswapLpTokenFarm.address)

    // 3. deploy LpTokenFarm for Balancer
    await deployer.deploy(LpTokenFarm, umiTokenAddress, lpBalancerAddress);
    const balancerLpTokenFarm = await LpTokenFarm.deployed()
    console.log('deploy lp balancerLpTokenFarm deployed to %s', balancerLpTokenFarm.address)
};