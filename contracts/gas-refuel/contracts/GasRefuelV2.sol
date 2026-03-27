// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title GasRefuelV2
 * @notice Automatically tops up registered Sippy wallets' ETH for gas.
 *         Only allowlisted addresses can receive refuels.
 */
contract GasRefuelV2 is Ownable2Step, Pausable, ReentrancyGuard {
    // ============ CUSTOM ERRORS ============

    error InvalidAddress();
    error NotAllowlisted();
    error InsufficientContractBalance();
    error UserBalanceSufficient();
    error CooldownActive();
    error DailyLimitReached();
    error TransferFailed();
    error NoBalanceToWithdraw();
    error WithdrawalFailed();
    error MinBalanceOutOfBounds();
    error RefuelAmountOutOfBounds();
    error MaxDailyRefuelsOutOfBounds();
    error CooldownOutOfBounds();

    // ============ CONSTANTS (bounds) ============

    uint256 public constant MAX_REFUEL_AMOUNT = 0.01 ether;
    uint256 public constant MAX_MIN_BALANCE = 0.01 ether;
    uint256 public constant MAX_DAILY_REFUELS_CAP = 10;
    uint256 public constant MAX_COOLDOWN = 1 days;

    // ============ CONFIGURABLE PARAMETERS ============

    uint256 public minBalance = 0.00005 ether;
    uint256 public refuelAmount = 0.0001 ether;
    uint256 public maxDailyRefuels = 3;
    uint256 public refuelCooldown = 10 minutes;

    // ============ ALLOWLIST ============

    mapping(address => bool) public allowlisted;
    uint256 public allowlistCount;

    // ============ TRACKING ============

    mapping(address => uint256) public lastRefuelTime;
    mapping(address => uint256) public dailyRefuelCount;
    mapping(address => uint256) public lastResetDay;

    // ============ EVENTS ============

    event Refueled(address indexed user, uint256 amount, uint256 timestamp);
    event FundsDeposited(address indexed sender, uint256 amount);
    event FundsWithdrawn(address indexed owner, uint256 amount);
    event AllowlistAdded(address indexed wallet);
    event AllowlistRemoved(address indexed wallet);
    event MinBalanceUpdated(uint256 oldValue, uint256 newValue);
    event RefuelAmountUpdated(uint256 oldValue, uint256 newValue);
    event MaxDailyRefuelsUpdated(uint256 oldValue, uint256 newValue);
    event RefuelCooldownUpdated(uint256 oldValue, uint256 newValue);

    constructor() Ownable(msg.sender) {
        _pause();
    }

    receive() external payable {
        emit FundsDeposited(msg.sender, msg.value);
    }

    // ============ ALLOWLIST ============

    function addToAllowlist(address wallet) external onlyOwner {
        if (wallet == address(0)) revert InvalidAddress();
        if (!allowlisted[wallet]) {
            allowlisted[wallet] = true;
            unchecked { allowlistCount++; }
            emit AllowlistAdded(wallet);
        }
    }

    function removeFromAllowlist(address wallet) external onlyOwner {
        if (allowlisted[wallet]) {
            allowlisted[wallet] = false;
            unchecked { allowlistCount--; }
            emit AllowlistRemoved(wallet);
        }
    }

    function batchAddToAllowlist(address[] calldata wallets) external onlyOwner {
        for (uint256 i = 0; i < wallets.length;) {
            address w = wallets[i];
            if (w != address(0) && !allowlisted[w]) {
                allowlisted[w] = true;
                unchecked { allowlistCount++; }
                emit AllowlistAdded(w);
            }
            unchecked { ++i; }
        }
    }

    function batchRemoveFromAllowlist(address[] calldata wallets) external onlyOwner {
        for (uint256 i = 0; i < wallets.length;) {
            address w = wallets[i];
            if (allowlisted[w]) {
                allowlisted[w] = false;
                unchecked { allowlistCount--; }
                emit AllowlistRemoved(w);
            }
            unchecked { ++i; }
        }
    }

    // ============ REFUEL ============

    /**
     * @notice Main refuel function (called by backend)
     * @param user Address of the user to refuel
     */
    function refuel(address user) external onlyOwner whenNotPaused nonReentrant {
        if (user == address(0)) revert InvalidAddress();
        if (!allowlisted[user]) revert NotAllowlisted();

        uint256 _refuelAmount = refuelAmount;
        if (address(this).balance < _refuelAmount) revert InsufficientContractBalance();
        if (user.balance >= minBalance) revert UserBalanceSufficient();

        uint256 currentDay = block.timestamp / 1 days;
        if (lastResetDay[user] < currentDay) {
            dailyRefuelCount[user] = 0;
            lastResetDay[user] = currentDay;
        }

        if (block.timestamp < lastRefuelTime[user] + refuelCooldown) revert CooldownActive();
        if (dailyRefuelCount[user] >= maxDailyRefuels) revert DailyLimitReached();

        // Effects before interaction (CEI)
        lastRefuelTime[user] = block.timestamp;
        dailyRefuelCount[user]++;

        // Interaction
        (bool success, ) = payable(user).call{value: _refuelAmount}("");
        if (!success) revert TransferFailed();

        emit Refueled(user, _refuelAmount, block.timestamp);
    }

    /**
     * @notice Batch refuel (gas optimization)
     * @param users Array of user addresses to refuel
     */
    function batchRefuel(address[] calldata users) external onlyOwner whenNotPaused nonReentrant {
        uint256 _refuelAmount = refuelAmount;
        uint256 _minBalance = minBalance;
        uint256 _cooldown = refuelCooldown;
        uint256 _maxDaily = maxDailyRefuels;
        uint256 currentDay = block.timestamp / 1 days;

        for (uint256 i = 0; i < users.length;) {
            address user = users[i];

            if (user == address(0) || !allowlisted[user]) {
                unchecked { ++i; }
                continue;
            }
            if (address(this).balance < _refuelAmount) break;
            if (user.balance >= _minBalance) {
                unchecked { ++i; }
                continue;
            }

            if (lastResetDay[user] < currentDay) {
                dailyRefuelCount[user] = 0;
                lastResetDay[user] = currentDay;
            }

            if (block.timestamp < lastRefuelTime[user] + _cooldown) {
                unchecked { ++i; }
                continue;
            }
            if (dailyRefuelCount[user] >= _maxDaily) {
                unchecked { ++i; }
                continue;
            }

            // Effects before interaction (CEI)
            lastRefuelTime[user] = block.timestamp;
            dailyRefuelCount[user]++;

            // Interaction
            (bool success, ) = payable(user).call{value: _refuelAmount}("");

            if (!success) {
                // Rollback state on failed transfer
                lastRefuelTime[user] = 0;
                unchecked { dailyRefuelCount[user]--; }
            } else {
                emit Refueled(user, _refuelAmount, block.timestamp);
            }

            unchecked { ++i; }
        }
    }

    // ============ VIEW ============

    function canRefuel(address user) external view returns (bool) {
        if (paused()) return false;
        if (!allowlisted[user]) return false;
        if (address(this).balance < refuelAmount) return false;
        if (user.balance >= minBalance) return false;

        uint256 currentDay = block.timestamp / 1 days;
        if (lastResetDay[user] < currentDay) {
            return true;
        }

        if (dailyRefuelCount[user] >= maxDailyRefuels) return false;
        if (block.timestamp < lastRefuelTime[user] + refuelCooldown) return false;

        return true;
    }

    function contractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ============ ADMIN ============

    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoBalanceToWithdraw();

        (bool success, ) = payable(owner()).call{value: balance}("");
        if (!success) revert WithdrawalFailed();

        emit FundsWithdrawn(owner(), balance);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setMinBalance(uint256 _minBalance) external onlyOwner {
        if (_minBalance == 0 || _minBalance > MAX_MIN_BALANCE) revert MinBalanceOutOfBounds();
        emit MinBalanceUpdated(minBalance, _minBalance);
        minBalance = _minBalance;
    }

    function setRefuelAmount(uint256 _refuelAmount) external onlyOwner {
        if (_refuelAmount == 0 || _refuelAmount > MAX_REFUEL_AMOUNT) revert RefuelAmountOutOfBounds();
        emit RefuelAmountUpdated(refuelAmount, _refuelAmount);
        refuelAmount = _refuelAmount;
    }

    function setMaxDailyRefuels(uint256 _maxDailyRefuels) external onlyOwner {
        if (_maxDailyRefuels == 0 || _maxDailyRefuels > MAX_DAILY_REFUELS_CAP) revert MaxDailyRefuelsOutOfBounds();
        emit MaxDailyRefuelsUpdated(maxDailyRefuels, _maxDailyRefuels);
        maxDailyRefuels = _maxDailyRefuels;
    }

    function setRefuelCooldown(uint256 _refuelCooldown) external onlyOwner {
        if (_refuelCooldown > MAX_COOLDOWN) revert CooldownOutOfBounds();
        emit RefuelCooldownUpdated(refuelCooldown, _refuelCooldown);
        refuelCooldown = _refuelCooldown;
    }
}
