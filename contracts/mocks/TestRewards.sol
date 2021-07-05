//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.3;

import "../Calculator.sol";


/**
 * Test rewards calculate
 */
contract TestRewards {
    using Calculator for uint256;

    /**
     * calculate rewards
     */
    function calculateRewards(uint256 principal, uint256 n, uint256 apy) public pure returns (uint256) {
        uint256 sum = Calculator.calculator(principal, n, apy);
        return sum;
    }

}
