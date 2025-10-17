'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { bridgeEthToArbitrum } from '../../lib/nexus';
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
    allowanceModal,
    setAllowanceModal,
    intentModal,
    setIntentModal,
  } = useNexus();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedRefuel, setSelectedRefuel] = useState(REFUEL_AMOUNTS[1]); // Default: 5 tx
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
                <h2 className='text-xl font-bold text-gray-900 mb-2'>
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
                <div className='flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200'>
                  <div className='flex-1'>
                    <p className='text-xs text-gray-500 mb-1'>
                      Connected Wallet
                    </p>
                    <p className='text-sm font-mono text-gray-900'>
                      {address?.slice(0, 6)}...{address?.slice(-4)}
                    </p>
                  </div>
                  <ConnectKitButton />
                </div>

                {/* SDK Status */}
                {!isInitialized && (
                  <div className='p-4 bg-blue-50 border border-blue-200 rounded-lg'>
                    <div className='flex items-center justify-between'>
                      <div>
                        <p className='text-sm font-medium text-blue-900'>
                          🔄 Initializing bridge...
                        </p>
                        <p className='text-xs text-blue-600 mt-1'>
                          Setting up cross-chain connections
                        </p>
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

              {/* Balance Display */}
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
                      💰 Available ETH
                    </span>
                    <span className='text-lg font-bold text-gray-900'>
                      {parseFloat(totalEthBalance).toFixed(6)} ETH
                    </span>
                  </div>
                  <p className='text-xs text-gray-500 mt-1'>
                    Aggregated across all your chains
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

              <form onSubmit={handleSubmit} className='space-y-6'>
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
                    onChange={(phone) => setPhoneNumber(phone)}
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
                  <p className='mt-1 text-xs text-gray-500'>
                    Select country code and enter phone number
                  </p>
                </div>

                {/* Refuel Amount Selection */}
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
                    {selectedRefuel.txCount} PYUSD transfers on Arbitrum
                  </p>
                </div>

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

                {/* Submit Button */}
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

                {!isInitialized && (
                  <p className='text-sm text-gray-500 text-center'>
                    Initializing bridge...
                  </p>
                )}

                {/* PYUSD Simple Flow */}
                <div className='mt-8 pt-6 border-t border-gray-200'>
                  <h3 className='text-sm font-semibold text-gray-700 mb-3'>
                    💰 Send PYUSD (Simplified)
                  </h3>
                  <p className='text-xs text-gray-500 mb-4'>
                    Bridge ETH to Arbitrum, backend handles swap + transfer
                  </p>

                  <button
                    type='button'
                    onClick={async () => {
                      if (!nexusSdk || !isConnected || !phoneNumber) {
                        setError('Connect wallet and enter phone number first');
                        return;
                      }

                      try {
                        setIsLoading(true);
                        setError('');
                        setSuccess('');
                        setProgressSteps([]);
                        setShowProgress(false);
                        setCurrentStep('Resolving phone number...');

                        // Resolve phone number to wallet address
                        const recipientAddr = await resolvePhone(phoneNumber);
                        if (!recipientAddr) {
                          throw new Error('Failed to resolve phone number');
                        }
                        setResolvedAddress(recipientAddr);

                        console.log('📱 Resolved phone to:', recipientAddr);
                        setCurrentStep('Bridging ETH to Arbitrum...');

                        // Just bridge ETH to Arbitrum - backend will handle the rest
                        const result = await bridgeEthToArbitrum(nexusSdk, {
                          fromChainId: 1,
                          toChainId: 42161, // Arbitrum
                          token: 'ETH',
                          amount: '0.001',
                          toAddress: recipientAddr, // Send to recipient directly
                        });

                        if (result.success) {
                          setCurrentStep('Notifying backend...');

                          // Call backend to handle swap + transfer
                          const response = await fetch('/api/pyusd-swap', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              phoneNumber,
                              recipientAddress: recipientAddr,
                              amount: '0.001',
                            }),
                          });

                          const data = await response.json();

                          if (data.success) {
                            setSuccess(
                              `✅ Success! ETH bridged to ${phoneNumber}\n\n` +
                                `Backend will swap to PYUSD and transfer automatically.\n\n` +
                                `Recipient: ${recipientAddr.slice(
                                  0,
                                  8
                                )}...${recipientAddr.slice(-6)}`
                            );
                          } else {
                            setError(data.error || 'Backend processing failed');
                          }
                        } else {
                          setError(result.error || 'Bridge failed');
                        }
                      } catch (err: any) {
                        console.error('PYUSD flow error:', err);
                        setError(err.message || 'Transaction failed');
                      } finally {
                        setIsLoading(false);
                        setCurrentStep('');
                      }
                    }}
                    disabled={isLoading || !isInitialized || !phoneNumber}
                    className='w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-4 rounded-lg text-sm font-semibold hover:from-purple-700 hover:to-blue-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl'
                  >
                    {isLoading ? (
                      <span className='flex items-center justify-center gap-2'>
                        <svg
                          className='animate-spin h-4 w-4'
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
                        {currentStep || 'Processing...'}
                      </span>
                    ) : (
                      '💰 Send 0.001 ETH as PYUSD'
                    )}
                  </button>
                  <p className='text-xs text-gray-400 mt-2 text-center'>
                    ✨ Simple: Bridge with Nexus, swap handled by backend
                  </p>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Info Section */}
        <div className='mt-8 bg-white rounded-lg shadow p-6'>
          <h2 className='text-lg font-semibold text-gray-900 mb-3'>
            How it works
          </h2>
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
              Ethereum, Optimism, Base, Polygon & Arbitrum. No need to choose -
              we pick the best route for lowest fees!
            </p>
          </div>
          <div className='mt-3 p-3 bg-green-50 rounded-lg border border-green-100'>
            <p className='text-xs text-green-800'>
              <strong>💡 Pro tip:</strong> Fund once, use multiple times. The
              recipient can make ~{selectedRefuel.txCount} PYUSD transfers with
              this gas.
            </p>
          </div>
          <div className='mt-3 p-3 bg-purple-50 rounded-lg border border-purple-100'>
            <p className='text-xs text-purple-800'>
              <strong>🔐 About signatures:</strong> Your wallet will ask you to
              sign once to authorize sending {selectedRefuel.amount} ETH. This
              is how we keep your funds secure - only you can approve
              transactions. We never have access to your private keys.
            </p>
          </div>
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
