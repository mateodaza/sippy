// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RejectEther {
    receive() external payable {
        revert("reject");
    }
}


