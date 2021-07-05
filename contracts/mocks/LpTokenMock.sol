// SPDX-License-Identifier: MIT
pragma solidity ^0.8.3;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LpTokenMock is ERC20 {

constructor() ERC20("LpTokenMock", "LP") {
    _mint(
        msg.sender, 200000000 * 10 ** decimals());
}

}