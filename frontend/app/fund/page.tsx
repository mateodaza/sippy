'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { bridgeEthToArbitrum } from '../../lib/nexus';
import { swapETHToPYUSD } from '../../lib/uniswapSwap';
import { z } from 'zod';
import type { UserAsset } from '@avail-project/nexus-core';
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';
import { useNexus } from '../providers/NexusProvider';

const phoneSchema = z
  .string()
  .regex(/^\+?\d{10,15}$/, 'Invalid phone number format');

// Constants for refuel amounts
const REFUEL_AMOUNTS = [
  { label: '1 transaction', amount: '0.0001', txCount: 1 },
  { label: '5 transactions', amount: '0.0005', txCount: 5 },
  { label: '10 transactions', amount: '0.001', txCount: 10 },
  { label: '20 transactions', amount: '0.002', txCount: 20 },
];

// Helper to format step names
const formatStepName = (type: string): string => {
  const stepNames: Record<string, string> = {
    deposit: '💰 Depositing from source chain',
    bridge: '🌉 Bridging to destination',
    fill: '📦 Filling on destination chain',
    transfer: '📤 Transferring to recipient',
    send: '✉️ Sending to recipient',
    approval: '✅ Approving token',
    execute: '⚡ Executing transaction',
  };
  return stepNames[type] || `🔄 ${type}`;
};

