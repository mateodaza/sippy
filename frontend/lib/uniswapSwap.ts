import { ethers } from 'ethers';
import { CurrencyAmount, Token, Percent, TradeType } from '@uniswap/sdk-core';
import { SwapRouter, Trade as V3Trade } from '@uniswap/v3-sdk';
import { Pool, Route, FeeAmount } from '@uniswap/v3-sdk';

/**
 * Swap ETH to PYUSD on Arbitrum using Uniswap Universal Router SDK
 * This uses the official SDK to generate the correct commands and inputs
 */

// Contract addresses on Arbitrum
const UNIVERSAL_ROUTER = '0xa51afafe0263b40edaef0df8781ea9aa03e381a3';
const WETH_ADDRESS = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const PYUSD_ADDRESS = '0x46850ad61c2b7d64d08c9c754f45254596696984';

// Arbitrum chain ID
const ARBITRUM_CHAIN_ID = 42161;

interface SwapParams {
  amountInETH: string; // Amount in ETH (e.g., "0.0005")
  recipient: string; // Address to receive PYUSD
  slippageBps?: number; // Slippage in basis points (default 250 = 2.5%)
}

interface SwapResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Fetch pool data from Uniswap V3 subgraph or on-chain
 * For now, we'll use hardcoded liquidity values based on observed pools
 */
async function getPoolData(
  tokenA: Token,
  tokenB: Token,
  fee: FeeAmount,
  provider: ethers.providers.Provider
): Promise<Pool> {
  const poolAddress = Pool.getAddress(tokenA, tokenB, fee);

  // Pool contract ABI (minimal)
  const poolAbi = [
    'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
    'function liquidity() external view returns (uint128)',
  ];

  const poolContract = new ethers.Contract(poolAddress, poolAbi, provider);

  try {
    const [slot0, liquidity] = await Promise.all([
      poolContract.slot0(),
      poolContract.liquidity(),
    ]);

    return new Pool(
      tokenA,
      tokenB,
      fee,
      slot0.sqrtPriceX96.toString(),
      liquidity.toString(),
      slot0.tick
    );
  } catch (error) {
    console.error(
      `Failed to fetch pool data for ${tokenA.symbol}/${tokenB.symbol}:`,
      error
    );
    throw new Error(
      `Pool not found for ${tokenA.symbol}/${tokenB.symbol} with fee ${fee}`
    );
  }
}

/**
 * Get a quote for the swap using Uniswap's Quoter contract
 */
async function getQuote(
  amountInWei: ethers.BigNumber,
  provider: ethers.providers.Provider
): Promise<{ amountOut: ethers.BigNumber; path: string }> {
  // Uniswap V3 Quoter V2 on Arbitrum
  const QUOTER_ADDRESS = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';

  const quoterAbi = [
    'function quoteExactInput(bytes memory path, uint256 amountIn) external returns (uint256 amountOut, uint160[] memory sqrtPriceX96AfterList, uint32[] memory initializedTicksCrossedList, uint256 gasEstimate)',
  ];

  const quoter = new ethers.Contract(QUOTER_ADDRESS, quoterAbi, provider);

  // Encode path: WETH (0.05%) USDC (1%) PYUSD
  const FEE_LOW = 500;
  const FEE_HIGH = 10000;

  const path = ethers.utils.solidityPack(
    ['address', 'uint24', 'address', 'uint24', 'address'],
    [WETH_ADDRESS, FEE_LOW, USDC_ADDRESS, FEE_HIGH, PYUSD_ADDRESS]
  );

  try {
    // Note: quoteExactInput is a state-changing call that reverts with the result
    // We need to use callStatic to get the result without sending a transaction
    const result = await quoter.callStatic.quoteExactInput(path, amountInWei);

    console.log('📊 Quote result:', {
      amountOut: ethers.utils.formatUnits(result.amountOut, 6), // PYUSD has 6 decimals
      gasEstimate: result.gasEstimate?.toString(),
    });

    return {
      amountOut: result.amountOut,
      path,
    };
  } catch (error: any) {
    console.error('Failed to get quote:', error);
    throw new Error('Failed to get swap quote: ' + error.message);
  }
}

/**
 * Execute ETH to PYUSD swap using Universal Router
 */
