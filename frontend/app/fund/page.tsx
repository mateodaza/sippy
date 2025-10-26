'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { bridgeEthToArbitrum } from '../../lib/nexus';
import { swapETHToPYUSD } from '../../lib/uniswapSwap';
import { z } from 'zod';
import type { UserAsset } from '@avail-project/nexus-core';
import BetaAccessBanner from '@/components/BetaAccessBanner';
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';
import { useNexus } from '../providers/NexusProvider';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useTransactionPopup } from '@blockscout/app-sdk';

const phoneSchema = z
  .string()
  .regex(/^\+?\d{10,15}$/, 'Invalid phone number format');

// Constants for refuel amounts (based on ERC20 transfer costs ~0.00000065 ETH/tx with buffer)
const REFUEL_AMOUNTS = [
  { label: '~150 transfers', amount: '0.0001', txCount: 150 },
  { label: '~750 transfers', amount: '0.0005', txCount: 750 },
  { label: '~1,500 transfers', amount: '0.001', txCount: 1500 },
  { label: '~3,000 transfers', amount: '0.002', txCount: 3000 },
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
    resolve: '🔍 Resolving phone number',
    'check-balance': '💰 Checking Arbitrum balance',
    swap: '🔄 Swapping ETH → PYUSD',
  };
  return stepNames[type] || `🔄 ${type}`;
};