export default function FundPage() {
  const { address, isConnected } = useAccount();
  const {
    nexusSdk,
    isInitialized,
    isInitializing,
    initializationStep,
    allowanceModal,
    setAllowanceModal,
    intentModal,
    setIntentModal,
    initializeSDK,
  } = useNexus();

  const [phoneNumber, setPhoneNumber] = useState(() => {
    // Load last used phone number from localStorage
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lastPhoneNumber') || '';
    }
    return '';
  });
  const [hasLoadedPhone, setHasLoadedPhone] = useState(() => {
    if (typeof window !== 'undefined') {
      return !!localStorage.getItem('lastPhoneNumber');
    }
    return false;
  });
  const [selectedRefuel, setSelectedRefuel] = useState(REFUEL_AMOUNTS[1]); // Default: 5 tx
  const [pyusdAmount, setPyusdAmount] = useState('0.001'); // Default amount for PYUSD operations
  const [transferMode, setTransferMode] = useState<'gas' | 'pyusd'>('pyusd'); // Default to PYUSD
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentStep, setCurrentStep] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState('');

  // Progress tracking state
  const [progressSteps, setProgressSteps] = useState<any[]>([]);
  const [showProgress, setShowProgress] = useState(false);

  // Unified balance state
  const [totalEthBalance, setTotalEthBalance] = useState('0');
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [supportedChainsCount, setSupportedChainsCount] = useState<number>(0);

  // Save phone number to localStorage whenever it changes
  useEffect(() => {
    if (phoneNumber && typeof window !== 'undefined') {
      localStorage.setItem('lastPhoneNumber', phoneNumber);
    }
  }, [phoneNumber]);

  // Helper: Check ETH balance on Arbitrum
  const checkArbitrumBalance = async (): Promise<number> => {
    try {
      const { ethers } = await import('ethers');
      const provider = new ethers.providers.Web3Provider(
        (window as any).ethereum
      );

      // Get current network
      const network = await provider.getNetwork();

      // If not on Arbitrum, switch first
      if (network.chainId !== 42161) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xa4b1' }],
          });
        } catch (switchError: any) {
          if (switchError?.code === 4902) {
            await (window as any).ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: '0xa4b1',
                  chainName: 'Arbitrum One',
                  nativeCurrency: {
                    name: 'Ether',
                    symbol: 'ETH',
                    decimals: 18,
                  },
                  rpcUrls: ['https://arb1.arbitrum.io/rpc'],
                  blockExplorerUrls: ['https://arbiscan.io'],
                },
              ],
            });
          } else {
            throw switchError;
          }
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Get balance on Arbitrum
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      const balance = await provider.getBalance(address);

      return parseFloat(ethers.utils.formatEther(balance));
    } catch (error) {
      console.error('Failed to check Arbitrum balance:', error);
      return 0;
    }
  };

  // Fetch unified balances when SDK is ready
  useEffect(() => {
    const fetchBalances = async () => {
      if (!nexusSdk || !isInitialized || !isConnected) return;

      try {
        setIsLoadingBalance(true);

        // Get supported chains count safely
        try {
          const chains = nexusSdk.utils.getSupportedChains();
          setSupportedChainsCount(chains.length);
        } catch (err) {
          console.error('Failed to get supported chains:', err);
          setSupportedChainsCount(0);
        }

        const balances = await nexusSdk.getUnifiedBalances();

        // Find ETH and calculate total
        const ethAsset = balances.find(
          (asset: UserAsset) =>
            asset.symbol === 'ETH' || asset.symbol === 'WETH'
        );
        if (ethAsset) {
          setTotalEthBalance(ethAsset.balance);
        }
      } catch (err) {
        console.error('Failed to fetch balances:', err);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchBalances();
  }, [nexusSdk, isInitialized, isConnected]);

  // Subscribe to SDK progress events
  useEffect(() => {
    if (!nexusSdk) return;

    const handleExpectedSteps = (steps: any[]) => {
      console.log('📋 Expected steps:', steps);
      setProgressSteps(steps.map((step) => ({ ...step, done: false })));
      setShowProgress(true);
    };

    const handleStepComplete = (step: any) => {
      console.log('✅ Step completed:', step);
      setProgressSteps((prev) =>
        prev.map((s) => (s.typeID === step.typeID ? { ...s, done: true } : s))
      );
    };

    // Subscribe to events - try both transfer and bridge events
    nexusSdk.nexusEvents?.on('expectedSteps', handleExpectedSteps);
    nexusSdk.nexusEvents?.on('stepComplete', handleStepComplete);

    return () => {
      nexusSdk.nexusEvents?.off('expectedSteps', handleExpectedSteps);
      nexusSdk.nexusEvents?.off('stepComplete', handleStepComplete);
    };
  }, [nexusSdk]);

  const resolvePhone = async (phone: string): Promise<`0x${string}` | null> => {
    try {
      setCurrentStep('🔍 Resolving phone number...');
      console.log('📱 Resolving phone number:', phone);
      const response = await fetch(
        `/api/resolve-phone?phone=${encodeURIComponent(phone)}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to resolve phone number');
      }

      const data = await response.json();
      console.log('✅ Phone resolved to address:', data.address);
      return data.address as `0x${string}`;
    } catch (err) {
      console.error('❌ Error resolving phone:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to resolve phone number'
      );
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nexusSdk || !isInitialized) {
      setError('Nexus SDK not initialized');
      return;
    }

    setError('');
    setSuccess('');
    setIsLoading(true);
    setCurrentStep('');
    setProgressSteps([]);
    setShowProgress(false);

    try {
      // Validate phone number
      const validatedPhone = phoneSchema.parse(phoneNumber);

      // Check if we have enough balance
      const amountNum = parseFloat(selectedRefuel.amount);
      if (amountNum > parseFloat(totalEthBalance)) {
        throw new Error(
          `Insufficient balance. You need ${selectedRefuel.amount} ETH but only have ${totalEthBalance} ETH available.`
        );
      }

      // Resolve phone to address
      const recipientAddress = await resolvePhone(validatedPhone);
      if (!recipientAddress) {
        throw new Error('Could not resolve phone number to address');
      }

      // Store resolved address for display
      setResolvedAddress(recipientAddress);

      // Transfer ETH to Arbitrum (SDK auto-selects best source chain and bridges if needed)
      setCurrentStep('🌉 Finding best route across your chains...');
      console.log('🔵 Transferring ETH to Arbitrum...', {
        amount: selectedRefuel.amount,
        to: recipientAddress,
        destinationChain: 'Arbitrum (42161)',
        txCount: selectedRefuel.txCount,
      });

      // Give user context before signature request
      await new Promise((resolve) => setTimeout(resolve, 800));
      setCurrentStep(
        `✍️ Please sign to send ${selectedRefuel.amount} ETH to ${phoneNumber} on Arbitrum`
      );

      const result = await bridgeEthToArbitrum(nexusSdk, {
        fromChainId: 1, // SDK will auto-optimize source chain
        toChainId: 42161, // Arbitrum
        token: 'ETH',
        amount: selectedRefuel.amount,
        toAddress: recipientAddress,
      });

      if (result.success) {
        setCurrentStep('');
        setShowProgress(false);
        setProgressSteps([]);
        setSuccess(
          `✅ Successfully funded ${phoneNumber} with gas for ~${selectedRefuel.txCount} transactions!`
        );
        setPhoneNumber('');

        // Refresh balances
        setTimeout(async () => {
          if (nexusSdk && isInitialized) {
            const balances = await nexusSdk.getUnifiedBalances();
            const ethAsset = balances.find(
              (asset: UserAsset) =>
                asset.symbol === 'ETH' || asset.symbol === 'WETH'
            );
            if (ethAsset) {
              setTotalEthBalance(ethAsset.balance);
            }
          }
        }, 2000);
      } else {
        throw new Error(result.error || 'Bridge failed');
      }
    } catch (err) {
      console.error('Bridge error:', err);
      setCurrentStep('');
      setShowProgress(false);
      setProgressSteps([]);
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError(err instanceof Error ? err.message : 'Transaction failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4'>
      <div className='max-w-md mx-auto'>
        <div className='bg-white rounded-2xl shadow-xl p-8'>
          <h1 className='text-3xl font-bold text-gray-900 mb-2'>
            ⛽ Fund My Phone
          </h1>
          <p className='text-gray-600 mb-8'>
            Send gas to any phone number instantly
          </p>

          {!isConnected ? (
            <div className='text-center py-8'>
              <div className='mb-6'>
                <div className='w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full mx-auto mb-4 flex items-center justify-center'>
                  <svg
                    className='w-8 h-8 text-white'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z'
                    />
                  </svg>
                </div>
                <h2 className='cursor-pointer text-xl font-bold text-gray-900 mb-2'>
                  Connect Your Wallet
                </h2>
                <p className='text-gray-600 mb-6 max-w-sm mx-auto'>
                  Choose your preferred wallet to get started. We support
                  MetaMask, Coinbase Wallet, WalletConnect, and more.
                </p>
              </div>
              <ConnectKitButton />
              <div className='mt-6 p-4 bg-blue-50 rounded-lg max-w-sm mx-auto'>
                <p className='text-xs text-blue-700'>
                  💡 <strong>New to crypto?</strong> We recommend{' '}
                  <a
                    href='https://www.coinbase.com/wallet'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='underline font-semibold'
                  >
                    Coinbase Wallet
                  </a>{' '}
                  for beginners
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Wallet Info & Actions */}
              <div className='mb-6 space-y-3'>
                <div className='p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200'>
                  <p className='text-xs text-gray-500 mb-1'>Connected Wallet</p>
                  <p className='text-sm font-mono text-gray-900'>
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </p>
                </div>

                {/* SDK Status */}
                {!isInitialized && !isInitializing && (
                  <div className='p-4 bg-yellow-50 border border-yellow-200 rounded-lg'>
                    <div className='flex items-center justify-between'>
                      <div className='flex-1'>
                        <p className='text-sm font-medium text-yellow-900'>
                          🔐 Bridge Needs Initialization
                        </p>
                        <p className='text-xs text-yellow-600 mt-1'>
                          Click to sign and enable cross-chain transfers
                        </p>
                      </div>
                      <button
                        onClick={() => initializeSDK()}
                        className='px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700 transition-colors'
                      >
                        Initialize Bridge
                      </button>
                    </div>
                  </div>
                )}

                {!isInitialized && isInitializing && (
                  <div className='p-4 bg-blue-50 border border-blue-200 rounded-lg'>
                    <div className='flex items-center justify-between'>
                      <div className='flex-1'>
                        <p className='text-sm font-medium text-blue-900'>
                          {initializationStep === 'Waiting for signature...'
                            ? '✍️ Signature Required'
                            : '🔄 Initializing bridge...'}
                        </p>
                        <p className='text-xs text-blue-600 mt-1'>
                          {initializationStep ||
                            'Setting up cross-chain connections'}
                        </p>
                        {initializationStep === 'Waiting for signature...' && (
                          <p className='text-xs text-blue-500 mt-2 font-medium'>
                            📱 Please sign the message in your wallet
                          </p>
                        )}
                      </div>
                      <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600'></div>
                    </div>
                  </div>
                )}

                {isInitialized && (
                  <div className='p-3 bg-green-50 border border-green-200 rounded-lg'>
                    <p className='text-sm text-green-800 flex items-center'>
                      <svg
                        className='w-4 h-4 mr-2'
                        fill='currentColor'
                        viewBox='0 0 20 20'
                      >
                        <path
                          fillRule='evenodd'
                          d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z'
                          clipRule='evenodd'
                        />
                      </svg>
                      Ready to bridge! Connected to {supportedChainsCount}{' '}
                      chains
                    </p>
                  </div>
                )}
              </div>

              {/* Balance Display - Only show after SDK is initialized */}
              {isInitialized && (
                <>
                  {isLoadingBalance ? (
                    <div className='mb-6 p-4 bg-blue-50 rounded-lg'>
                      <p className='text-sm text-gray-600'>
                        Loading your balance...
                      </p>
                    </div>
                  ) : parseFloat(totalEthBalance) > 0 ? (
                    <div className='mb-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200'>
                      <div className='flex justify-between items-center'>
                        <span className='text-sm font-medium text-gray-700'>
                          💰 Available ETH (All Chains)
                        </span>
                        <span className='text-lg font-bold text-gray-900'>
                          {parseFloat(totalEthBalance).toFixed(6)} ETH
                        </span>
                      </div>
                      <p className='text-xs text-gray-500 mt-1'>
                        Aggregated across all supported chains
                      </p>
                    </div>
                  ) : (
                    <div className='mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200'>
                      <p className='text-sm text-yellow-800'>
                        ⚠️ No ETH available. Please add funds to any supported
                        chain.
                      </p>
                    </div>
                  )}
                </>
              )}

              <form onSubmit={handleSubmit} className='space-y-6'>
                {/* Transfer Mode Selection */}
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-3'>
                    💸 What would you like to send?
                  </label>
                  <div className='grid grid-cols-2 gap-3'>
                    <button
                      type='button'
                      onClick={() => setTransferMode('gas')}
                      disabled={isLoading}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        transferMode === 'gas'
                          ? 'border-blue-500 bg-blue-50 shadow-md'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className='text-center'>
                        <p className='text-2xl mb-1'>⛽</p>
                        <p className='font-semibold text-gray-900'>Gas (ETH)</p>
                        <p className='text-xs text-gray-500 mt-1'>
                          For transactions
                        </p>
                      </div>
                    </button>
                    <button
                      type='button'
                      onClick={() => setTransferMode('pyusd')}
                      disabled={isLoading}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        transferMode === 'pyusd'
                          ? 'border-blue-500 bg-blue-50 shadow-md'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className='text-center'>
                        <p className='text-2xl mb-1'>💵</p>
                        <p className='font-semibold text-gray-900'>PYUSD</p>
                        <p className='text-xs text-gray-500 mt-1'>
                          Stablecoin ($)
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Phone Number Input */}
                <div>
                  <label
                    htmlFor='phone'
                    className='block text-sm font-medium text-gray-700 mb-2'
                  >
                    📱 Recipient's Phone Number
                  </label>
                  <PhoneInput
                    defaultCountry='co'
                    value={phoneNumber}
                    onChange={(phone) => {
                      setPhoneNumber(phone);
                      setHasLoadedPhone(false);
                    }}
                    disabled={isLoading}
                    inputClassName='phone-input-field'
                    countrySelectorStyleProps={{
                      buttonClassName: 'phone-country-button',
                    }}
                    inputProps={{
                      required: true,
                      className:
                        'w-full pl-14 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg',
                    }}
                  />
                  {hasLoadedPhone && phoneNumber ? (
                    <p className='mt-1 text-xs text-green-600 flex items-center'>
                      <svg
                        className='w-3 h-3 mr-1'
                        fill='currentColor'
                        viewBox='0 0 20 20'
                      >
                        <path
                          fillRule='evenodd'
                          d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z'
                          clipRule='evenodd'
                        />
                      </svg>
                      Loaded last used number
                    </p>
                  ) : (
                    <p className='mt-1 text-xs text-gray-500'>
                      Select country code and enter phone number
                    </p>
                  )}
                </div>

                {/* PYUSD Amount Input - Only show for PYUSD mode */}
                {transferMode === 'pyusd' && (
                  <div>
                    <label
                      htmlFor='pyusdAmount'
                      className='block text-sm font-medium text-gray-700 mb-2'
                    >
                      💰 Amount (ETH to convert)
                    </label>
                    <div className='relative'>
                      <input
                        id='pyusdAmount'
                        type='number'
                        step='0.0001'
                        min='0.0001'
                        max='10'
                        value={pyusdAmount}
                        onChange={(e) => setPyusdAmount(e.target.value)}
                        disabled={isLoading}
                        className='w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg'
                        placeholder='0.001'
                      />
                      <span className='absolute right-4 top-3.5 text-gray-500 font-medium'>
                        ETH
                      </span>
                    </div>

                    {/* Quick Amount Buttons */}
                    <div className='mt-3 flex gap-2'>
                      {['0.0005', '0.001', '0.005', '0.01'].map((amount) => (
                        <button
                          key={amount}
                          type='button'
                          onClick={() => setPyusdAmount(amount)}
                          disabled={isLoading}
                          className={`flex-1 px-3 py-2 rounded-md border transition-all text-sm font-medium ${
                            pyusdAmount === amount
                              ? 'bg-blue-500 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                          }`}
                        >
                          {amount}
                        </button>
                      ))}
                    </div>
                    <div className='mt-2 space-y-1'>
                      <p className='text-xs text-gray-500'>
                        Amount of ETH to convert to PYUSD (~
                        {(parseFloat(pyusdAmount) * 3758).toFixed(2)} PYUSD)
                      </p>
                      {isInitialized && parseFloat(pyusdAmount) > 0 && (
                        <>
                          {parseFloat(pyusdAmount) + 0.002 >
                          parseFloat(totalEthBalance) ? (
                            <p className='text-xs text-red-600 font-medium'>
                              ⚠️ Insufficient balance. You need{' '}
                              {(parseFloat(pyusdAmount) + 0.002).toFixed(4)} ETH
                              but only have{' '}
                              {parseFloat(totalEthBalance).toFixed(4)} ETH
                            </p>
                          ) : (
                            <p className='text-xs text-green-600'>
                              ✓ Sufficient balance available
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Refuel Amount Selection - Only show for Gas mode */}
                {transferMode === 'gas' && (
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-3'>
                      ⚡ Gas Amount
                    </label>
                    <div className='grid grid-cols-2 gap-3'>
                      {REFUEL_AMOUNTS.map((option) => (
                        <button
                          key={option.txCount}
                          type='button'
                          onClick={() => setSelectedRefuel(option)}
                          disabled={isLoading}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            selectedRefuel.txCount === option.txCount
                              ? 'border-blue-500 bg-blue-50 shadow-md'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className='text-center'>
                            <p className='font-semibold text-gray-900'>
                              {option.label}
                            </p>
                            <p className='text-xs text-gray-500 mt-1'>
                              {option.amount} ETH
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                    <p className='mt-2 text-xs text-gray-500'>
                      💡 This covers gas for approximately{' '}
                      {selectedRefuel.txCount} transfers on Arbitrum
                    </p>
                  </div>
                )}

                {/* Current Step Display */}
                {currentStep && (
                  <div className='p-4 bg-blue-50 border border-blue-200 rounded-lg'>
                    <p className='text-sm text-blue-700 text-center animate-pulse'>
                      {currentStep}
                    </p>
                  </div>
                )}

                {/* Transaction Progress Steps */}
                {showProgress && progressSteps.length > 0 && (
                  <div className='p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg'>
                    <h4 className='text-sm font-semibold text-blue-900 mb-3'>
                      🔄 Transaction Progress
                    </h4>
                    <div className='space-y-2'>
                      {progressSteps.map((step, index) => (
                        <div
                          key={step.typeID || index}
                          className='flex items-center gap-3'
                        >
                          <div
                            className={`w-3 h-3 rounded-full flex-shrink-0 ${
                              step.done
                                ? 'bg-green-500'
                                : 'bg-blue-300 animate-pulse'
                            }`}
                          />
                          <div className='flex-1'>
                            <p
                              className={`text-sm ${
                                step.done
                                  ? 'text-green-700 line-through'
                                  : 'text-blue-900 font-medium'
                              }`}
                            >
                              {formatStepName(step.type)}
                            </p>
                            {step.chainName && (
                              <p className='text-xs text-gray-500'>
                                Chain: {step.chainName}
                              </p>
                            )}
                          </div>
                          {step.done && (
                            <span className='text-green-600 text-lg'>✓</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className='mt-3 pt-3 border-t border-blue-200'>
                      <p className='text-xs text-blue-600 text-center'>
                        {progressSteps.filter((s) => s.done).length} /{' '}
                        {progressSteps.length} steps completed
                      </p>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {error && (
                  <div className='p-4 bg-red-50 border border-red-200 rounded-lg'>
                    <p className='text-sm text-red-600'>{error}</p>
                  </div>
                )}

                {/* Success Message */}
                {success && (
                  <div className='p-4 bg-green-50 border border-green-200 rounded-lg'>
                    <p className='text-sm text-green-600'>{success}</p>
                  </div>
                )}

                {/* Submit Button for Gas Mode */}
                {transferMode === 'gas' && (
                  <button
                    type='submit'
                    disabled={
                      isLoading ||
                      !isInitialized ||
                      !phoneNumber ||
                      parseFloat(totalEthBalance) === 0 ||
                      parseFloat(selectedRefuel.amount) >
                        parseFloat(totalEthBalance)
                    }
                    className='w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 px-4 rounded-lg font-semibold hover:from-blue-700 hover:to-blue-800 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl'
                  >
                    {isLoading ? (
                      <span className='flex items-center justify-center'>
                        <svg
                          className='animate-spin -ml-1 mr-3 h-5 w-5 text-white'
                          xmlns='http://www.w3.org/2000/svg'
                          fill='none'
                          viewBox='0 0 24 24'
                        >
                          <circle
                            className='opacity-25'
                            cx='12'
                            cy='12'
                            r='10'
                            stroke='currentColor'
                            strokeWidth='4'
                          ></circle>
                          <path
                            className='opacity-75'
                            fill='currentColor'
                            d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                          ></path>
                        </svg>
                        Processing...
                      </span>
                    ) : (
                      `⚡ Send ${selectedRefuel.amount} ETH`
                    )}
                  </button>
                )}

                {/* Submit Button for PYUSD Mode */}
                {transferMode === 'pyusd' && (
                  <>
                    <button
                      type='button'
                      onClick={async () => {
                        if (!isConnected || !phoneNumber || !nexusSdk) {
                          setError(
                            'Connect wallet, initialize bridge, and enter phone number first'
                          );
                          return;
                        }

                        try {
                          setIsLoading(true);
                          setError('');
                          setSuccess('');
                          setShowProgress(true);
                          setProgressSteps([]);
                          setCurrentStep('Resolving phone number...');

                          // Resolve recipient
                          const recipientAddr = await resolvePhone(phoneNumber);
                          if (!recipientAddr) {
                            throw new Error('Failed to resolve phone number');
                          }

                          setResolvedAddress(recipientAddr);
                          console.log('📱 Resolved phone to:', recipientAddr);

                          if (!pyusdAmount || parseFloat(pyusdAmount) <= 0) {
                            throw new Error('Please enter a valid amount');
                          }

                          const swapAmount = parseFloat(pyusdAmount);
                          const minRequired = swapAmount + 0.002; // + gas buffer

                          // Check total available balance across all chains
                          const totalAvailable = parseFloat(totalEthBalance);
                          if (totalAvailable < minRequired) {
                            throw new Error(
                              `Insufficient balance. You have ${totalAvailable.toFixed(
                                4
                              )} ETH but need at least ${minRequired.toFixed(
                                4
                              )} ETH (${swapAmount} for swap + 0.002 for gas)`
                            );
                          }

                          // Check current balance on Arbitrum
                          setCurrentStep('Checking Arbitrum balance...');
                          const arbBalance = await checkArbitrumBalance();
                          console.log(
                            `💰 Current Arbitrum balance: ${arbBalance} ETH`
                          );

                          let skippedBridge = false;

                          // Step 1: Bridge if needed
                          if (arbBalance < minRequired) {
                            const neededAmount = minRequired - arbBalance;
                            const bridgeAmount = Math.max(
                              neededAmount,
                              0.001
                            ).toFixed(4);

                            setCurrentStep(
                              `Step 1/2: Bridging ${bridgeAmount} ETH to Arbitrum...`
                            );
                            console.log(
                              `🌉 Need to bridge ${bridgeAmount} ETH`
                            );

                            const bridgeResult = await bridgeEthToArbitrum(
                              nexusSdk,
                              {
                                fromChainId: 1, // Will auto-detect best source
                                toChainId: 42161,
                                token: 'ETH',
                                amount: bridgeAmount,
                              }
                            );

                            if (!bridgeResult.success) {
                              throw new Error(
                                bridgeResult.error || 'Bridge failed'
                              );
                            }

                            console.log('✅ Bridge completed');
                            setCurrentStep('Waiting for funds on Arbitrum...');

                            // Wait for bridge to settle
                            await new Promise((r) => setTimeout(r, 5000));

                            // After bridge, we should already be on Arbitrum
                            // Force switch to Arbitrum to be sure
                            setCurrentStep('Confirming Arbitrum network...');
                            try {
                              await (window as any).ethereum.request({
                                method: 'wallet_switchEthereumChain',
                                params: [{ chainId: '0xa4b1' }],
                              });
                            } catch (err) {
                              console.warn(
                                'Already on Arbitrum or switch not needed'
                              );
                            }
                            await new Promise((r) => setTimeout(r, 1000));
                          } else {
                            console.log(
                              '✅ Sufficient ETH already on Arbitrum, skipping bridge'
                            );
                            skippedBridge = true;
                          }

                          // Step 2: Swap ETH to PYUSD
                          const stepLabel = skippedBridge
                            ? 'Swapping'
                            : 'Step 2/2: Swapping';
                          setCurrentStep(`${stepLabel} ETH → PYUSD...`);

                          const { ethers } = await import('ethers');
                          const provider = new ethers.providers.Web3Provider(
                            (window as any).ethereum
                          );

                          // Verify we're on Arbitrum before swap
                          const network = await provider.getNetwork();
                          console.log('Current network:', network.chainId);

                          if (network.chainId !== 42161) {
                            throw new Error(
                              'Please switch to Arbitrum One to continue'
                            );
                          }

                          const signer = provider.getSigner();

                          const swapResult = await swapETHToPYUSD(signer, {
                            amountInETH: swapAmount.toString(),
                            recipient: recipientAddr,
                            slippageBps: 250,
                          });

                          if (!swapResult.success) {
                            throw new Error(swapResult.error || 'Swap failed');
                          }

                          console.log('✅ Swap completed:', swapResult);

                          const successMsg = skippedBridge
                            ? `✅ Swapped ${swapAmount} ETH → PYUSD and sent to ${phoneNumber}!`
                            : `🎉 Bridged to Arbitrum, swapped ${swapAmount} ETH → PYUSD, and sent to ${phoneNumber}!`;

                          setSuccess(
                            `${successMsg}\n\nTx: ${swapResult.txHash?.slice(
                              0,
                              10
                            )}...`
                          );
                          setShowProgress(false);
                        } catch (err: any) {
                          console.error('Full flow error:', err);
                          setError(err?.message || 'Flow failed');
                          setShowProgress(false);
                        } finally {
                          setIsLoading(false);
                          setCurrentStep('');
                        }
                      }}
                      disabled={
                        isLoading ||
                        !isInitialized ||
                        !phoneNumber ||
                        !pyusdAmount
                      }
                      className='w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 px-4 rounded-lg text-sm font-semibold hover:from-purple-700 hover:to-pink-700 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-lg'
                    >
                      {isLoading
                        ? currentStep || 'Working...'
                        : `🚀 Send ${pyusdAmount} ETH as PYUSD (Smart Flow)`}
                    </button>
                    <p className='text-xs text-gray-400 mt-2 text-center'>
                      Checks Arbitrum balance first. Only bridges if needed.
                      Automatically swaps ETH → PYUSD and sends to phone.
                    </p>
                  </>
                )}
              </form>
            </>
          )}
        </div>

        {/* Info Section - Dynamic based on transfer mode */}
        <div className='mt-8 bg-white rounded-lg shadow p-6'>
          <h2 className='text-lg font-semibold text-gray-900 mb-3'>
            How it works
          </h2>

          {transferMode === 'gas' ? (
            <>
              <ol className='space-y-2 text-sm text-gray-600'>
                <li>1. 🔌 Connect your wallet (any supported chain)</li>
                <li>2. 📱 Enter recipient's phone number</li>
                <li>3. ⚡ Choose gas amount (number of transactions)</li>
                <li>4. ✍️ Sign once in your wallet to authorize</li>
                <li>5. ✨ We find your best chain automatically</li>
                <li>6. 🔵 ETH arrives on Arbitrum in ~30 seconds</li>
              </ol>
              <div className='mt-4 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100'>
                <p className='text-xs text-blue-800'>
                  <strong>🚀 Smart Routing:</strong> We aggregate your ETH from
                  Ethereum, Optimism, Base, Polygon & Arbitrum. No need to
                  choose - we pick the best route for lowest fees!
                </p>
              </div>
              <div className='mt-3 p-3 bg-green-50 rounded-lg border border-green-100'>
                <p className='text-xs text-green-800'>
                  <strong>💡 Pro tip:</strong> Fund once, use multiple times.
                  The recipient can make ~{selectedRefuel.txCount} PYUSD
                  transfers with this gas.
                </p>
              </div>
              <div className='mt-3 p-3 bg-purple-50 rounded-lg border border-purple-100'>
                <p className='text-xs text-purple-800'>
                  <strong>🔐 About signatures:</strong> Your wallet will ask you
                  to sign once to authorize sending {selectedRefuel.amount} ETH.
                  This is how we keep your funds secure - only you can approve
                  transactions. We never have access to your private keys.
                </p>
              </div>
            </>
          ) : (
            <>
              <ol className='space-y-2 text-sm text-gray-600'>
                <li>1. 🔌 Connect your wallet (any supported chain)</li>
                <li>2. 📱 Enter recipient's phone number</li>
                <li>3. 💰 Choose amount in ETH to convert</li>
                <li>4. 🌉 Auto-bridge to Arbitrum (if needed)</li>
                <li>5. 🔄 Swap ETH → PYUSD on Uniswap</li>
                <li>6. 💵 PYUSD sent directly to recipient</li>
              </ol>
              <div className='mt-4 p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-100'>
                <p className='text-xs text-purple-800'>
                  <strong>✨ Smart Flow:</strong> We automatically check your
                  Arbitrum balance. If you need more ETH, we bridge it first.
                  Then we swap to PYUSD and send it - all in one flow!
                </p>
              </div>
              <div className='mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100'>
                <p className='text-xs text-blue-800'>
                  <strong>💱 Exchange Rate:</strong> ~1 ETH = 3,758 PYUSD. Your
                  recipient gets a stable dollar-pegged token they can use
                  anywhere.
                </p>
              </div>
              <div className='mt-3 p-3 bg-green-50 rounded-lg border border-green-100'>
                <p className='text-xs text-green-800'>
                  <strong>🔐 Signatures:</strong> You'll sign 1-2 times (bridge
                  + swap). If you already have ETH on Arbitrum, only 1 signature
                  is needed!
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Auto-handle Allowance Modal */}
      {allowanceModal && (
        <div
          className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
          onClick={(e) => {
            // Prevent closing when clicking outside
            e.stopPropagation();
          }}
        >
          <div
            className='bg-white rounded-lg p-6 max-w-md mx-4'
            onClick={(e) => {
              // Prevent event from bubbling to parent
              e.stopPropagation();
            }}
          >
            <h3 className='text-lg font-bold mb-4'>
              🔐 Token Approval Required
            </h3>
            <p className='text-sm text-gray-600 mb-4'>
              Approve the bridge contract to spend your tokens. This is a
              one-time approval.
            </p>
            {allowanceModal.sources && allowanceModal.sources.length > 0 && (
              <div className='text-xs text-gray-500 mb-4'>
                Tokens to approve:{' '}
                {allowanceModal.sources
                  .map((s: any) => s.token?.symbol || 'Token')
                  .join(', ')}
              </div>
            )}
            <div className='flex gap-3'>
              <button
                onClick={async () => {
                  try {
                    console.log('✅ User clicked APPROVE button');
                    console.log(
                      'allowanceModal.sources:',
                      allowanceModal.sources
                    );

                    // Create an array of 'max' for each source
                    const allowances = allowanceModal.sources
                      ? allowanceModal.sources.map(() => 'max')
                      : ['max'];

                    console.log('Calling allow() with allowances:', allowances);

                    // Call allow and wait for it
                    await allowanceModal.allow(allowances);

                    console.log('✅ allow() completed successfully');
                    setAllowanceModal(null);
                  } catch (err: any) {
                    console.error('❌ Error in allow():', err);
                    setError(`Approval failed: ${err.message}`);
                    setAllowanceModal(null);
                    setIsLoading(false);
                  }
                }}
                className='flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700'
              >
                Approve
              </button>
              <button
                onClick={() => {
                  console.log('❌ User clicked CANCEL button');
                  allowanceModal.deny();
                  setAllowanceModal(null);
                  setIsLoading(false);
                }}
                className='flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300'
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-handle Intent Modal */}
      {intentModal && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
          <div className='bg-white rounded-lg p-6 max-w-md mx-4'>
            <h3 className='text-lg font-bold mb-4'>🔵 Confirm Transfer</h3>
            <p className='text-sm text-gray-600 mb-4'>
              Transfer {selectedRefuel.amount} ETH to {phoneNumber} on Arbitrum
            </p>
            <div className='text-xs text-gray-500 mb-4'>
              <p>
                <strong>📍 Destination:</strong>{' '}
                {resolvedAddress
                  ? `${resolvedAddress.slice(0, 10)}...${resolvedAddress.slice(
                      -8
                    )}`
                  : 'Resolving...'}
              </p>
              <p>
                <strong>⛓️ Chain:</strong> Arbitrum (42161)
              </p>
              <p>
                <strong>⏱️ Estimated time:</strong> ~30 seconds
              </p>
              <p>
                <strong>⛽ Gas:</strong> Will be deducted from your wallet
              </p>
            </div>
            <div className='flex gap-3'>
              <button
                onClick={() => {
                  console.log('✅ User confirmed intent');
                  intentModal.allow(); // Use allow() to confirm the transaction
                  setIntentModal(null);
                }}
                className='flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700'
              >
                Confirm & Sign
              </button>
              <button
                onClick={() => {
                  console.log('❌ User cancelled intent');
                  intentModal.deny(); // Use deny() to reject the transaction
                  setIntentModal(null);
                  setIsLoading(false);
                  setCurrentStep('');
                }}
                className='flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300'
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
