// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Drainable {
    receive() external payable {}

    function drain(address payable to) external {
        to.transfer(address(this).balance);
    }
}


