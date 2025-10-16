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
    // Minimum ETH balance before refuel is needed
    uint256 public constant MIN_BALANCE = 0.00001 ether; // ~3 PYUSD transfers

    // Amount to refuel (enough for ~25 PYUSD transfers)
    uint256 public constant REFUEL_AMOUNT = 0.00001 ether;

    // Maximum refuels per user per day
    uint256 public constant MAX_DAILY_REFUELS = 1;

    // Cooldown between refuels (1 hour)
    uint256 public constant REFUEL_COOLDOWN = 1 hours;

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
        require(address(this).balance >= REFUEL_AMOUNT, "Insufficient contract balance");
        require(user.balance < MIN_BALANCE, "User balance sufficient");

        // Reset daily counter if new day
        uint256 currentDay = block.timestamp / 1 days;
        if (lastResetDay[user] < currentDay) {
            dailyRefuelCount[user] = 0;
            lastResetDay[user] = currentDay;
        }

        // Check cooldown
        require(
            block.timestamp >= lastRefuelTime[user] + REFUEL_COOLDOWN,
            "Cooldown active"
        );

        // Check daily limit
        require(
            dailyRefuelCount[user] < MAX_DAILY_REFUELS,
            "Daily limit reached"
        );

        // Update state
        lastRefuelTime[user] = block.timestamp;
        dailyRefuelCount[user]++;

        // Transfer ETH
        (bool success, ) = payable(user).call{value: REFUEL_AMOUNT}("");
        require(success, "Transfer failed");

        emit Refueled(user, REFUEL_AMOUNT, block.timestamp);
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
            if (address(this).balance < REFUEL_AMOUNT) break;
            
            // Check user needs refuel
            if (user.balance >= MIN_BALANCE) continue;
            
            // Reset daily counter if new day
            uint256 currentDay = block.timestamp / 1 days;
            if (lastResetDay[user] < currentDay) {
                dailyRefuelCount[user] = 0;
                lastResetDay[user] = currentDay;
            }
            
            // Check cooldown
            if (block.timestamp < lastRefuelTime[user] + REFUEL_COOLDOWN) continue;
            
            // Check daily limit
            if (dailyRefuelCount[user] >= MAX_DAILY_REFUELS) continue;
            
            // Transfer ETH
            (bool success, ) = payable(user).call{value: REFUEL_AMOUNT}("");
            
            // Only update state if transfer succeeded
            if (success) {
                lastRefuelTime[user] = block.timestamp;
                dailyRefuelCount[user]++;
                emit Refueled(user, REFUEL_AMOUNT, block.timestamp);
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
        if (address(this).balance < REFUEL_AMOUNT) return false;
        if (user.balance >= MIN_BALANCE) return false;

        uint256 currentDay = block.timestamp / 1 days;
        if (lastResetDay[user] < currentDay) {
            return true; // New day, counter reset
        }

        if (dailyRefuelCount[user] >= MAX_DAILY_REFUELS) return false;
        if (block.timestamp < lastRefuelTime[user] + REFUEL_COOLDOWN) return false;

        return true;
    }
}

