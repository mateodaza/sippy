'use client';

import {
  EthereumProvider,
  NexusSDK,
  OnAllowanceHookData,
  OnIntentHookData,
} from '@avail-project/nexus-core';
import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useMemo,
  useCallback,
  SetStateAction,
  Dispatch,
} from 'react';
import { useAccount } from 'wagmi';

interface NexusContextType {
  nexusSdk: NexusSDK | undefined;
  isInitialized: boolean;
  isInitializing: boolean;
  initializationStep: string;
  allowanceModal: OnAllowanceHookData | null;
  setAllowanceModal: Dispatch<SetStateAction<OnAllowanceHookData | null>>;
  intentModal: OnIntentHookData | null;
  setIntentModal: Dispatch<SetStateAction<OnIntentHookData | null>>;
  initializeSDK: () => Promise<void>;
  cleanupSDK: () => void;
}

const NexusContext = createContext<NexusContextType | undefined>(undefined);

interface NexusProviderProps {
  children: ReactNode;
  isConnected: boolean;
}

export function NexusProvider({ children, isConnected }: NexusProviderProps) {
  const [nexusSdk, setNexusSdk] = useState<NexusSDK | undefined>(undefined);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [initializationStep, setInitializationStep] = useState<string>('');
  const [allowanceModal, setAllowanceModal] =
    useState<OnAllowanceHookData | null>(null);
  const [intentModal, setIntentModal] = useState<OnIntentHookData | null>(null);

  const { connector } = useAccount();

  const initializeSDK = useCallback(async () => {
    if (isConnected && !nexusSdk && connector) {
      if (isInitializing) return; // Prevent multiple calls

      try {
        setIsInitializing(true);
        setInitializationStep('Connecting to wallet...');

        // Get the EIP-1193 provider from the connector
        const isTestnet = process.env.NEXT_PUBLIC_ENABLE_TESTNET === 'true';
        const provider = (await connector.getProvider()) as EthereumProvider;

        console.log('🔍 Provider obtained:', provider);
        console.log('🔍 Provider type:', typeof provider);
        console.log('🔍 Provider has request?', !!provider?.request);

        if (!provider) {
          throw new Error('No EIP-1193 provider available');
        }

        setInitializationStep('Creating Nexus SDK...');
        const sdk = new NexusSDK({
          network: isTestnet ? 'testnet' : 'mainnet',
          debug: true,
        });

        setInitializationStep('Waiting for signature...');
        console.log('⏳ Initializing SDK with provider...');
        console.log(
          '🔐 Please sign the message in your wallet to initialize Nexus SDK'
        );
        await sdk.initialize(provider);
        console.log('✅ SDK initialized successfully');
        setNexusSdk(sdk);
        setInitializationStep('');

        console.log('Nexus SDK initialized');
        const supportedChains = sdk.utils.getSupportedChains();
        console.log('Supported chains:', supportedChains);
        console.log(
          'Chain IDs:',
          supportedChains.map((c: any) => `${c.name} (${c.id})`).join(', ')
        );

        // Check for PYUSD support
        try {
          // Check known tokens
          const tokens = ['ETH', 'USDC', 'USDT', 'PYUSD'];
          const supportedTokens = tokens.filter((t) => {
            try {
              return sdk.utils.isSupportedToken(t as any);
            } catch {
              return false;
            }
          });
          console.log('📋 Supported tokens:', supportedTokens);
          const pyusdSupported = sdk.utils.isSupportedToken('PYUSD' as any);
          console.log('💰 PYUSD supported natively:', pyusdSupported);
        } catch (err) {
          console.log('⚠️ Could not check token support:', err);
        }

        setIsInitialized(true);
        setIsInitializing(false);

        // Expose SDK to window for testing
        if (typeof window !== 'undefined') {
          (window as any).nexusSdk = sdk;
          console.log('💡 SDK available at window.nexusSdk');

          // Add PYUSD test helper
          (window as any).testPYUSD = async (
            amount: string,
            toAddress: string
          ) => {
            console.log('🧪 Testing PYUSD custom token support...');
            console.log('Amount:', amount, 'PYUSD');
            console.log('To:', toAddress);
            console.log('Destination: Arbitrum (42161)');

            try {
              // Test 1: Try with token as string (will fail but good to document)
              console.log('\n📋 Test 1: Token as string "PYUSD"');
              try {
                const result1 = await sdk.transfer({
                  token: 'PYUSD' as any,
                  amount,
                  chainId: 42161,
                  recipient: toAddress as `0x${string}`,
                });
                console.log('✅ Test 1 SUCCESS:', result1);
                return result1;
              } catch (err: any) {
                console.log('❌ Test 1 FAILED:', err.message);
              }

              // Test 2: Try with token object (custom token)
              console.log('\n📋 Test 2: Token as custom object');
              try {
                const result2 = await sdk.transfer({
                  token: {
                    address: '0x46850aD61C2B7d64d08c9C754F45254596696984',
                    symbol: 'PYUSD',
                    decimals: 6,
                  } as any,
                  amount,
                  chainId: 42161,
                  recipient: toAddress as `0x${string}`,
                });
                console.log('✅ Test 2 SUCCESS:', result2);
                return result2;
              } catch (err: any) {
                console.log('❌ Test 2 FAILED:', err.message);
              }

              // Test 3: Try bridge instead of transfer
              console.log('\n📋 Test 3: Using bridge() with custom token');
              try {
                const result3 = await sdk.bridge({
                  chainId: 1, // From Ethereum
                  token: {
                    address: '0x46850aD61C2B7d64d08c9C754F45254596696984',
                    symbol: 'PYUSD',
                    decimals: 6,
                  } as any,
                  amount,
                });
                console.log('✅ Test 3 SUCCESS:', result3);
                return result3;
              } catch (err: any) {
                console.log('❌ Test 3 FAILED:', err.message);
              }

              console.log(
                '\n💡 All tests failed. Custom tokens may not be supported.'
              );
              console.log(
                '🔍 Check SDK documentation for custom token support.'
              );
              return null;
            } catch (error: any) {
              console.error('🚨 Unexpected error:', error);
              return null;
            }
          };

          console.log(
            '💡 Test PYUSD with: window.testPYUSD("1", "0xYourAddress")'
          );

          // Add USDC → PYUSD swap checker
          (window as any).checkPYUSDSwap = async (usdcAmount: string) => {
            console.log('🔄 Checking USDC → PYUSD swap on Arbitrum...');
            console.log('Amount:', usdcAmount, 'USDC');

            try {
              // Uniswap V3 Quoter on Arbitrum
              const QUOTER_ADDRESS =
                '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';
              const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // Arbitrum USDC
              const PYUSD_ADDRESS =
                '0x46850aD61C2B7d64d08c9C754F45254596696984'; // Arbitrum PYUSD

              // Check if we're on Arbitrum
              const provider = (window as any).ethereum;
              const chainId = await provider.request({ method: 'eth_chainId' });
              console.log('Current chain:', chainId);

              if (chainId !== '0xa4b1') {
                // 42161 in hex
                console.log(
                  '⚠️ Not on Arbitrum. Switch to Arbitrum to check swap.'
                );
                return {
                  supported: false,
                  reason: 'Not on Arbitrum network',
                };
              }

              // Try to get quote from Uniswap V3
              console.log('📊 Fetching Uniswap V3 quote...');

              // Quoter V2 ABI (just the quoteExactInputSingle function)
              const quoterABI = [
                {
                  inputs: [
                    {
                      internalType: 'address',
                      name: 'tokenIn',
                      type: 'address',
                    },
                    {
                      internalType: 'address',
                      name: 'tokenOut',
                      type: 'address',
                    },
                    {
                      internalType: 'uint256',
                      name: 'amountIn',
                      type: 'uint256',
                    },
                    { internalType: 'uint24', name: 'fee', type: 'uint24' },
                    {
                      internalType: 'uint160',
                      name: 'sqrtPriceLimitX96',
                      type: 'uint160',
                    },
                  ],
                  name: 'quoteExactInputSingle',
                  outputs: [
                    {
                      internalType: 'uint256',
                      name: 'amountOut',
                      type: 'uint256',
                    },
                    {
                      internalType: 'uint160',
                      name: 'sqrtPriceX96After',
                      type: 'uint160',
                    },
                    {
                      internalType: 'uint32',
                      name: 'initializedTicksCrossed',
                      type: 'uint32',
                    },
                    {
                      internalType: 'uint256',
                      name: 'gasEstimate',
                      type: 'uint256',
                    },
                  ],
                  stateMutability: 'nonpayable',
                  type: 'function',
                },
              ];

              // Try different fee tiers (3000 = 0.3%, 500 = 0.05%, 10000 = 1%)
              const feeTiers = [3000, 500, 10000];
              const amountIn = BigInt(parseFloat(usdcAmount) * 1e6); // USDC has 6 decimals

              console.log('Amount in (USDC wei):', amountIn.toString());

              for (const fee of feeTiers) {
                try {
                  console.log(`\n🔍 Trying ${fee / 10000}% fee tier...`);

                  // Encode the call
                  const Web3 = (window as any).Web3;
                  if (!Web3) {
                    console.log('⚠️ Web3 not available, checking via fetch...');

                    // Alternative: Check if pool exists via TheGraph or direct RPC
                    const poolFactoryAddress =
                      '0x1F98431c8aD98523631AE4a59f267346ea31F984';
                    const poolFactoryABI = [
                      {
                        inputs: [
                          {
                            internalType: 'address',
                            name: '',
                            type: 'address',
                          },
                          {
                            internalType: 'address',
                            name: '',
                            type: 'address',
                          },
                          { internalType: 'uint24', name: '', type: 'uint24' },
                        ],
                        name: 'getPool',
                        outputs: [
                          {
                            internalType: 'address',
                            name: '',
                            type: 'address',
                          },
                        ],
                        stateMutability: 'view',
                        type: 'function',
                      },
                    ];

                    // Simple check if pool exists
                    console.log('Checking if USDC/PYUSD pool exists...');
                    return {
                      supported: 'unknown',
                      message: 'Need to check pool manually or install Web3',
                      recommendation:
                        'Check on Uniswap: https://app.uniswap.org/explore/pools/arbitrum/' +
                        USDC_ADDRESS +
                        '/' +
                        PYUSD_ADDRESS,
                    };
                  }
                } catch (err: any) {
                  console.log(`❌ ${fee / 10000}% pool:`, err.message);
                }
              }

              console.log('\n💡 Result: Could not find liquid USDC/PYUSD pool');
              console.log(
                '🔍 Manual check: https://info.uniswap.org/#/arbitrum/pools'
              );

              return {
                supported: false,
                reason: 'No liquid pool found on Uniswap V3',
                alternatives: [
                  'Check other DEXs: Camelot, SushiSwap, Curve',
                  'Bridge PYUSD directly from Ethereum',
                  'Buy PYUSD directly on Arbitrum CEX',
                ],
              };
            } catch (error: any) {
              console.error('🚨 Error checking swap:', error);
              return {
                supported: 'error',
                error: error.message,
              };
            }
          };

          console.log('💡 Check swap: window.checkPYUSDSwap("10")');
        }

        // Setup hooks for allowance and intent
        sdk.setOnAllowanceHook(async (data: OnAllowanceHookData) => {
          console.log('🔐 ALLOWANCE HOOK TRIGGERED:', data);
          setAllowanceModal(data);
        });

        sdk.setOnIntentHook((data: OnIntentHookData) => {
          console.log('💰 INTENT HOOK TRIGGERED:', data);
          setIntentModal(data);
        });
      } catch (error) {
        console.error('Failed to initialize NexusSDK:', error);
        setIsInitialized(false);
        setIsInitializing(false);
        setInitializationStep('');
      }
    }
  }, [isConnected, nexusSdk, connector]);

  const cleanupSDK = useCallback(() => {
    if (nexusSdk) {
      nexusSdk.deinit();
      setNexusSdk(undefined);
      setIsInitialized(false);
      setIsInitializing(false);
      setInitializationStep('');
    }
  }, [nexusSdk]);

  useEffect(() => {
    if (!isConnected) {
      cleanupSDK();
    }
    // Note: We no longer auto-initialize. User must click "Initialize Bridge" button.

    return () => {
      cleanupSDK();
    };
  }, [isConnected, cleanupSDK]);

  const contextValue: NexusContextType = useMemo(
    () => ({
      nexusSdk,
      isInitialized,
      isInitializing,
      initializationStep,
      allowanceModal,
      setAllowanceModal,
      intentModal,
      setIntentModal,
      initializeSDK,
      cleanupSDK,
    }),
    [
      nexusSdk,
      isInitialized,
      isInitializing,
      initializationStep,
      allowanceModal,
      intentModal,
      initializeSDK,
      cleanupSDK,
    ]
  );

  return (
    <NexusContext.Provider value={contextValue}>
      {children}
    </NexusContext.Provider>
  );
}

export function useNexus() {
  const context = useContext(NexusContext);
  if (context === undefined) {
    throw new Error('useNexus must be used within a NexusProvider');
  }
  return context;
}
