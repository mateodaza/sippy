import { NexusSDK } from '@avail-project/nexus-core';

/**
 * PYUSD Single Intent Flow
 *
 * This uses Nexus bridgeAndExecute to:
 * 1. Convert from any token/chain → USDC on Arbitrum
 * 2. Swap USDC → PYUSD on Uniswap V3
 * 3. Send PYUSD directly to recipient (phone number's wallet)
 *
 * All in ONE transaction intent!
 */

const SWAP_ROUTER = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'; // Uniswap V3 SwapRouter02 (supports ETH)
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'; // Arbitrum WETH
const PYUSD = '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8'; // Arbitrum PYUSD (6 decimals)

/**
 * Build the execute params for swapping WETH → PYUSD and sending to recipient
 *
 * Using WETH directly (SDK bridges to WETH, not ETH)
 */
export function buildPyusdSwapExecute(
  recipientAddress: `0x${string}`,
  amountWETH: string
) {
  // Uniswap V3 SwapRouter02 ABI - exactInputSingle function
  const routerAbi = [
    {
      inputs: [
        {
          components: [
            { internalType: 'address', name: 'tokenIn', type: 'address' },
            { internalType: 'address', name: 'tokenOut', type: 'address' },
            { internalType: 'uint24', name: 'fee', type: 'uint24' },
            { internalType: 'address', name: 'recipient', type: 'address' },
            { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
            {
              internalType: 'uint256',
              name: 'amountOutMinimum',
              type: 'uint256',
            },
            {
              internalType: 'uint160',
              name: 'sqrtPriceLimitX96',
              type: 'uint160',
            },
          ],
          internalType: 'struct IV3SwapRouter.ExactInputSingleParams',
          name: 'params',
          type: 'tuple',
        },
      ],
      name: 'exactInputSingle',
      outputs: [
        { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
      ],
      stateMutability: 'payable',
      type: 'function',
    },
  ];

  return {
    contractAddress: SWAP_ROUTER as `0x${string}`,
    contractAbi: routerAbi,
    functionName: 'exactInputSingle',
    buildFunctionParams: (token: any, amount: string) => {
      // Parse amount to wei (18 decimals for WETH)
      const amountInWei = BigInt(Math.floor(parseFloat(amount) * 1e18));

      console.log('🔧 buildFunctionParams called with:', {
        token,
        amount,
        amountInWei: amountInWei.toString(),
      });

      const swapParams = {
        tokenIn: WETH, // WETH on Arbitrum
        tokenOut: PYUSD,
        fee: 3000, // 0.3% fee tier
        recipient: recipientAddress, // Send PYUSD directly to phone!
        amountIn: amountInWei,
        amountOutMinimum: 0, // For testing - calculate with slippage in prod
        sqrtPriceLimitX96: 0,
      };

      console.log('🔧 Swap params:', swapParams);

      return { functionParams: [swapParams] };
    },
    value: '0',
    // Approve WETH for the swap
    tokenApproval: {
      token: 'WETH' as any,
      amount: amountWETH,
      chainId: 42161, // Arbitrum
    },
  };
}

/**
 * Send PYUSD to a phone number using single intent
 *
 * Uses ETH → WETH → PYUSD swap
 *
 * @param nexusSdk - Initialized Nexus SDK instance
 * @param recipientAddress - Resolved wallet address from phone number
 * @param amountETH - Amount in ETH (e.g., "0.001")
 * @returns Transaction result
 */
export async function sendPyusdSingleIntent(
  nexusSdk: NexusSDK,
  recipientAddress: `0x${string}`,
  amountETH: string
) {
  console.log('🚀 Starting PYUSD single intent flow (ETH → WETH → PYUSD)');
  console.log(`   Recipient: ${recipientAddress}`);
  console.log(`   Amount: ${amountETH} ETH`);

  // Build the execute params (swap WETH → PYUSD + send)
  const execute = buildPyusdSwapExecute(recipientAddress, amountETH);

  const params = {
    token: 'ETH' as any, // SDK will bridge as ETH/WETH
    amount: amountETH,
    toChainId: 42161 as any, // Arbitrum
    execute,
    waitForReceipt: true,
    receiptTimeout: 300000, // 5 minutes
  };

  console.log('📋 bridgeAndExecute params:', params);

  try {
    // Execute the full flow in one intent
    const result = await nexusSdk.bridgeAndExecute(params);

    console.log('✅ bridgeAndExecute result:', result);

    if (result.success) {
      return {
        success: true,
        message: `Successfully sent PYUSD to ${recipientAddress}`,
        executeExplorerUrl: result.executeExplorerUrl,
      };
    } else {
      return {
        success: false,
        error: result.error || 'Transaction failed',
      };
    }
  } catch (error: any) {
    console.error('❌ bridgeAndExecute error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Simulate the PYUSD send before executing
 */
export async function simulatePyusdSingleIntent(
  nexusSdk: NexusSDK,
  recipientAddress: `0x${string}`,
  amountETH: string
) {
  const execute = buildPyusdSwapExecute(recipientAddress, amountETH);

  const params = {
    token: 'ETH' as any,
    amount: amountETH,
    toChainId: 42161 as any,
    execute,
  };

  try {
    const simulation = await nexusSdk.simulateBridgeAndExecute(params);
    return simulation;
  } catch (error: any) {
    console.error('Simulation error:', error);
    return { success: false, error: error.message };
  }
}
