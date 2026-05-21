// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title GasRefuel
 * @notice Automatically tops up users' ETH for gas when needed
 * @dev Implements daily limits, cooldowns, and emergency controls
 */
contract GasRefuel is Ownable, Pausable, ReentrancyGuard {
    // Configurable parameters (can be changed by owner)
    uint256 public minBalance = 0.00005 ether; // Min balance before refuel needed
    uint256 public refuelAmount = 0.0001 ether; // Amount to send per refuel
    uint256 public maxDailyRefuels = 3; // Max refuels per user per day
    uint256 public refuelCooldown = 10 minutes; // Cooldown between refuels

    // Tracking
    mapping(address => uint256) public lastRefuelTime;
    mapping(address => uint256) public dailyRefuelCount;
    mapping(address => uint256) public lastResetDay;

    // Events
    event Refueled(address indexed user, uint256 amount, uint256 timestamp);
    event FundsDeposited(address indexed sender, uint256 amount);
    event FundsWithdrawn(address indexed owner, uint256 amount);

    constructor() Ownable(msg.sender) {
        // Contract starts paused until funded
        _pause();
    }

    // Deposit ETH to the contract
    receive() external payable {
        emit FundsDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Main refuel function (called by backend)
     * @param user Address of the user to refuel
     */
    function refuel(address user) external onlyOwner whenNotPaused nonReentrant {
        require(user != address(0), "Invalid user address");
        require(address(this).balance >= refuelAmount, "Insufficient contract balance");
        require(user.balance < minBalance, "User balance sufficient");

        // Reset daily counter if new day
        uint256 currentDay = block.timestamp / 1 days;
        if (lastResetDay[user] < currentDay) {
            dailyRefuelCount[user] = 0;
            lastResetDay[user] = currentDay;
        }

        // Check cooldown
        require(
            block.timestamp >= lastRefuelTime[user] + refuelCooldown,
            "Cooldown active"
        );

        // Check daily limit
        require(
            dailyRefuelCount[user] < maxDailyRefuels,
            "Daily limit reached"
        );

        // Update state
        lastRefuelTime[user] = block.timestamp;
        dailyRefuelCount[user]++;

        // Transfer ETH
        (bool success, ) = payable(user).call{value: refuelAmount}("");
        require(success, "Transfer failed");

        emit Refueled(user, refuelAmount, block.timestamp);
    }

    /**
     * @notice Batch refuel (gas optimization)
     * @param users Array of user addresses to refuel
     */
    function batchRefuel(address[] calldata users) external onlyOwner whenNotPaused nonReentrant {
        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];

            // Guard against zero address
            if (user == address(0)) continue;

            // Check contract has enough balance
            if (address(this).balance < refuelAmount) break;

            // Check user needs refuel
            if (user.balance >= minBalance) continue;

            // Reset daily counter if new day
            uint256 currentDay = block.timestamp / 1 days;
            if (lastResetDay[user] < currentDay) {
                dailyRefuelCount[user] = 0;
                lastResetDay[user] = currentDay;
            }

            // Check cooldown
            if (block.timestamp < lastRefuelTime[user] + refuelCooldown) continue;

            // Check daily limit
            if (dailyRefuelCount[user] >= maxDailyRefuels) continue;

            // Transfer ETH
            (bool success, ) = payable(user).call{value: refuelAmount}("");

            // Only update state if transfer succeeded
            if (success) {
                lastRefuelTime[user] = block.timestamp;
                dailyRefuelCount[user]++;
                emit Refueled(user, refuelAmount, block.timestamp);
            }
        }
    }

    /**
     * @notice Emergency withdraw
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");

        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal failed");

        emit FundsWithdrawn(owner(), balance);
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Get contract balance
     * @return Current ETH balance of the contract
     */
    function contractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Check if a user can be refueled
     * @param user Address to check
     * @return Whether the user can be refueled
     */
    function canRefuel(address user) external view returns (bool) {
        if (paused()) return false;
        if (address(this).balance < refuelAmount) return false;
        if (user.balance >= minBalance) return false;

        uint256 currentDay = block.timestamp / 1 days;
        if (lastResetDay[user] < currentDay) {
            return true; // New day, counter reset
        }

        if (dailyRefuelCount[user] >= maxDailyRefuels) return false;
        if (block.timestamp < lastRefuelTime[user] + refuelCooldown) return false;

        return true;
    }

    // ============ ADMIN SETTERS ============

    /**
     * @notice Set minimum balance threshold
     * @param _minBalance New minimum balance in wei
     */
    function setMinBalance(uint256 _minBalance) external onlyOwner {
        minBalance = _minBalance;
    }

    /**
     * @notice Set refuel amount
     * @param _refuelAmount New refuel amount in wei
     */
    function setRefuelAmount(uint256 _refuelAmount) external onlyOwner {
        refuelAmount = _refuelAmount;
    }

    /**
     * @notice Set max daily refuels per user
     * @param _maxDailyRefuels New max daily refuels
     */
    function setMaxDailyRefuels(uint256 _maxDailyRefuels) external onlyOwner {
        maxDailyRefuels = _maxDailyRefuels;
    }

    /**
     * @notice Set cooldown between refuels
     * @param _refuelCooldown New cooldown in seconds
     */
    function setRefuelCooldown(uint256 _refuelCooldown) external onlyOwner {
        refuelCooldown = _refuelCooldown;
    }
}

