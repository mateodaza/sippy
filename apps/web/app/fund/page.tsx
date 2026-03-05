'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { swapETHToPYUSD } from '../../lib/uniswapSwap';
import { z } from 'zod';
import BetaAccessBanner from '@/components/BetaAccessBanner';
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';
import { nameToPhone } from '@/lib/phone';
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

// DEMO MODE: Set to false for production
const DEMO_MODE = false;
const DEMO_PHONE_NUMBER = '';

export default function FundPage() {
  const { address, isConnected, isReconnecting } = useAccount();
  const [isClient, setIsClient] = useState(false);
  const { openPopup } = useTransactionPopup();

  useEffect(() => {
    setIsClient(true);
  }, []);

  const isHydrating = !isClient || isReconnecting;

  const [phoneNumber, setPhoneNumber] = useState(() => {
    if (DEMO_MODE) {
      return '+573111234567';
    }
    return '';
  });
  const [pyusdAmount, setPyusdAmount] = useState('0.001');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentStep, setCurrentStep] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState('');

  // ETH price state
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);

  // ETH balance on Arbitrum
  const [arbBalance, setArbBalance] = useState<string>('0');
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

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
        setEthPrice(3758);
      } finally {
        setIsLoadingPrice(false);
      }
    };

    fetchEthPrice();
    const interval = setInterval(fetchEthPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Arbitrum balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (!isConnected || !address) return;

      setIsLoadingBalance(true);
      try {
        const { ethers } = await import('ethers');
        const provider = new ethers.providers.JsonRpcProvider(
          'https://arb1.arbitrum.io/rpc'
        );
        const balance = await provider.getBalance(address);
        setArbBalance(ethers.utils.formatEther(balance));
      } catch (err) {
        console.error('Failed to fetch balance:', err);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [isConnected, address]);

  const resolvePhone = async (phone: string): Promise<`0x${string}`> => {
    setCurrentStep('🔍 Resolving phone number...');
    const response = await fetch(
      `/api/resolve-phone?phone=${encodeURIComponent(phone)}`
    );

    if (!response.ok) {
      const errorData = await response.json();

      if (response.status === 404) {
        const whatsappLink = errorData.whatsappLink;
        let errorMessage =
          `📱 ${phone} hasn't started using Sippy yet.\n\n` +
          `They need to:\n` +
          `1. Open WhatsApp\n` +
          `2. Send "start" to Sippy\n` +
          `3. Then you can fund their account`;

        if (whatsappLink) {
          errorMessage += `\n\nHelp them get started: ${whatsappLink}`;
        }

        throw new Error(errorMessage);
      }

      throw new Error(errorData.error || 'Failed to resolve phone number');
    }

    const data = await response.json();
    return data.address as `0x${string}`;
  };

  const handleSubmit = async () => {
    if (!isConnected || !phoneNumber) {
      setError('Connect wallet and enter phone number first');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      setSuccess('');
      setResolvedAddress('');

      const actualPhone = DEMO_MODE ? DEMO_PHONE_NUMBER : nameToPhone(phoneNumber);
      const validatedPhone = phoneSchema.parse(actualPhone);

      // Resolve recipient
      const recipientAddr = await resolvePhone(validatedPhone);
      setResolvedAddress(recipientAddr);

      if (!pyusdAmount || parseFloat(pyusdAmount) <= 0) {
        throw new Error('Please enter a valid amount');
      }

      const swapAmount = parseFloat(pyusdAmount);
      const currentBalance = parseFloat(arbBalance);

      if (currentBalance < swapAmount) {
        throw new Error(
          `Insufficient balance on Arbitrum. You have ${currentBalance.toFixed(4)} ETH but need ${swapAmount.toFixed(4)} ETH`
        );
      }

      // Switch to Arbitrum if needed
      setCurrentStep('🔄 Switching to Arbitrum...');
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
                nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://arb1.arbitrum.io/rpc'],
                blockExplorerUrls: ['https://arbiscan.io'],
              },
            ],
          });
        }
      }
      await new Promise((r) => setTimeout(r, 1000));

      // Swap ETH to PYUSD
      setCurrentStep('🔄 Swapping ETH → PYUSD...');

      const { ethers } = await import('ethers');
      const provider = new ethers.providers.Web3Provider(
        (window as any).ethereum
      );
      const signer = provider.getSigner();

      const swapResult = await swapETHToPYUSD(signer, {
        amountInETH: swapAmount.toString(),
        recipient: recipientAddr,
        slippageBps: 250,
      });

      if (!swapResult.success) {
        throw new Error(swapResult.error || 'Swap failed');
      }

      const displayName = DEMO_MODE ? 'Demo User' : phoneNumber;
      setSuccess(
        `✅ Swapped ${swapAmount} ETH → PYUSD and sent to ${displayName}!\n\nTx: ${swapResult.txHash?.slice(0, 10)}...`
      );

      // Send WhatsApp notification
      if (swapResult.txHash) {
        try {
          const pyusdValue = ethPrice
            ? (parseFloat(pyusdAmount) * ethPrice * 0.995).toFixed(2)
            : pyusdAmount;

          await fetch('/api/notify-fund', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: validatedPhone,
              type: 'pyusd',
              amount: pyusdValue,
              txHash: swapResult.txHash,
            }),
          });
        } catch (notifError) {
          console.error('Failed to send notification:', notifError);
        }
      }

      // Refresh balance
      setTimeout(async () => {
        const { ethers } = await import('ethers');
        const provider = new ethers.providers.JsonRpcProvider(
          'https://arb1.arbitrum.io/rpc'
        );
        if (address) {
          const balance = await provider.getBalance(address);
          setArbBalance(ethers.utils.formatEther(balance));
        }
      }, 3000);
    } catch (err: any) {
      console.error('Error:', err);
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError(err?.message || 'Transaction failed');
      }
    } finally {
      setIsLoading(false);
      setCurrentStep('');
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

      {/* Hero Section */}
      <section className='relative overflow-hidden'>
        <div className='absolute inset-0 pointer-events-none'>
          <div className='absolute top-[-120px] right-[-160px] w-[560px] h-[560px] bg-[#bbf7d0]/28 blur-[150px]' />
          <div className='absolute bottom-[-180px] left-[-120px] w-[520px] h-[520px] bg-[#bfdbfe]/22 blur-[170px]' />
        </div>

        <div className='relative z-10 max-w-4xl mx-auto px-6 py-12 md:py-16'>
          {/* Page Header */}
          <div className='text-center mb-10 animate-fade-in-up'>
            <div className='inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#dcfce7] border border-[#bbf7d0] rounded-full text-sm text-[#15803d] shadow-sm mb-6'>
              <Wallet className='w-4 h-4' />
              <span className='font-medium'>Fund Any Phone Number</span>
            </div>
            <h1 className='text-4xl md:text-[3.2rem] font-black text-[#0f172a] leading-[1.08] tracking-[-0.025em] mb-4'>
              Send <span className='text-[#059669]'>PYUSD</span>
            </h1>
            <p className='text-lg md:text-xl text-gray-600 leading-[1.75] max-w-2xl mx-auto'>
              Swap ETH to PYUSD and send directly to any phone number on Arbitrum.
            </p>
          </div>

          {/* Beta Access Banner */}
          <div className='max-w-2xl mx-auto mb-8 animate-fade-in-up animation-delay-50'>
            <BetaAccessBanner variant='full' />
          </div>

          {/* Main Card */}
          <div className='relative max-w-2xl mx-auto animate-fade-in-up animation-delay-100'>
            <div className='absolute -inset-4 rounded-[40px] bg-gradient-to-br from-[#dcfce7]/40 via-white/0 to-[#dbeafe]/30 blur-[40px]' />
            <div className='relative bg-white/90 backdrop-blur-xl rounded-[32px] shadow-[0_28px_70px_rgba(15,23,42,0.16)] p-8 md:p-10 border border-white/50'>
              {isHydrating ? (
                <div className='text-center py-10'>
                  <Loader2 className='w-12 h-12 text-gray-400 animate-spin mx-auto mb-4' />
                  <p className='text-gray-500'>Loading...</p>
                </div>
              ) : !isConnected ? (
                <div className='text-center py-10'>
                  <div className='w-24 h-24 bg-gradient-to-br from-[#d1fae5] to-[#a7f3d0] rounded-full mx-auto mb-6 flex items-center justify-center shadow-lg'>
                    <Wallet className='w-12 h-12 text-[#059669]' />
                  </div>
                  <h2 className='text-2xl font-bold text-[#0f172a] mb-3'>
                    Connect Wallet
                  </h2>
                  <p className='text-gray-600 mb-6 max-w-md mx-auto'>
                    Connect your wallet to fund any phone number
                  </p>
                  <div className='flex justify-center'>
                    <ConnectKitButton />
                  </div>
                </div>
              ) : (
                <>
                  {/* Wallet Info */}
                  <div className='mb-6 space-y-3'>
                    <div className='p-4 bg-gradient-to-r from-[#f9fafb] to-[#f3f4f6] rounded-xl border border-gray-200/60'>
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

                    {/* Balance Display */}
                    {isLoadingBalance ? (
                      <div className='p-4 bg-gradient-to-r from-[#dbeafe] to-[#bfdbfe] border border-blue-200 rounded-xl'>
                        <p className='text-sm text-blue-800 flex items-center'>
                          <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                          Loading balance...
                        </p>
                      </div>
                    ) : parseFloat(arbBalance) > 0 ? (
                      <div className='p-5 bg-gradient-to-br from-[#d1fae5] via-[#a7f3d0] to-[#6ee7b7] rounded-xl border border-[#bbf7d0]'>
                        <div className='flex justify-between items-center mb-2'>
                          <span className='text-sm font-semibold text-[#15803d]'>
                            💰 ETH on Arbitrum
                          </span>
                          <span className='text-2xl font-black text-[#0f172a]'>
                            {parseFloat(arbBalance).toFixed(6)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className='p-4 bg-gradient-to-r from-[#fef3c7] to-[#fde68a] border border-amber-300 rounded-xl'>
                        <p className='text-sm text-amber-900 font-medium flex items-center'>
                          <AlertCircle className='w-4 h-4 mr-2' />
                          No ETH on Arbitrum. Please bridge funds first.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Phone Number Input */}
                  <div className='mb-6'>
                    <label className='block text-base font-bold text-[#0f172a] mb-3'>
                      📱 Recipient's Phone Number
                    </label>
                    <PhoneInput
                      defaultCountry='co'
                      value={phoneNumber}
                      onChange={(phone) => setPhoneNumber(phone)}
                      disabled={isLoading || DEMO_MODE}
                      inputClassName='phone-input-field'
                      countrySelectorStyleProps={{
                        buttonClassName: 'phone-country-button',
                      }}
                    />
                    {DEMO_MODE && (
                      <p className='mt-2 text-xs text-blue-600 flex items-center font-medium'>
                        <CheckCircle2 className='w-3.5 h-3.5 mr-1.5' />
                        Demo mode enabled
                      </p>
                    )}
                  </div>

                  {/* Amount Input */}
                  <div className='mb-6'>
                    <label className='block text-base font-bold text-[#0f172a] mb-3'>
                      💰 Amount (ETH to convert)
                    </label>
                    <div className='relative'>
                      <input
                        type='number'
                        step='0.0001'
                        min='0.0001'
                        max='10'
                        value={pyusdAmount}
                        onChange={(e) => setPyusdAmount(e.target.value)}
                        disabled={isLoading}
                        className='w-full px-4 py-3 pr-16 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-[#059669] focus:border-[#059669] text-lg'
                        placeholder='0.001'
                      />
                      <span className='absolute right-4 top-3.5 text-gray-500 font-bold'>
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
                          className={`flex-1 px-3 py-2.5 rounded-lg border-2 transition-all text-sm font-semibold ${
                            pyusdAmount === amount
                              ? 'bg-[#059669] text-white border-[#059669]'
                              : 'bg-white text-gray-700 border-gray-200 hover:border-[#059669]'
                          }`}
                        >
                          {amount}
                        </button>
                      ))}
                    </div>

                    {ethPrice && parseFloat(pyusdAmount) > 0 && (
                      <div className='mt-3 p-3 bg-gradient-to-r from-[#f0fdf4] to-[#dcfce7] rounded-lg border border-[#bbf7d0]'>
                        <div className='flex items-center justify-between mb-1'>
                          <span className='text-xs font-medium text-[#15803d]'>
                            Recipient will receive:
                          </span>
                          <span className='text-sm font-bold text-[#0f172a]'>
                            ~{(parseFloat(pyusdAmount) * ethPrice * 0.995).toFixed(2)} PYUSD
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Current Step */}
                  {currentStep && (
                    <div className='mb-6 p-4 bg-gradient-to-r from-[#dbeafe] to-[#bfdbfe] border border-blue-300 rounded-xl'>
                      <p className='text-sm text-blue-900 text-center animate-pulse font-medium flex items-center justify-center'>
                        <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                        {currentStep}
                      </p>
                    </div>
                  )}

                  {/* Error Message */}
                  {error && (
                    <div className='mb-6 p-4 bg-gradient-to-r from-red-50 to-rose-100 border border-red-300 rounded-xl'>
                      <p className='text-sm text-red-700 font-medium flex items-start'>
                        <AlertCircle className='w-4 h-4 mr-2 flex-shrink-0 mt-0.5' />
                        <span className='whitespace-pre-line'>{error}</span>
                      </p>
                    </div>
                  )}

                  {/* Success Message */}
                  {success && !isLoading && (
                    <div className='mb-6 space-y-3'>
                      <div className='p-4 bg-gradient-to-r from-[#d1fae5] to-[#a7f3d0] border border-[#bbf7d0] rounded-xl'>
                        <p className='text-sm text-[#15803d] font-semibold flex items-center'>
                          <CheckCircle2 className='w-4 h-4 mr-2' />
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
                          className='w-full px-4 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 flex items-center justify-center gap-2'
                        >
                          View Transaction History
                        </button>
                      )}
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type='button'
                    onClick={handleSubmit}
                    disabled={
                      isLoading ||
                      !phoneNumber ||
                      !pyusdAmount ||
                      parseFloat(arbBalance) === 0
                    }
                    className='w-full bg-[#059669] text-white py-4 px-6 rounded-xl font-bold text-lg hover:bg-[#047857] disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg active:scale-[0.98]'
                  >
                    {isLoading ? (
                      <span className='flex items-center justify-center'>
                        <Loader2 className='w-5 h-5 mr-3 animate-spin' />
                        {currentStep || 'Processing...'}
                      </span>
                    ) : ethPrice ? (
                      `🚀 Send ~$${(parseFloat(pyusdAmount || '0') * ethPrice).toFixed(2)} PYUSD`
                    ) : (
                      `🚀 Send ${pyusdAmount} ETH as PYUSD`
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