export async function swapETHToPYUSD(
  signer: ethers.Signer,
  params: SwapParams
): Promise<SwapResult> {
  try {
    const { amountInETH, recipient, slippageBps = 250 } = params;

    console.log('🔄 Starting swap:', { amountInETH, recipient, slippageBps });

    // Get provider and check network
    const provider = signer.provider;
    if (!provider) {
      throw new Error('Signer must have a provider');
    }

    const network = await provider.getNetwork();
    console.log('🔍 Swap helper - Current network:', network.chainId);

    if (network.chainId !== ARBITRUM_CHAIN_ID) {
      throw new Error(
        `Wrong network! Expected Arbitrum (${ARBITRUM_CHAIN_ID}) but got ${network.chainId}`
      );
    }

    // Check balance
    const userAddress = await signer.getAddress();
    const balance = await provider.getBalance(userAddress);
    const amountInWei = ethers.utils.parseEther(amountInETH);

    console.log('💰 Balance check:', {
      balance: ethers.utils.formatEther(balance),
      required: amountInETH,
    });

    if (balance.lt(amountInWei)) {
      throw new Error(
        `Insufficient ETH. You have ${ethers.utils.formatEther(
          balance
        )} ETH but need ${amountInETH} ETH`
      );
    }

    // Get quote from Uniswap
    console.log('📊 Getting quote from Uniswap...');
    const { amountOut, path } = await getQuote(amountInWei, provider);

    // Calculate minimum amount out with slippage
    const slippagePercent = new Percent(slippageBps, 10000);
    const amountOutMin = amountOut.sub(amountOut.mul(slippageBps).div(10000));

    console.log('💱 Swap details:', {
      amountIn: amountInETH + ' ETH',
      expectedOut: ethers.utils.formatUnits(amountOut, 6) + ' PYUSD',
      minOut: ethers.utils.formatUnits(amountOutMin, 6) + ' PYUSD',
      slippage: slippageBps / 100 + '%',
    });

    // Build transaction using Universal Router
    const deadline = Math.floor(Date.now() / 1000) + 60 * 30; // 30 minutes

    // Commands based on Uniswap's actual implementation
    // 0x0b = WRAP_ETH
    // 0x00 = V3_SWAP_EXACT_IN
    // 0x0c = UNWRAP_WETH (if needed)
    const commands = '0x0b00'; // WRAP_ETH + V3_SWAP_EXACT_IN

    const ADDRESS_THIS = '0x0000000000000000000000000000000000000002';
    const MSG_SENDER = '0x0000000000000000000000000000000000000001';

    const inputs: string[] = [];

    // Input 0: WRAP_ETH
    inputs.push(
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256'],
        [ADDRESS_THIS, amountInWei]
      )
    );

    // Input 1: V3_SWAP_EXACT_IN
    inputs.push(
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool'],
        [
          recipient, // Send directly to recipient
          amountInWei,
          amountOutMin,
          path,
          false, // Payer is not user
        ]
      )
    );

    // Create router contract
    const routerAbi = [
      'function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable',
    ];
    const router = new ethers.Contract(UNIVERSAL_ROUTER, routerAbi, signer);

    console.log('🚀 Sending transaction...');
    console.log('Commands:', commands);
    console.log('Inputs count:', inputs.length);
    console.log('Value:', ethers.utils.formatEther(amountInWei), 'ETH');
    console.log('Deadline:', new Date(deadline * 1000).toISOString());

    // Execute the swap
    const tx = await router.execute(commands, inputs, deadline, {
      value: amountInWei,
      gasLimit: 500000, // Safe gas limit
    });

    console.log('✅ Transaction sent:', tx.hash);
    console.log('⏳ Waiting for confirmation...');

    const receipt = await tx.wait();

    if (receipt.status === 1) {
      console.log('✅ Swap successful!');
      return {
        success: true,
        txHash: tx.hash,
      };
    } else {
      return {
        success: false,
        error: 'Transaction failed on-chain',
      };
    }
  } catch (error: any) {
    console.error('❌ Swap error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Get user's address from signer
 */
export async function getUserAddress(signer: ethers.Signer): Promise<string> {
  return await signer.getAddress();
}
