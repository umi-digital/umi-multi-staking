require("dotenv").config()
const envUtils = require("../src/utils/evnUtils");
const UmiTokenFarm = artifacts.require("UmiTokenFarm");
const UmiERC20 = artifacts.require("UmiTokenMock");

module.exports = async function(deployer, network, accounts) {
    // UmiToken address(default is mainnet address), on local ganache or rinkeby network it will be UmiTokenMock‘s address
    let umiTokenAddress = process.env.MAINNET_UMI_TOKEN_ADDRESS;

    // Deploy UmiTokenMock when on local ganache or rinkeby network
    if (!envUtils.isMainnet(network)) {
        await deployer.deploy(UmiERC20)
        const umiERC20 = await UmiERC20.deployed()
        umiTokenAddress = umiERC20.address
    }

    // deploy UmiTokenFarm
    await deployer.deploy(UmiTokenFarm, umiTokenAddress)
};