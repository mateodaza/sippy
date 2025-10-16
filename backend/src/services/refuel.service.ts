/**
 * Refuel Service
 *
 * Manages automatic gas refueling for user wallets via GasRefuel smart contract
 */

import { ethers } from 'ethers';

// GasRefuel Contract ABI (only the functions we need)
const REFUEL_ABI = [
  'function refuel(address user) external',
  'function canRefuel(address user) external view returns (bool)',
  'function contractBalance() external view returns (uint256)',
  'function paused() external view returns (bool)',
  'event Refueled(address indexed user, uint256 amount, uint256 timestamp)',
];

export interface RefuelResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

class RefuelService {
  private contract: ethers.Contract | null = null;
  private provider: ethers.providers.JsonRpcProvider | null = null;
  private signer: ethers.Wallet | null = null;
  private contractAddress: string;

  constructor() {
    this.contractAddress = process.env.REFUEL_CONTRACT_ADDRESS || '';

    if (!this.contractAddress) {
      console.warn('⚠️ REFUEL_CONTRACT_ADDRESS not set in environment');
      return;
    }

    try {
      const rpcUrl = process.env.ARBITRUM_RPC_URL;
      const adminKey = process.env.REFUEL_ADMIN_PRIVATE_KEY;

      if (!rpcUrl || !adminKey) {
        console.error(
          '❌ Missing required environment variables for RefuelService'
        );
        return;
      }

      this.provider = new ethers.providers.JsonRpcProvider(rpcUrl, {
        chainId: 42161,
        name: 'arbitrum',
      });

      this.signer = new ethers.Wallet(adminKey, this.provider);

      this.contract = new ethers.Contract(
        this.contractAddress,
        REFUEL_ABI,
        this.signer
      );

      console.log('✅ RefuelService initialized');
      console.log('  • Contract:', this.contractAddress);
      console.log('  • Admin:', this.signer.address);
    } catch (error) {
      console.error('❌ Failed to initialize RefuelService:', error);
    }
  }

  /**
   * Check if refuel service is available
   */
  isAvailable(): boolean {
    return this.contract !== null && this.signer !== null;
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
      };
    }

    try {
      // Check if user needs refuel
      const canRefuel = await this.contract!.canRefuel(userAddress);

      if (!canRefuel) {
        return {
          success: false,
          error: 'User does not need refuel or cannot be refueled',
        };
      }

      // Execute refuel
      console.log(`⛽ Refueling ${userAddress}...`);
      const tx = await this.contract!.refuel(userAddress, {
        gasLimit: 200000, // Increased gas limit for refuel operation
      });

      const receipt = await tx.wait();

      console.log(`✅ Refueled ${userAddress}`);
      console.log(`  • TX: ${receipt.transactionHash}`);
      console.log(`  • Gas used: ${receipt.gasUsed.toString()}`);

      return {
        success: true,
        txHash: receipt.transactionHash,
      };
    } catch (error: any) {
      console.error('❌ Refuel failed:', error.message || error);

      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Get the contract's ETH balance
   * @returns Balance in ETH as a string
   */
  async getContractBalance(): Promise<string> {
    if (!this.isAvailable()) {
      return '0';
    }

    try {
      const balance = await this.contract!.contractBalance();
      return ethers.utils.formatEther(balance);
    } catch (error) {
      console.error('❌ Failed to get contract balance:', error);
      return '0';
    }
  }

  /**
   * Check if the contract is paused
   * @returns True if paused, false otherwise
   */
  async isPaused(): Promise<boolean> {
    if (!this.isAvailable()) {
      return true;
    }

    try {
      return await this.contract!.paused();
    } catch (error) {
      console.error('❌ Failed to check paused status:', error);
      return true;
    }
  }

  /**
   * Get user's balance on Arbitrum
   * @param userAddress The address to check
   * @returns Balance in ETH as a string
   */
  async getUserBalance(userAddress: string): Promise<string> {
    if (!this.provider) {
      return '0';
    }

    try {
      const balance = await this.provider.getBalance(userAddress);
      return ethers.utils.formatEther(balance);
    } catch (error) {
      console.error('❌ Failed to get user balance:', error);
      return '0';
    }
  }
}

// Singleton instance
let refuelServiceInstance: RefuelService | null = null;

/**
 * Get the RefuelService singleton instance
 */
export function getRefuelService(): RefuelService {
  if (!refuelServiceInstance) {
    refuelServiceInstance = new RefuelService();
  }
  return refuelServiceInstance;
}
