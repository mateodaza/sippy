/**
 * Refuel Service
 *
 * Manages automatic gas refueling for user wallets via GasRefuel smart contract
 */

import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import { ethers } from 'ethers'
import { GAS_MIN_BALANCE_ETH } from '@sippy/shared'

// GasRefuel Contract ABI (only the functions we need)
const REFUEL_ABI = [
  'function refuel(address user) external',
  'function canRefuel(address user) external view returns (bool)',
  'function contractBalance() external view returns (uint256)',
  'function paused() external view returns (bool)',
  'event Refueled(address indexed user, uint256 amount, uint256 timestamp)',
]

export interface RefuelResult {
  success: boolean
  txHash?: string
  error?: string
}

const BALANCE_CHECK_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
const LOW_BALANCE_THRESHOLD_ETH = 0.005

class RefuelService {
  private contract: ethers.Contract | null = null
  private provider: ethers.providers.JsonRpcProvider | null = null
  private signer: ethers.Wallet | null = null
  private contractAddress: string
  private balanceMonitorTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.contractAddress = env.get('REFUEL_CONTRACT_ADDRESS', '')

    if (!this.contractAddress) {
      logger.warn('REFUEL_CONTRACT_ADDRESS not set in environment')
      return
    }

    try {
      const rpcUrl = env.get('ARBITRUM_RPC_URL', '')
      const adminKey = env.get('REFUEL_ADMIN_PRIVATE_KEY', '')

      if (!rpcUrl || !adminKey) {
        logger.error('Missing required environment variables for RefuelService')
        return
      }

      this.provider = new ethers.providers.JsonRpcProvider(rpcUrl, {
        chainId: 42161,
        name: 'arbitrum',
      })

      this.signer = new ethers.Wallet(adminKey, this.provider)

      this.contract = new ethers.Contract(this.contractAddress, REFUEL_ABI, this.signer)

      logger.info('RefuelService initialized')
      logger.info('  Contract: %s', this.contractAddress)
      logger.info('  Admin: %s', this.signer.address)

      // Log contract status on startup
      this.logContractStatus()

      // Start periodic balance monitoring
      this.startBalanceMonitor()
    } catch (error) {
      logger.error('Failed to initialize RefuelService: %o', error)
    }
  }

  /**
   * Log contract status for diagnostics
   */
  private async logContractStatus(): Promise<void> {
    try {
      const isPaused = await this.isPaused()
      const balance = await this.getContractBalance()
      logger.info(`  Paused: ${isPaused ? 'YES - NEEDS UNPAUSE' : 'No'}`)
      logger.info(`  Balance: ${balance} ETH`)
      if (isPaused) {
        logger.warn(
          'Refuel contract is PAUSED. Run: cd contracts/gas-refuel && npx hardhat run scripts/unpause.ts --network arbitrum'
        )
      }
      if (Number.parseFloat(balance) < 0.001) {
        logger.warn('Refuel contract has low balance. Send ETH to: %s', this.contractAddress)
      }
    } catch (error) {
      logger.error('Failed to check contract status: %o', error)
    }
  }

  /**
   * Start periodic balance monitoring (every 30 minutes).
   * Logs an error when the GasRefuel contract balance drops below threshold.
   */
  private startBalanceMonitor(): void {
    this.balanceMonitorTimer = setInterval(async () => {
      try {
        const balance = await this.getContractBalance()
        const balanceNum = Number.parseFloat(balance)

        if (balanceNum < LOW_BALANCE_THRESHOLD_ETH) {
          logger.error(
            'GasRefuel contract balance critically low: %s ETH (threshold: %s ETH). Contract: %s',
            balance,
            LOW_BALANCE_THRESHOLD_ETH,
            this.contractAddress
          )
        } else {
          logger.info('GasRefuel balance check: %s ETH', balance)
        }
      } catch (error) {
        logger.error('Periodic balance check failed: %o', error)
      }
    }, BALANCE_CHECK_INTERVAL_MS)

    // Don't keep the process alive just for this timer
    this.balanceMonitorTimer.unref()

    logger.info('  Balance monitor: every %d min', BALANCE_CHECK_INTERVAL_MS / 60_000)
  }

  /**
   * Check if refuel service is available
   */
  isAvailable(): boolean {
    return this.contract !== null && this.signer !== null
  }

  /**
   * Check if a user can be refueled and execute refuel if possible
   * @param userAddress The address to check and potentially refuel
   * @returns RefuelResult with success status and transaction hash
   */
  async checkAndRefuel(userAddress: string): Promise<RefuelResult> {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'Refuel service not available',
      }
    }

    try {
      // Check if user can be refueled via contract
      const canRefuel = await this.contract!.canRefuel(userAddress)

      if (!canRefuel) {
        // Diagnose why
        const isPaused = await this.isPaused()
        if (isPaused) {
          return {
            success: false,
            error: 'Refuel contract is paused',
          }
        }

        const userBalance = await this.getUserBalance(userAddress)
        if (Number.parseFloat(userBalance) >= GAS_MIN_BALANCE_ETH) {
          return {
            success: false,
            error: `User already has sufficient ETH: ${userBalance}`,
          }
        }

        return {
          success: false,
          error: 'User cannot be refueled (daily limit or cooldown)',
        }
      }

      // Execute refuel via contract
      logger.info(`Refueling ${userAddress} via contract...`)
      const tx = await this.contract!.refuel(userAddress, {
        gasLimit: 300000, // Higher gas limit for Smart Account transfers
      })

      const receipt = await tx.wait()

      logger.info(`Refueled ${userAddress}`)
      logger.info(`  TX: ${receipt.transactionHash}`)

      return {
        success: true,
        txHash: receipt.transactionHash,
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error('Refuel failed: %s', msg)

      return {
        success: false,
        error: msg,
      }
    }
  }

  /**
   * Get the contract's ETH balance
   * @returns Balance in ETH as a string
   */
  async getContractBalance(): Promise<string> {
    if (!this.isAvailable()) {
      return '0'
    }

    try {
      const balance = await this.contract!.contractBalance()
      return ethers.utils.formatEther(balance)
    } catch (error) {
      logger.error('Failed to get contract balance: %o', error)
      return '0'
    }
  }

  /**
   * Check if the contract is paused
   * @returns True if paused, false otherwise
   */
  async isPaused(): Promise<boolean> {
    if (!this.isAvailable()) {
      return true
    }

    try {
      return await this.contract!.paused()
    } catch (error) {
      logger.error('Failed to check paused status: %o', error)
      return true
    }
  }

  /**
   * Get user's balance on Arbitrum
   * @param userAddress The address to check
   * @returns Balance in ETH as a string
   */
  async getUserBalance(userAddress: string): Promise<string> {
    if (!this.provider) {
      return '0'
    }

    try {
      const balance = await this.provider.getBalance(userAddress)
      return ethers.utils.formatEther(balance)
    } catch (error) {
      logger.error('Failed to get user balance: %o', error)
      return '0'
    }
  }
}

// Singleton instance
let refuelServiceInstance: RefuelService | null = null

/**
 * Get the RefuelService singleton instance
 */
export function getRefuelService(): RefuelService {
  if (!refuelServiceInstance) {
    refuelServiceInstance = new RefuelService()
  }
  return refuelServiceInstance
}
