'use client';

import { Suspense, useState, useEffect, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Wallet,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { LiFiWidget, WidgetEvent, type WidgetConfig, WidgetSkeleton, widgetEvents } from '@lifi/widget';
import { ChainType } from '@lifi/sdk';

const SIPPY_HOME = 'https://www.sippy.lat';
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

interface RecipientInfo {
  maskedPhone: string;
  address: string;
}

export default function FundPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <div className='text-center py-20'>
            <Loader2 className='w-12 h-12 text-[#059669] animate-spin mx-auto' />
          </div>
        </Shell>
      }
    >
      <FundPageContent />
    </Suspense>
  );
}

function FundPageContent() {
  const hydrated = useHydrated();
  const searchParams = useSearchParams();
  const token = searchParams.get('t');
  // Direct address bypass — useful for testing or wallet-to-wallet funding
  const directAddress = searchParams.get('address');

  const [recipient, setRecipient] = useState<RecipientInfo | null>(
    directAddress ? { maskedPhone: directAddress, address: directAddress } : null
  );
  const [loading, setLoading] = useState(!!token && !directAddress);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || directAddress) return;

    async function resolve() {
      try {
        const res = await fetch(`/api/fund-token?t=${encodeURIComponent(token!)}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Invalid fund link');
          return;
        }

        setRecipient(data);
      } catch {
        setError('Failed to load fund link');
      } finally {
        setLoading(false);
      }
    }

    resolve();
  }, [token, directAddress]);

  // Subscribe to LI.FI widget completion events to trigger WhatsApp notification
  useEffect(() => {
    if (!recipient) return;

    const unsubscribe = widgetEvents.on(WidgetEvent.RouteExecutionCompleted, (route) => {
      const lastStep = route.steps[route.steps.length - 1];
      const processes = (lastStep as any)?.execution?.process ?? [];
      const txHash = [...processes].reverse().find((p: any) => p.txHash)?.txHash;
      if (!txHash) return;
      const amount = (Number(route.toAmountMin) / 1e6).toFixed(2);
      fetch('/api/notify-fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: recipient.address, type: 'usdc', amount, txHash }),
      }).catch(() => {});
    });
    return unsubscribe;
  }, [recipient]);

  if (!token && !directAddress) {
    return <NoTokenView />;
  }

  if (loading) {
    return (
      <Shell>
        <div className='text-center py-20'>
          <Loader2 className='w-12 h-12 text-[#059669] animate-spin mx-auto mb-4' />
          <p className='text-gray-600'>Loading fund link...</p>
        </div>
      </Shell>
    );
  }

  if (error || !recipient) {
    return (
      <Shell>
        <div className='text-center py-20'>
          <AlertCircle className='w-12 h-12 text-red-400 mx-auto mb-4' />
          <h2 className='text-xl font-bold text-gray-900 mb-2'>
            {error || 'Something went wrong'}
          </h2>
          <p className='text-gray-600 mb-6'>
            This fund link may be expired or invalid.
          </p>
          <a
            href={SIPPY_HOME}
            className='inline-flex items-center gap-2 px-5 py-2.5 bg-[#059669] text-white rounded-xl font-semibold hover:bg-[#047857] transition-colors'
          >
            <ArrowLeft className='w-4 h-4' />
            Back to Home
          </a>
        </div>
      </Shell>
    );
  }

  const widgetConfig: Partial<WidgetConfig> = {
    toChain: 42161,
    toToken: USDC_ARBITRUM,
    toAddress: {
      address: recipient.address as `0x${string}`,
      chainType: ChainType.EVM,
    },
    chains: {
      allow: [1, 42161, 8453, 10, 137],
    },
    tokens: {
      allow: [
        { chainId: 1, address: '0x0000000000000000000000000000000000000000' },
        { chainId: 1, address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
        { chainId: 42161, address: '0x0000000000000000000000000000000000000000' },
        { chainId: 42161, address: USDC_ARBITRUM },
        { chainId: 8453, address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
        { chainId: 8453, address: '0x0000000000000000000000000000000000000000' },
        { chainId: 10, address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' },
        { chainId: 10, address: '0x0000000000000000000000000000000000000000' },
        { chainId: 137, address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' },
      ],
    },
    hiddenUI: ['toAddress', 'toToken'],
    appearance: 'light',
    theme: {
      container: {
        boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        borderRadius: '24px',
      },
    },
  };

  return (
    <Shell>
      <div className='max-w-lg mx-auto mb-6'>
        <div className='p-4 bg-gradient-to-r from-[#f0fdf4] to-[#dcfce7] rounded-2xl border border-[#bbf7d0]'>
          <div className='flex items-center gap-3'>
            <div className='w-10 h-10 bg-[#059669] rounded-full flex items-center justify-center'>
              <CheckCircle2 className='w-5 h-5 text-white' />
            </div>
            <div>
              <p className='text-sm text-[#15803d] font-medium'>Sending to</p>
              <p className='text-lg font-bold text-[#0f172a]'>
                {recipient.maskedPhone.startsWith('0x')
                  ? `${recipient.maskedPhone.slice(0, 6)}…${recipient.maskedPhone.slice(-4)}`
                  : recipient.maskedPhone}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className='max-w-lg mx-auto'>
        {hydrated ? (
          <LiFiWidget config={widgetConfig} integrator='sippy' />
        ) : (
          <WidgetSkeleton config={widgetConfig} />
        )}
      </div>

      <p className='text-center text-sm text-gray-500 mt-6 max-w-md mx-auto'>
        Connect your wallet, pick a token, and it arrives as USDC in their
        Sippy account on Arbitrum.
      </p>
    </Shell>
  );
}

function NoTokenView() {
  return (
    <Shell>
      <div className='text-center py-16'>
        <div className='w-24 h-24 bg-gradient-to-br from-[#d1fae5] to-[#a7f3d0] rounded-full mx-auto mb-8 flex items-center justify-center shadow-lg'>
          <Wallet className='w-12 h-12 text-[#059669]' />
        </div>
        <h1 className='text-3xl md:text-4xl font-black text-[#0f172a] leading-tight tracking-tight mb-4'>
          Fund a Sippy Account
        </h1>
        <p className='text-lg text-gray-600 leading-relaxed max-w-md mx-auto mb-8'>
          You need a fund link to send money to someone. Ask them to share their
          Sippy fund link with you.
        </p>
        <a
          href={SIPPY_HOME}
          className='inline-flex items-center gap-2 px-6 py-3 bg-[#059669] text-white rounded-xl font-semibold hover:bg-[#047857] transition-colors'
        >
          <ArrowLeft className='w-4 h-4' />
          Back to Home
        </a>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className='min-h-screen'>
      <nav className='sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-white/60'>
        <div className='max-w-7xl mx-auto px-6 py-4'>
          <a href={SIPPY_HOME} className='flex items-center gap-2 group w-fit'>
            <ArrowLeft className='w-5 h-5 text-gray-600 group-hover:text-[#059669] transition-colors' />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src='https://www.sippy.lat/images/logos/sippy_full_green.svg'
              alt='Sippy'
              width={110}
              height={44}
            />
          </a>
        </div>
      </nav>

      <section className='relative overflow-hidden'>
        <div className='absolute inset-0 pointer-events-none'>
          <div className='absolute top-[-120px] right-[-160px] w-[560px] h-[560px] bg-[#bbf7d0]/28 blur-[150px]' />
          <div className='absolute bottom-[-180px] left-[-120px] w-[520px] h-[520px] bg-[#bfdbfe]/22 blur-[170px]' />
        </div>

        <div className='relative z-10 max-w-4xl mx-auto px-6 py-12 md:py-16'>
          {children}
        </div>
      </section>
    </div>
  );
}