export default function FundPage() {
  const { address, isConnected, isReconnecting } = useAccount();
  const [isClient, setIsClient] = useState(false);

  // Wait for client-side hydration to complete
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Show loading only while we're waiting for hydration or actively reconnecting
  const isHydrating = !isClient || isReconnecting;
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
  const { openPopup } = useTransactionPopup();

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
  const [selectedRefuel, setSelectedRefuel] = useState(REFUEL_AMOUNTS[0]); // Default: ~150 transfers
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

  // ETH price state
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);

  // Fetch ETH price on mount
  useEffect(() => {
    const fetchEthPrice = async () => {
      setIsLoadingPrice(true);
      try {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
        );
        const data = await response.json();
        if (data.ethereum?.usd) {
          setEthPrice(data.ethereum.usd);
        }
      } catch (err) {
        console.error('Failed to fetch ETH price:', err);
        // Fallback to approximate price
        setEthPrice(3758);
      } finally {
        setIsLoadingPrice(false);
      }
    };

    fetchEthPrice();
    // Refresh price every 60 seconds
    const interval = setInterval(fetchEthPrice, 60000);
    return () => clearInterval(interval);
  }, []);

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

  const resolvePhone = async (phone: string): Promise<`0x${string}`> => {
    setCurrentStep('🔍 Resolving phone number...');
    console.log('📱 Resolving phone number:', phone);
    const response = await fetch(
      `/api/resolve-phone?phone=${encodeURIComponent(phone)}`
    );

    if (!response.ok) {
      const errorData = await response.json();

      // Handle 404 - wallet not found (user hasn't started)
      if (response.status === 404) {
        const whatsappLink = errorData.whatsappLink;
        let errorMessage =
          `📱 ${phone} hasn't started using Sippy yet.\n\n` +
          `They need to:\n` +
          `1. Open WhatsApp\n` +
          `2. Send "start" to Sippy\n` +
          `3. Then you can fund their account`;

        // If we have a WhatsApp link, add it to the error message
        if (whatsappLink) {
          errorMessage += `\n\nHelp them get started: ${whatsappLink}`;
        }

        throw new Error(errorMessage);
      }

      throw new Error(errorData.error || 'Failed to resolve phone number');
    }

    const data = await response.json();
    console.log('✅ Phone resolved to address:', data.address);
    return data.address as `0x${string}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nexusSdk || !isInitialized) {
      setError('Nexus SDK not initialized');
      return;
    }

    setError('');
    setSuccess('');
    setResolvedAddress('');
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
        toChainId: 42161, // Arbitrum - SDK auto-detects source chain with funds
        token: 'ETH',
        amount: selectedRefuel.amount,
        toAddress: recipientAddress,
      });

      if (result.success) {
        setCurrentStep('');
        setShowProgress(false);
        setProgressSteps([]);
        setSuccess(
          `✅ Successfully funded ${phoneNumber} with gas for ~${
            selectedRefuel.txCount
          } transfers!${
            result.transactionHash
              ? `\n\nTx: ${result.transactionHash.slice(0, 10)}...`
              : ''
          }`
        );

        // Send WhatsApp notification to recipient
        if (result.transactionHash) {
          try {
            await fetch('/api/notify-fund', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phone: phoneNumber,
                type: 'eth',
                amount: selectedRefuel.amount,
                txHash: result.transactionHash,
              }),
            });
          } catch (notifError) {
            console.error('Failed to send notification:', notifError);
            // Don't fail the whole transaction if notification fails
          }
        }

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
    <div className='min-h-screen'>
      {/* Navigation */}
      <nav className='sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-white/60'>
        <div className='max-w-7xl mx-auto px-6 py-4 flex justify-between items-center'>
          <Link
            href='/'
            className='flex items-center gap-2 animate-fade-in-up group'
          >
            <ArrowLeft className='w-5 h-5 text-gray-600 group-hover:text-[#059669] transition-colors' />
            <Image
              src='/images/logos/sippy_full_green.svg'
              alt='Sippy Logo'
              width={110}
              height={44}
              priority
              className='transition-smooth hover:scale-105'
            />
          </Link>
        </div>
      </nav>

      {/* Hero Section with gradient background */}
      <section className='relative overflow-hidden'>
        <div className='absolute inset-0 pointer-events-none'>
          <div className='absolute top-[-120px] right-[-160px] w-[560px] h-[560px] bg-[#bbf7d0]/28 blur-[150px]' />
          <div className='absolute bottom-[-180px] left-[-120px] w-[520px] h-[520px] bg-[#bfdbfe]/22 blur-[170px]' />
          <div className='absolute inset-x-0 bottom-0 h-[500px] bg-gradient-to-b from-transparent via-[#f4fcf8]/85 via-[#eefaf4]/88 to-[#eefaf4]' />
        </div>

        <div className='relative z-10 max-w-4xl mx-auto px-6 py-12 md:py-16'>
          {/* Page Header */}
          <div className='text-center mb-10 animate-fade-in-up'>
            <div className='inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#dcfce7] border border-[#bbf7d0] rounded-full text-sm text-[#15803d] shadow-sm mb-6'>
              <Wallet className='w-4 h-4' />
              <span className='font-medium'>Fund Any Sippy Phone Number</span>
            </div>
            <h1 className='text-4xl md:text-[3.2rem] font-black text-[#0f172a] leading-[1.08] tracking-[-0.025em] mb-4'>
              Fund Your
              <br />
              <span className='text-[#059669]'>Phone Number</span>
            </h1>
            <p className='text-lg md:text-xl text-gray-600 leading-[1.75] max-w-2xl mx-auto'>
              Fund any phone number with{' '}
              <span className='font-semibold text-[#0f172a]'>ETH</span> or{' '}
              <span className='font-semibold text-[#0f172a]'>PYUSD</span>.
              <br className='hidden md:block' />
              No wallet address needed.
            </p>
          </div>

          {/* Beta Access Banner */}
          <div className='max-w-2xl mx-auto mb-8 animate-fade-in-up animation-delay-50'>
            <BetaAccessBanner variant='full' />
          </div>

          {/* Main Card */}
          <div className='relative max-w-2xl mx-auto animate-fade-in-up animation-delay-100'>
            <div className='absolute -inset-4 rounded-[40px] bg-gradient-to-br from-[#dcfce7]/40 via-white/0 to-[#dbeafe]/30 blur-[40px]' />
            <div className='relative bg-white/90 backdrop-blur-xl rounded-[32px] shadow-[0_28px_70px_rgba(15,23,42,0.16)] p-8 md:p-10 border border-white/50 hover:shadow-[0_36px_86px_rgba(15,23,42,0.22)] hover:border-white/70 transition-all duration-500'>
              {isHydrating ? (
                <div className='text-center py-10'>
                  <div className='w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full mx-auto mb-6 flex items-center justify-center shadow-lg animate-pulse'>
                    <Loader2 className='w-12 h-12 text-gray-400 animate-spin' />
                  </div>
                  <p className='text-gray-500'>Loading...</p>
                </div>
              ) : !isConnected ? (
                <div className='text-center py-10'>
                  <div className='w-24 h-24 bg-gradient-to-br from-[#d1fae5] to-[#a7f3d0] rounded-full mx-auto mb-6 flex items-center justify-center shadow-lg'>
                    <Wallet className='w-12 h-12 text-[#059669]' />
                  </div>
                  <h2 className='text-2xl font-bold text-[#0f172a] mb-3'>
                    Start Funding
                  </h2>
                  <p className='text-gray-600 mb-6 max-w-md mx-auto'>
                    Connect your wallet to fund any phone number
                  </p>
                  <div className='flex justify-center mb-6'>
                    <ConnectKitButton />
                  </div>
                  <div className='p-4 bg-[#dcfce7]/50 border border-[#bbf7d0] rounded-xl max-w-md mx-auto'>
                    <p className='text-sm text-[#15803d]'>
                      💡 <strong>New to crypto?</strong> We recommend{' '}
                      <a
                        href='https://www.coinbase.com/wallet'
                        target='_blank'
                        rel='noopener noreferrer'
                        className='underline font-semibold hover:text-[#059669] transition-colors'
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
                    <div className='p-4 bg-gradient-to-r from-[#f9fafb] to-[#f3f4f6] rounded-xl border border-gray-200/60 shadow-sm'>
                      <div className='flex items-center justify-between'>
                        <div>
                          <p className='text-xs font-medium text-gray-500 mb-1.5'>
                            Connected Wallet
                          </p>
                          <p className='text-sm font-mono text-[#0f172a] font-semibold'>
                            {address?.slice(0, 6)}...{address?.slice(-4)}
                          </p>
                        </div>
                        <ConnectKitButton />
                      </div>
                    </div>

                    {/* SDK Status */}
                    {!isInitialized && !isInitializing && (
                      <div className='p-4 bg-gradient-to-r from-[#fef3c7] to-[#fde68a] border border-amber-300 rounded-xl shadow-sm'>
                        <div className='flex items-center justify-between gap-3'>
                          <div className='flex-1'>
                            <p className='text-sm font-bold text-amber-900 mb-1'>
                              🔐 Bridge Needs Initialization
                            </p>
                            <p className='text-xs text-amber-700'>
                              Click to sign and enable cross-chain transfers
                            </p>
                          </div>
                          <button
                            onClick={() => initializeSDK()}
                            className='px-4 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 shadow-md hover:shadow-lg transition-all active:scale-95'
                          >
                            Initialize
                          </button>
                        </div>
                      </div>
                    )}

                    {!isInitialized && isInitializing && (
                      <div className='p-4 bg-gradient-to-r from-[#dbeafe] to-[#bfdbfe] border border-blue-300 rounded-xl shadow-sm'>
                        <div className='flex items-center justify-between gap-3'>
                          <div className='flex-1'>
                            <p className='text-sm font-bold text-blue-900 mb-1'>
                              {initializationStep === 'Waiting for signature...'
                                ? '✍️ Signature Required'
                                : '🔄 Initializing Bridge'}
                            </p>
                            <p className='text-xs text-blue-700'>
                              {initializationStep ||
                                'Setting up cross-chain connections'}
                            </p>
                            {initializationStep ===
                              'Waiting for signature...' && (
                              <p className='text-xs text-blue-600 mt-2 font-semibold'>
                                📱 Please sign the message in your wallet
                              </p>
                            )}
                          </div>
                          <Loader2 className='w-6 h-6 text-blue-700 animate-spin' />
                        </div>
                      </div>
                    )}

                    {isInitialized && (
                      <div className='p-4 bg-gradient-to-r from-[#d1fae5] to-[#a7f3d0] border border-[#bbf7d0] rounded-xl shadow-sm'>
                        <p className='text-sm text-[#15803d] font-semibold flex items-center'>
                          <CheckCircle2 className='w-5 h-5 mr-2' />
                          Ready to bridge! Connected to {
                            supportedChainsCount
                          }{' '}
                          chains
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Balance Display - Only show after SDK is initialized */}
                  {isInitialized && (
                    <>
                      {isLoadingBalance ? (
                        <div className='mb-6 p-4 bg-gradient-to-r from-[#dbeafe] to-[#bfdbfe] border border-blue-200 rounded-xl shadow-sm'>
                          <p className='text-sm text-blue-800 flex items-center'>
                            <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                            Loading your balance...
                          </p>
                        </div>
                      ) : parseFloat(totalEthBalance) > 0 ? (
                        <div className='mb-6 p-5 bg-gradient-to-br from-[#d1fae5] via-[#a7f3d0] to-[#6ee7b7] rounded-xl border border-[#bbf7d0] shadow-md'>
                          <div className='flex justify-between items-center mb-2'>
                            <span className='text-sm font-semibold text-[#15803d]'>
                              💰 Available ETH (All Chains)
                            </span>
                            <span className='text-2xl font-black text-[#0f172a]'>
                              {parseFloat(totalEthBalance).toFixed(6)}
                            </span>
                          </div>
                          <p className='text-xs text-[#047857]'>
                            Aggregated across {supportedChainsCount} supported
                            chains
                          </p>
                        </div>
                      ) : (
                        <div className='mb-6 p-4 bg-gradient-to-r from-[#fef3c7] to-[#fde68a] border border-amber-300 rounded-xl shadow-sm'>
                          <p className='text-sm text-amber-900 font-medium flex items-center'>
                            <AlertCircle className='w-4 h-4 mr-2' />
                            No ETH available. Please add funds to any supported
                            chain.
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  <form onSubmit={handleSubmit} className='space-y-6'>
                    {/* Transfer Mode Selection */}
                    <div>
                      <label className='block text-base font-bold text-[#0f172a] mb-4'>
                        💸 What would you like to send?
                      </label>
                      <div className='grid grid-cols-2 gap-4'>
                        <button
                          type='button'
                          onClick={() => setTransferMode('pyusd')}
                          disabled={isLoading}
                          className={`p-5 rounded-xl border-2 transition-all duration-200 ${
                            transferMode === 'pyusd'
                              ? 'border-[#059669] bg-gradient-to-br from-[#d1fae5] to-[#a7f3d0] shadow-lg shadow-emerald-200/50'
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
                          }`}
                        >
                          <div className='text-center'>
                            <p className='text-3xl mb-2'>💵</p>
                            <p className='font-bold text-[#0f172a] mb-1'>
                              PYUSD
                            </p>
                            <p className='text-xs text-gray-600'>
                              Stablecoin ($)
                            </p>
                          </div>
                        </button>
                        <button
                          type='button'
                          onClick={() => setTransferMode('gas')}
                          disabled={isLoading}
                          className={`p-5 rounded-xl border-2 transition-all duration-200 ${
                            transferMode === 'gas'
                              ? 'border-[#059669] bg-gradient-to-br from-[#d1fae5] to-[#a7f3d0] shadow-lg shadow-emerald-200/50'
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
                          }`}
                        >
                          <div className='text-center'>
                            <p className='text-3xl mb-2'>⛽</p>
                            <p className='font-bold text-[#0f172a] mb-1'>
                              Gas (ETH)
                            </p>
                            <p className='text-xs text-gray-600'>
                              For transactions
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Phone Number Input */}
                    <div>
                      <label
                        htmlFor='phone'
                        className='block text-base font-bold text-[#0f172a] mb-3'
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
                            'w-full pl-14 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[#059669] focus:border-[#059669] text-lg transition-all',
                        }}
                      />
                      {hasLoadedPhone && phoneNumber ? (
                        <p className='mt-2 text-xs text-[#059669] flex items-center font-medium'>
                          <CheckCircle2 className='w-3.5 h-3.5 mr-1.5' />
                          Loaded last used number
                        </p>
                      ) : (
                        <p className='mt-2 text-xs text-gray-500'>
                          Select country code and enter phone number
                        </p>
                      )}
                    </div>

                    {/* PYUSD Amount Input - Only show for PYUSD mode */}
                    {transferMode === 'pyusd' && (
                      <div>
                        <label
                          htmlFor='pyusdAmount'
                          className='block text-base font-bold text-[#0f172a] mb-3'
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
                            className='w-full px-4 py-3 pr-16 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[#059669] focus:border-[#059669] text-lg transition-all'
                            placeholder='0.001'
                          />
                          <span className='absolute right-4 top-3.5 text-gray-500 font-bold'>
                            ETH
                          </span>
                        </div>

                        {/* Quick Amount Buttons */}
                        <div className='mt-3 flex gap-2'>
                          {['0.0005', '0.001', '0.005', '0.01'].map(
                            (amount) => (
                              <button
                                key={amount}
                                type='button'
                                onClick={() => setPyusdAmount(amount)}
                                disabled={isLoading}
                                className={`flex-1 px-3 py-2.5 rounded-lg border-2 transition-all text-sm font-semibold ${
                                  pyusdAmount === amount
                                    ? 'bg-[#059669] text-white border-[#059669] shadow-md'
                                    : 'bg-white text-gray-700 border-gray-200 hover:border-[#059669] hover:text-[#059669]'
                                }`}
                              >
                                {amount}
                              </button>
                            )
                          )}
                        </div>
                        <div className='mt-3 space-y-1.5'>
                          {ethPrice && parseFloat(pyusdAmount) > 0 ? (
                            <div className='p-3 bg-gradient-to-r from-[#f0fdf4] to-[#dcfce7] rounded-lg border border-[#bbf7d0]'>
                              <div className='flex items-center justify-between mb-1'>
                                <span className='text-xs font-medium text-[#15803d]'>
                                  Recipient will receive:
                                </span>
                                <span className='text-sm font-bold text-[#0f172a]'>
                                  ~
                                  {(
                                    parseFloat(pyusdAmount) *
                                    ethPrice *
                                    0.995
                                  ).toFixed(2)}{' '}
                                  PYUSD
                                </span>
                              </div>
                              <p className='text-xs text-gray-600'>
                                Value: ~$
                                {(parseFloat(pyusdAmount) * ethPrice).toFixed(
                                  2
                                )}{' '}
                                • ETH: ${ethPrice.toLocaleString()}
                              </p>
                              <p className='text-xs text-gray-500 italic mt-1'>
                                * Includes ~0.5% slippage tolerance
                              </p>
                            </div>
                          ) : isLoadingPrice ? (
                            <p className='text-xs text-gray-500 flex items-center'>
                              <Loader2 className='w-3 h-3 mr-1 animate-spin' />
                              Loading price...
                            </p>
                          ) : null}
                          {isInitialized && parseFloat(pyusdAmount) > 0 && (
                            <>
                              {parseFloat(pyusdAmount) >
                              parseFloat(totalEthBalance) ? (
                                <div className='p-2 bg-red-50 border border-red-200 rounded-lg'>
                                  <p className='text-xs text-red-700 font-semibold flex items-start gap-1.5'>
                                    <AlertCircle className='w-3.5 h-3.5 mt-0.5 flex-shrink-0' />
                                    <span>
                                      Insufficient balance. Need{' '}
                                      <strong>
                                        {parseFloat(pyusdAmount).toFixed(4)} ETH
                                      </strong>
                                      . You have{' '}
                                      {parseFloat(totalEthBalance).toFixed(4)}{' '}
                                      ETH.
                                    </span>
                                  </p>
                                </div>
                              ) : (
                                <p className='text-xs text-[#059669] font-semibold flex items-center'>
                                  <CheckCircle2 className='w-3.5 h-3.5 mr-1.5' />
                                  Sufficient balance (
                                  {parseFloat(totalEthBalance).toFixed(4)} ETH
                                  available)
                                </p>
                              )}
                            </>
                          )}
                        </div>
                        <div className='mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg'>
                          <p className='text-xs text-blue-900'>
                            <strong>🔄 Swap Route:</strong> ETH → WETH → USDC →
                            PYUSD via Uniswap on Arbitrum
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Refuel Amount Selection - Only show for Gas mode */}
                    {transferMode === 'gas' && (
                      <div>
                        <label className='block text-base font-bold text-[#0f172a] mb-4'>
                          ⚡ Gas Amount
                        </label>
                        <div className='grid grid-cols-2 gap-3'>
                          {REFUEL_AMOUNTS.map((option) => (
                            <button
                              key={option.txCount}
                              type='button'
                              onClick={() => setSelectedRefuel(option)}
                              disabled={isLoading}
                              className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                                selectedRefuel.txCount === option.txCount
                                  ? 'border-[#059669] bg-gradient-to-br from-[#d1fae5] to-[#a7f3d0] shadow-lg shadow-emerald-200/50'
                                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
                              }`}
                            >
                              <div className='text-center'>
                                <p className='font-bold text-[#0f172a] mb-1'>
                                  {option.label}
                                </p>
                                <p className='text-xs text-gray-600'>
                                  {option.amount} ETH
                                </p>
                                {ethPrice && (
                                  <p className='text-xs text-[#059669] font-semibold mt-1'>
                                    ~$
                                    {(
                                      parseFloat(option.amount) * ethPrice
                                    ).toFixed(2)}
                                  </p>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                        <div className='mt-3 space-y-1'>
                          <p className='text-xs text-gray-600'>
                            💡 Covers approximately {selectedRefuel.txCount}{' '}
                            PYUSD transfers on Arbitrum
                          </p>
                          <p className='text-xs text-gray-500 italic'>
                            * Estimate based on normal network conditions.
                            During high congestion, actual cost may vary.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Current Step Display - only show if no progress steps */}
                    {currentStep && !showProgress && (
                      <div className='p-4 bg-gradient-to-r from-[#dbeafe] to-[#bfdbfe] border border-blue-300 rounded-xl shadow-sm'>
                        <p className='text-sm text-blue-900 text-center animate-pulse font-medium flex items-center justify-center'>
                          <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                          {currentStep}
                        </p>
                      </div>
                    )}

                    {/* Transaction Progress Steps */}
                    {showProgress && progressSteps.length > 0 && (
                      <div className='p-5 bg-gradient-to-br from-[#dbeafe] via-[#bfdbfe] to-[#93c5fd] border border-blue-300 rounded-xl shadow-md'>
                        <h4 className='text-sm font-bold text-blue-900 mb-4 flex items-center'>
                          <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                          Transaction Progress
                        </h4>
                        <div className='space-y-3'>
                          {progressSteps.map((step, index) => (
                            <div
                              key={step.typeID || index}
                              className='flex items-center gap-3'
                            >
                              <div
                                className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${
                                  step.done
                                    ? 'bg-[#059669]'
                                    : 'bg-blue-400 animate-pulse'
                                }`}
                              />
                              <div className='flex-1'>
                                <p
                                  className={`text-sm ${
                                    step.done
                                      ? 'text-[#047857] line-through'
                                      : 'text-blue-900 font-semibold'
                                  }`}
                                >
                                  {formatStepName(step.type)}
                                </p>
                                {step.chainName && (
                                  <p className='text-xs text-blue-700'>
                                    Chain: {step.chainName}
                                  </p>
                                )}
                              </div>
                              {step.done && (
                                <CheckCircle2 className='w-5 h-5 text-[#059669]' />
                              )}
                            </div>
                          ))}
                        </div>
                        <div className='mt-4 pt-3 border-t border-blue-300'>
                          <p className='text-xs text-blue-800 text-center font-semibold'>
                            {progressSteps.filter((s) => s.done).length} /{' '}
                            {progressSteps.length} steps completed
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Error Message */}
                    {error && (
                      <div className='p-4 bg-gradient-to-r from-red-50 to-rose-100 border border-red-300 rounded-xl shadow-sm'>
                        <p className='text-sm text-red-700 font-medium flex items-start'>
                          <AlertCircle className='w-4 h-4 mr-2 flex-shrink-0 mt-0.5' />
                          <span className='whitespace-pre-line'>
                            {(() => {
                              // Check if error contains a WhatsApp link
                              const linkMatch = error.match(
                                /(https:\/\/wa\.me\/[^\s]+)/
                              );
                              if (linkMatch) {
                                const [beforeLink, afterLink] = error.split(
                                  linkMatch[0]
                                );
                                return (
                                  <>
                                    {beforeLink}
                                    <a
                                      href={linkMatch[0]}
                                      target='_blank'
                                      rel='noopener noreferrer'
                                      className='text-blue-600 hover:text-blue-800 underline font-semibold'
                                    >
                                      Open WhatsApp
                                    </a>
                                    {afterLink}
                                  </>
                                );
                              }
                              return error;
                            })()}
                          </span>
                        </p>
                      </div>
                    )}

                    {/* Success Message */}
                    {success && !isLoading && (
                      <div className='space-y-3'>
                        <div className='p-4 bg-gradient-to-r from-[#d1fae5] to-[#a7f3d0] border border-[#bbf7d0] rounded-xl shadow-md'>
                          <p className='text-sm text-[#15803d] font-semibold flex items-center'>
                            <CheckCircle2 className='w-4 h-4 mr-2 flex-shrink-0' />
                            {success}
                          </p>
                        </div>
                        {resolvedAddress && (
                          <button
                            type='button'
                            onClick={() =>
                              openPopup({
                                chainId: '42161',
                                address: resolvedAddress,
                              })
                            }
                            className='w-full px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl text-sm font-medium text-gray-700 transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center gap-2'
                          >
                            <svg
                              className='w-4 h-4'
                              fill='none'
                              stroke='currentColor'
                              viewBox='0 0 24 24'
                            >
                              <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                strokeWidth={2}
                                d='M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'
                              />
                            </svg>
                            View Full Transaction History
                          </button>
                        )}
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
                        className='w-full bg-[#059669] text-white py-4 px-6 rounded-xl font-bold text-lg hover:bg-[#047857] disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg active:scale-[0.98]'
                      >
                        {isLoading ? (
                          <span className='flex items-center justify-center'>
                            <Loader2 className='w-5 h-5 mr-3 animate-spin' />
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
                              setResolvedAddress('');

                              // Initialize progress steps early
                              setProgressSteps([
                                {
                                  typeID: 'resolve',
                                  type: 'resolve',
                                  done: false,
                                },
                                {
                                  typeID: 'check-balance',
                                  type: 'check-balance',
                                  done: false,
                                },
                                { typeID: 'swap', type: 'swap', done: false },
                              ]);
                              setShowProgress(true);
                              setCurrentStep('');

                              // Validate phone number
                              const validatedPhone =
                                phoneSchema.parse(phoneNumber);

                              // Resolve recipient
                              const recipientAddr = await resolvePhone(
                                validatedPhone
                              );

                              // Mark resolve step as done
                              setProgressSteps((prev) =>
                                prev.map((s) =>
                                  s.typeID === 'resolve'
                                    ? { ...s, done: true }
                                    : s
                                )
                              );

                              setResolvedAddress(recipientAddr);
                              console.log(
                                '📱 Resolved phone to:',
                                recipientAddr
                              );

                              if (
                                !pyusdAmount ||
                                parseFloat(pyusdAmount) <= 0
                              ) {
                                throw new Error('Please enter a valid amount');
                              }

                              const swapAmount = parseFloat(pyusdAmount);
                              const minRequired = swapAmount;

                              // Check total available balance across all chains
                              const totalAvailable =
                                parseFloat(totalEthBalance);
                              if (totalAvailable < minRequired) {
                                throw new Error(
                                  `Insufficient balance. You have ${totalAvailable.toFixed(
                                    4
                                  )} ETH but need at least ${minRequired.toFixed(
                                    4
                                  )} ETH for the swap`
                                );
                              }

                              // Check current balance on Arbitrum
                              const arbBalance = await checkArbitrumBalance();
                              console.log(
                                `💰 Current Arbitrum balance: ${arbBalance} ETH`
                              );

                              // Mark check-balance step as done
                              setProgressSteps((prev) =>
                                prev.map((s) =>
                                  s.typeID === 'check-balance'
                                    ? { ...s, done: true }
                                    : s
                                )
                              );

                              let skippedBridge = false;

                              // Add bridge step if needed
                              const needsBridge = arbBalance < minRequired;
                              if (needsBridge) {
                                setProgressSteps((prev) => [
                                  ...prev.slice(0, 2), // resolve, check-balance
                                  {
                                    typeID: 'bridge',
                                    type: 'bridge',
                                    done: false,
                                  },
                                  ...prev.slice(2), // swap
                                ]);
                              }

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
                                    toChainId: 42161,
                                    token: 'ETH',
                                    amount: bridgeAmount,
                                    toAddress: address, // Bridge to own address - SDK auto-detects source
                                  }
                                );

                                if (!bridgeResult.success) {
                                  throw new Error(
                                    bridgeResult.error || 'Bridge failed'
                                  );
                                }

                                console.log('✅ Bridge completed');

                                // Mark bridge step as done
                                setProgressSteps((prev) =>
                                  prev.map((s) =>
                                    s.typeID === 'bridge'
                                      ? { ...s, done: true }
                                      : s
                                  )
                                );

                                setCurrentStep(
                                  'Waiting for funds on Arbitrum...'
                                );

                                // Wait for bridge to settle
                                await new Promise((r) => setTimeout(r, 5000));

                                // After bridge, we should already be on Arbitrum
                                // Force switch to Arbitrum to be sure
                                setCurrentStep(
                                  'Confirming Arbitrum network...'
                                );
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
                              const provider =
                                new ethers.providers.Web3Provider(
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
                                throw new Error(
                                  swapResult.error || 'Swap failed'
                                );
                              }

                              console.log('✅ Swap completed:', swapResult);

                              // Mark swap step as done
                              setProgressSteps((prev) =>
                                prev.map((s) =>
                                  s.typeID === 'swap' ? { ...s, done: true } : s
                                )
                              );

                              const successMsg = skippedBridge
                                ? `✅ Swapped ${swapAmount} ETH → PYUSD and sent to ${phoneNumber}!`
                                : `🎉 Bridged to Arbitrum, swapped ${swapAmount} ETH → PYUSD, and sent to ${phoneNumber}!`;

                              setSuccess(
                                `${successMsg}\n\nTx: ${swapResult.txHash?.slice(
                                  0,
                                  10
                                )}...`
                              );

                              // Send WhatsApp notification to recipient
                              if (swapResult.txHash) {
                                try {
                                  const pyusdValue = ethPrice
                                    ? (
                                        parseFloat(pyusdAmount) *
                                        ethPrice *
                                        0.995
                                      ).toFixed(2)
                                    : pyusdAmount;

                                  await fetch('/api/notify-fund', {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                      phone: phoneNumber,
                                      type: 'pyusd',
                                      amount: pyusdValue,
                                      txHash: swapResult.txHash,
                                    }),
                                  });
                                } catch (notifError) {
                                  console.error(
                                    'Failed to send notification:',
                                    notifError
                                  );
                                  // Don't fail the whole transaction if notification fails
                                }
                              }

                              setShowProgress(false);

                              // Refresh balances after successful swap
                              setTimeout(async () => {
                                if (nexusSdk && isInitialized) {
                                  const balances =
                                    await nexusSdk.getUnifiedBalances();
                                  const ethAsset = balances.find(
                                    (asset: UserAsset) =>
                                      asset.symbol === 'ETH' ||
                                      asset.symbol === 'WETH'
                                  );
                                  if (ethAsset) {
                                    setTotalEthBalance(ethAsset.balance);
                                  }
                                }
                              }, 3000);
                            } catch (err: any) {
                              console.error('Full flow error:', err);
                              if (err instanceof z.ZodError) {
                                setError(err.errors[0].message);
                              } else {
                                setError(err?.message || 'Flow failed');
                              }
                              setShowProgress(false);
                              setProgressSteps([]);
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
                          className='w-full bg-[#059669] text-white py-4 px-6 rounded-xl font-bold text-lg hover:bg-[#047857] disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg active:scale-[0.98]'
                        >
                          {isLoading ? (
                            <span className='flex items-center justify-center'>
                              <Loader2 className='w-5 h-5 mr-3 animate-spin' />
                              {currentStep || 'Working...'}
                            </span>
                          ) : ethPrice ? (
                            `🚀 Send ~$${(
                              parseFloat(pyusdAmount || '0') * ethPrice
                            ).toFixed(2)} PYUSD`
                          ) : (
                            `🚀 Send ${pyusdAmount} ETH as PYUSD`
                          )}
                        </button>
                        <p className='text-xs text-gray-600 mt-3 text-center'>
                          Checks Arbitrum balance first. Only bridges if needed.
                          Automatically swaps ETH → PYUSD and sends to phone.
                        </p>
                      </>
                    )}
                  </form>
                </>
              )}
            </div>
          </div>

          {/* Info Section - Dynamic based on transfer mode */}
          <div className='mt-10 max-w-2xl mx-auto animate-fade-in-up animation-delay-200'>
            <div className='bg-white/90 backdrop-blur-xl rounded-2xl shadow-[0_18px_42px_rgba(15,23,42,0.08)] p-8 border border-gray-100'>
              <h2 className='text-2xl font-black text-[#0f172a] mb-6'>
                How it works
              </h2>

              {transferMode === 'gas' ? (
                <>
                  <ol className='space-y-3 text-[15px] text-gray-700 leading-relaxed mb-6'>
                    <li className='flex items-start'>
                      <span className='font-bold text-[#059669] mr-2'>1.</span>
                      <span>🔌 Connect your wallet </span>
                    </li>
                    <li className='flex items-start'>
                      <span className='font-bold text-[#059669] mr-2'>2.</span>
                      <span>📱 Enter recipient's phone number</span>
                    </li>
                    <li className='flex items-start'>
                      <span className='font-bold text-[#059669] mr-2'>3.</span>
                      <span>⚡ Choose gas amount (number of transactions)</span>
                    </li>
                    <li className='flex items-start'>
                      <span className='font-bold text-[#059669] mr-2'>4.</span>
                      <span>✍️ Sign once in your wallet to authorize</span>
                    </li>
                    <li className='flex items-start'>
                      <span className='font-bold text-[#059669] mr-2'>5.</span>
                      <span>✨ We find your best chain automatically</span>
                    </li>
                    <li className='flex items-start'>
                      <span className='font-bold text-[#059669] mr-2'>6.</span>
                      <span>🔵 ETH arrives on Arbitrum in ~30 seconds</span>
                    </li>
                  </ol>
                  <div className='space-y-3'>
                    <div className='p-4 bg-gradient-to-br from-[#dbeafe] to-[#bfdbfe] rounded-xl border border-blue-200/60'>
                      <p className='text-sm text-blue-900'>
                        <strong>🚀 Smart Routing:</strong> We aggregate your ETH
                        from Ethereum, Optimism, Base, Polygon & Arbitrum. No
                        need to choose - we pick the best route for lowest fees!
                      </p>
                    </div>
                    <div className='p-4 bg-gradient-to-br from-[#d1fae5] to-[#a7f3d0] rounded-xl border border-[#bbf7d0]'>
                      <p className='text-sm text-[#15803d]'>
                        <strong>💡 Pro tip:</strong> Fund once, use multiple
                        times. The recipient can make ~{selectedRefuel.txCount}{' '}
                        PYUSD transfers with this gas.
                      </p>
                    </div>
                    <div className='p-4 bg-gradient-to-br from-[#e9d5ff] to-[#d8b4fe] rounded-xl border border-purple-200'>
                      <p className='text-sm text-purple-900'>
                        <strong>🔐 About signatures:</strong> Your wallet will
                        ask you to sign once to authorize sending{' '}
                        {selectedRefuel.amount} ETH. This is how we keep your
                        funds secure - only you can approve transactions.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <ol className='space-y-3 text-[15px] text-gray-700 leading-relaxed mb-6'>
                    <li className='flex items-start'>
                      <span className='font-bold text-[#059669] mr-2'>1.</span>
                      <span>🔌 Connect your wallet </span>
                    </li>
                    <li className='flex items-start'>
                      <span className='font-bold text-[#059669] mr-2'>2.</span>
                      <span>📱 Enter recipient's phone number</span>
                    </li>
                    <li className='flex items-start'>
                      <span className='font-bold text-[#059669] mr-2'>3.</span>
                      <span>💰 Choose amount in ETH to convert</span>
                    </li>
                    <li className='flex items-start'>
                      <span className='font-bold text-[#059669] mr-2'>4.</span>
                      <span>🌉 Auto-bridge to Arbitrum (if needed)</span>
                    </li>
                    <li className='flex items-start'>
                      <span className='font-bold text-[#059669] mr-2'>5.</span>
                      <span>🔄 Swap ETH → PYUSD on Uniswap</span>
                    </li>
                    <li className='flex items-start'>
                      <span className='font-bold text-[#059669] mr-2'>6.</span>
                      <span>💵 PYUSD sent directly to recipient</span>
                    </li>
                  </ol>
                  <div className='space-y-3'>
                    <div className='p-4 bg-gradient-to-br from-[#e9d5ff] to-[#d8b4fe] rounded-xl border border-purple-200'>
                      <p className='text-sm text-purple-900'>
                        <strong>✨ Smart Flow:</strong> We automatically check
                        your Arbitrum balance. If you need more ETH, we bridge
                        it first. Then we swap to PYUSD and send it - all in one
                        flow!
                      </p>
                    </div>
                    <div className='p-4 bg-gradient-to-br from-[#dbeafe] to-[#bfdbfe] rounded-xl border border-blue-200/60'>
                      <p className='text-sm text-blue-900'>
                        <strong>💱 Exchange Rate:</strong>{' '}
                        {ethPrice
                          ? `1 ETH ≈ $${ethPrice.toLocaleString()}`
                          : '~1 ETH = $3,758'}
                        . Your recipient gets a stable dollar-pegged PYUSD token
                        they can use anywhere.
                      </p>
                    </div>
                    <div className='p-4 bg-gradient-to-br from-[#d1fae5] to-[#a7f3d0] rounded-xl border border-[#bbf7d0]'>
                      <p className='text-sm text-[#15803d]'>
                        <strong>🔐 Signatures:</strong> You'll sign 1-2 times
                        (bridge + swap). If you already have ETH on Arbitrum,
                        only 1 signature is needed!
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Auto-handle Allowance Modal */}
      {allowanceModal && (
        <div
          className='fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50'
          onClick={(e) => {
            // Prevent closing when clicking outside
            e.stopPropagation();
          }}
        >
          <div
            className='bg-white rounded-2xl shadow-2xl p-8 max-w-md mx-4 border border-gray-100'
            onClick={(e) => {
              // Prevent event from bubbling to parent
              e.stopPropagation();
            }}
          >
            <div className='w-16 h-16 bg-gradient-to-br from-[#d1fae5] to-[#a7f3d0] rounded-full mx-auto mb-4 flex items-center justify-center'>
              <CheckCircle2 className='w-8 h-8 text-[#059669]' />
            </div>
            <h3 className='text-2xl font-bold text-[#0f172a] mb-3 text-center'>
              Token Approval Required
            </h3>
            <p className='text-sm text-gray-600 mb-4 text-center leading-relaxed'>
              Approve the bridge contract to spend your tokens. This is a
              one-time approval.
            </p>
            {allowanceModal.sources && allowanceModal.sources.length > 0 && (
              <div className='text-xs text-gray-500 mb-6 text-center p-3 bg-gray-50 rounded-lg'>
                Tokens to approve:{' '}
                <span className='font-semibold'>
                  {allowanceModal.sources
                    .map((s: any) => s.token?.symbol || 'Token')
                    .join(', ')}
                </span>
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
                className='flex-1 bg-[#059669] text-white py-3 px-6 rounded-xl font-semibold hover:bg-[#047857] transition-all shadow-md hover:shadow-lg active:scale-95'
              >
                Approve
              </button>
              <button
                onClick={() => {
                  console.log('❌ User clicked CANCEL button');
                  allowanceModal.deny();
                  setAllowanceModal(null);
                  setIsLoading(false);
                  setShowProgress(false);
                  setProgressSteps([]);
                  setCurrentStep('');
                }}
                className='flex-1 bg-gray-200 text-gray-800 py-3 px-6 rounded-xl font-semibold hover:bg-gray-300 transition-all active:scale-95'
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-handle Intent Modal */}
      {intentModal && (
        <div className='fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50'>
          <div className='bg-white rounded-2xl shadow-2xl p-8 max-w-md mx-4 border border-gray-100'>
            <div className='w-16 h-16 bg-gradient-to-br from-[#d1fae5] to-[#a7f3d0] rounded-full mx-auto mb-4 flex items-center justify-center'>
              <CheckCircle2 className='w-8 h-8 text-[#059669]' />
            </div>
            <h3 className='text-2xl font-bold text-[#0f172a] mb-3 text-center'>
              Confirm Transfer
            </h3>
            <p className='text-sm text-gray-600 mb-6 text-center leading-relaxed'>
              {transferMode === 'gas'
                ? `Transfer ${selectedRefuel.amount} ETH to ${phoneNumber} on Arbitrum`
                : `Convert ${pyusdAmount} ETH to PYUSD and send to ${phoneNumber}`}
            </p>
            <div className='space-y-2 mb-6 p-4 bg-gray-50 rounded-xl'>
              <div className='flex justify-between text-sm'>
                <span className='text-gray-600'>📍 Destination:</span>
                <span className='font-mono text-gray-900 text-xs'>
                  {resolvedAddress
                    ? `${resolvedAddress.slice(0, 8)}...${resolvedAddress.slice(
                        -6
                      )}`
                    : 'Resolving...'}
                </span>
              </div>
              <div className='flex justify-between text-sm'>
                <span className='text-gray-600'>⛓️ Chain:</span>
                <span className='font-semibold text-gray-900'>
                  Arbitrum One
                </span>
              </div>
              <div className='flex justify-between text-sm'>
                <span className='text-gray-600'>⏱️ Est. time:</span>
                <span className='font-semibold text-gray-900'>~30 seconds</span>
              </div>
              <div className='flex justify-between text-sm'>
                <span className='text-gray-600'>⛽ Gas:</span>
                <span className='font-semibold text-gray-900'>
                  From your wallet
                </span>
              </div>
            </div>
            <div className='flex gap-3'>
              <button
                onClick={() => {
                  console.log('✅ User confirmed intent');
                  intentModal.allow(); // Use allow() to confirm the transaction
                  setIntentModal(null);
                }}
                className='flex-1 bg-[#059669] text-white py-3 px-6 rounded-xl font-semibold hover:bg-[#047857] transition-all shadow-md hover:shadow-lg active:scale-95'
              >
                Confirm & Sign
              </button>
              <button
                onClick={() => {
                  console.log('❌ User cancelled intent');
                  intentModal.deny(); // Use deny() to reject the transaction
                  setIntentModal(null);
                  setIsLoading(false);
                  setShowProgress(false);
                  setProgressSteps([]);
                  setCurrentStep('');
                }}
                className='flex-1 bg-gray-200 text-gray-800 py-3 px-6 rounded-xl font-semibold hover:bg-gray-300 transition-all active:scale-95'
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
