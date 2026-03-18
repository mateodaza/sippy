'use client';

import { Suspense, useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Wallet,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  ArrowLeftRight,
} from 'lucide-react';
import { LiFiWidget, WidgetEvent, type WidgetConfig, WidgetSkeleton, widgetEvents } from '@lifi/widget';
import { ChainType } from '@lifi/sdk';
import { generateOnRampURL } from '@coinbase/cbpay-js';

const SIPPY_HOME = 'https://www.sippy.lat';
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const COINBASE_APP_ID = process.env.NEXT_PUBLIC_COINBASE_APP_ID || '';

// Countries where Coinbase Onramp is available (ISO 3166-1 alpha-2, lowercase).
// Source: https://www.coinbase.com/places — most of LATAM is restricted.
const COINBASE_ALLOWED_COUNTRIES = new Set([
  'us', 'gb', 'de', 'fr', 'es', 'it', 'nl', 'at', 'be', 'ie', 'pt', 'fi',
  'se', 'dk', 'no', 'ch', 'pl', 'cz', 'sk', 'hr', 'bg', 'ro', 'hu', 'lt',
  'lv', 'ee', 'si', 'mt', 'cy', 'lu', 'gr', 'ca', 'au', 'sg', 'jp', 'kr',
  'br', // Brazil is supported
]);

function detectUserCountry(): string {
  if (typeof navigator === 'undefined') return '';
  // Try Intl first (most reliable), then parse navigator.languages
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const tzCountryMap: Record<string, string> = {
      'America/Bogota': 'co', 'America/Mexico_City': 'mx', 'America/Sao_Paulo': 'br',
      'America/Argentina/Buenos_Aires': 'ar', 'America/Santiago': 'cl',
      'America/Lima': 'pe', 'America/Caracas': 've', 'America/Guayaquil': 'ec',
      'America/New_York': 'us', 'America/Chicago': 'us', 'America/Los_Angeles': 'us',
      'America/Denver': 'us', 'America/Toronto': 'ca', 'Europe/London': 'gb',
      'Europe/Berlin': 'de', 'Europe/Paris': 'fr', 'Europe/Madrid': 'es',
      'Europe/Rome': 'it', 'Asia/Tokyo': 'jp', 'Asia/Seoul': 'kr',
      'Australia/Sydney': 'au', 'Asia/Singapore': 'sg', 'America/Havana': 'cu',
    };
    if (tzCountryMap[tz]) return tzCountryMap[tz];
  } catch {}
  // Fallback: parse region from language tags
  for (const lang of navigator.languages || [navigator.language]) {
    const region = lang.split('-')[1]?.toLowerCase();
    if (region && region.length === 2) return region;
  }
  return '';
}

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

type FundTab = 'crypto' | 'card';

export default function FundPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <div className='text-center py-20'>
            <Loader2 className='w-12 h-12 text-brand-primary animate-spin mx-auto' />
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
  // Direct address bypass — dev-only, gated to prevent production abuse
  const directAddress = process.env.NODE_ENV === 'development' ? searchParams.get('address') : null;

  const [recipient, setRecipient] = useState<RecipientInfo | null>(
    directAddress ? { maskedPhone: directAddress, address: directAddress } : null
  );
  const [loading, setLoading] = useState(!!token && !directAddress);
  const [error, setError] = useState('');
  const coinbaseAvailable = COINBASE_APP_ID && COINBASE_ALLOWED_COUNTRIES.has(detectUserCountry());
  const [activeTab, setActiveTab] = useState<FundTab>(coinbaseAvailable ? 'card' : 'crypto');

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
      const amount = (Number(route.toAmount) / 1e6).toFixed(2);
      fetch('/api/notify-fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: recipient.address, type: 'usdc', amount, txHash }),
      }).catch((err) => console.error('Fund notification failed:', err));
    });
    return unsubscribe;
  }, [recipient]);

  if (!token && !directAddress && !recipient) {
    return <PhoneLookupView onResolved={setRecipient} />;
  }

  if (loading) {
    return (
      <Shell>
        <div className='text-center py-20'>
          <Loader2 className='w-12 h-12 text-brand-primary animate-spin mx-auto mb-4' />
          <p className='text-[var(--text-secondary)]'>Loading fund link...</p>
        </div>
      </Shell>
    );
  }

  if (error || !recipient) {
    return (
      <Shell>
        <div className='text-center py-20'>
          <AlertCircle className='w-12 h-12 text-red-400 mx-auto mb-4' />
          <h2 className='font-display text-xl font-bold uppercase text-[var(--text-primary)] mb-2'>
            {error || 'Something went wrong'}
          </h2>
          <p className='text-[var(--text-secondary)] mb-6'>
            This fund link may be expired or invalid.
          </p>
          <a
            href={SIPPY_HOME}
            className='inline-flex items-center gap-2 px-5 py-2.5 bg-brand-primary text-white rounded-xl font-semibold hover:bg-brand-primary-hover transition-smooth'
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
        maxWidth: '100%',
        width: '100%',
      },
    },
  };

  return (
    <Shell>
      {/* Recipient card */}
      <div className='max-w-xl mx-auto mb-4'>
        <div className='p-3 bg-brand-primary-light rounded-2xl border border-brand-primary/20'>
          <div className='flex items-center gap-3'>
            <div className='w-10 h-10 bg-brand-primary rounded-full flex items-center justify-center'>
              <CheckCircle2 className='w-5 h-5 text-white' />
            </div>
            <div>
              <p className='text-sm text-brand-primary font-medium'>Sending to</p>
              <p className='text-lg font-bold text-[var(--text-primary)]'>
                {recipient.maskedPhone.startsWith('0x')
                  ? `${recipient.maskedPhone.slice(0, 6)}…${recipient.maskedPhone.slice(-4)}`
                  : recipient.maskedPhone}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab toggle */}
      <div className='max-w-xl mx-auto mb-4'>
        <div className='flex bg-brand-primary/5 rounded-xl p-1 gap-1'>
          <button
            onClick={() => setActiveTab('card')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'card'
                ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <CreditCard className='w-4 h-4' />
            Card / Bank
          </button>
          <button
            onClick={() => setActiveTab('crypto')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'crypto'
                ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <ArrowLeftRight className='w-4 h-4' />
            From Crypto
          </button>
        </div>
      </div>

      {/* Active tab content */}
      <div className='max-w-xl mx-auto'>
        {activeTab === 'card' ? (
          <CardBankTab address={recipient.address} coinbaseAvailable={!!coinbaseAvailable} />
        ) : hydrated ? (
          <LiFiWidget config={widgetConfig} integrator='sippy' />
        ) : (
          <WidgetSkeleton config={widgetConfig} />
        )}
      </div>

      <p className='text-center text-sm text-[var(--text-secondary)] mt-6 max-w-md mx-auto'>
        {activeTab === 'card'
          ? 'Buy USDC with your card or bank account. It arrives directly in their Sippy account on Arbitrum.'
          : 'Connect your wallet, pick a token, and it arrives as USDC in their Sippy account on Arbitrum.'}
      </p>
    </Shell>
  );
}

function CardBankTab({ address, coinbaseAvailable }: { address: string; coinbaseAvailable: boolean }) {
  return (
    <div className='space-y-4'>
      {coinbaseAvailable ? (
        <CoinbaseOnrampTab address={address} />
      ) : (
        <div className='bg-[var(--bg-primary)] panel-frame rounded-2xl p-8 text-center opacity-50'>
          <div className='w-16 h-16 bg-[#0052FF]/10 rounded-2xl mx-auto mb-4 flex items-center justify-center'>
            <CreditCard className='w-8 h-8 text-[#0052FF]' />
          </div>
          <h3 className='font-display text-xl font-bold uppercase text-[var(--text-primary)] mb-2'>Coinbase</h3>
          <p className='text-[var(--text-secondary)] text-sm'>Not available in your country</p>
        </div>
      )}
      <div className='bg-[var(--bg-primary)] panel-frame rounded-2xl p-8 text-center opacity-50'>
        <div className='w-16 h-16 bg-brand-primary/10 rounded-2xl mx-auto mb-4 flex items-center justify-center'>
          <CreditCard className='w-8 h-8 text-brand-primary' />
        </div>
        <h3 className='font-display text-xl font-bold uppercase text-[var(--text-primary)] mb-2'>Pay with Card or Bank</h3>
        <p className='text-[var(--text-secondary)] mb-4 text-sm'>
          Buy USDC using your local card, bank transfer, or payment method.
        </p>
        <button
          disabled
          className='w-full bg-brand-primary text-white py-3.5 rounded-xl font-semibold opacity-50 cursor-not-allowed'
        >
          Coming Soon
        </button>
        <p className='text-xs text-[var(--text-muted)] mt-3'>Local payment methods</p>
      </div>
    </div>
  );
}

function CoinbaseOnrampTab({ address }: { address: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'checking' | 'error'>('idle');

  const handleOpen = useCallback(async () => {
    setStatus('loading');

    // Fetch a one-time session token from our API route
    let sessionToken: string;
    try {
      const res = await fetch('/api/onramp-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
      const data = await res.json();
      sessionToken = data.token;
    } catch (err) {
      console.error('Failed to get onramp session token:', err);
      setStatus('error');
      return;
    }

    // Generate the Coinbase Onramp URL with the session token
    const onrampUrl = generateOnRampURL({
      sessionToken,
      addresses: { [address]: ['arbitrum'] },
      assets: ['USDC'],
      defaultNetwork: 'arbitrum',
    });

    // Open in a popup window
    const w = 500;
    const h = 720;
    const left = Math.round((screen.width - w) / 2);
    const top = Math.round((screen.height - h) / 2);
    const popup = window.open(onrampUrl, 'coinbase-onramp', `width=${w},height=${h},left=${left},top=${top}`);

    // Poll for popup close — show confirmation message when done
    const timer = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(timer);
        setStatus('checking');
      }
    }, 500);
  }, [address]);

  if (status === 'checking') {
    return (
      <div className='bg-[var(--bg-primary)] panel-frame rounded-2xl p-8 text-center'>
        <Clock className='w-16 h-16 text-amber-500 mx-auto mb-4' />
        <h3 className='font-display text-xl font-bold uppercase text-[var(--text-primary)] mb-2'>Checking Purchase...</h3>
        <p className='text-[var(--text-secondary)] mb-4'>
          If your purchase completed successfully, the USDC should appear in the Sippy account within a few minutes. Check the balance on WhatsApp to confirm.
        </p>
        <button
          onClick={() => setStatus('idle')}
          className='text-brand-primary font-semibold hover:underline'
        >
          Buy Again
        </button>
      </div>
    );
  }

  return (
    <div className='bg-[var(--bg-primary)] panel-frame rounded-2xl p-8'>
      <div className='text-center'>
        <div className='w-16 h-16 bg-[#0052FF]/10 rounded-2xl mx-auto mb-4 flex items-center justify-center'>
          <CreditCard className='w-8 h-8 text-[#0052FF]' />
        </div>
        <h3 className='font-display text-xl font-bold uppercase text-[var(--text-primary)] mb-2'>Buy with Card or Bank</h3>
        <p className='text-[var(--text-secondary)] mb-6 text-sm'>
          Purchase USDC using your debit card, credit card, or bank transfer via Coinbase.
        </p>
        <button
          onClick={handleOpen}
          disabled={status === 'loading'}
          className='w-full bg-[#0052FF] text-white py-3.5 rounded-xl font-semibold hover:bg-[#0040CC] transition-smooth disabled:opacity-50'
        >
          {status === 'loading' ? (
            <span className='flex items-center justify-center gap-2'>
              <Loader2 className='w-4 h-4 animate-spin' />
              Opening Coinbase...
            </span>
          ) : (
            'Buy USDC'
          )}
        </button>
        <p className='text-xs text-[var(--text-muted)] mt-3'>Powered by Coinbase</p>
      </div>
    </div>
  );
}

function PhoneLookupView({ onResolved }: { onResolved: (r: RecipientInfo) => void }) {
  const [phone, setPhone] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  const handleLookup = async () => {
    const formatted = phone.startsWith('+') ? phone : `+${phone.replace(/\D/g, '')}`;
    if (formatted.replace(/\D/g, '').length < 7) {
      setLookupError('Enter a valid phone number');
      return;
    }

    setLookupLoading(true);
    setLookupError('');

    try {
      const res = await fetch('/api/resolve-by-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formatted }),
      });
      const data = await res.json();

      if (!res.ok) {
        setLookupError(data.error || 'Account not found');
        return;
      }

      onResolved(data);
    } catch {
      setLookupError('Failed to look up account');
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <Shell>
      <div className='text-center py-16'>
        <div className='w-24 h-24 bg-gradient-to-br from-brand-primary-light to-brand-primary-muted rounded-full mx-auto mb-8 flex items-center justify-center shadow-lg'>
          <Wallet className='w-12 h-12 text-brand-primary' />
        </div>
        <h1 className='font-display text-3xl md:text-4xl font-bold uppercase text-[var(--text-primary)] leading-tight tracking-tight mb-4'>
          Fund a Sippy Account
        </h1>
        <p className='text-lg text-[var(--text-secondary)] leading-relaxed max-w-md mx-auto mb-6'>
          Enter the phone number of the person you want to fund.
        </p>

        <div className='max-w-sm mx-auto'>
          {lookupError && (
            <div className='mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm'>
              {lookupError}
            </div>
          )}

          <input
            type='tel'
            placeholder='+1 234 567 8900'
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !lookupLoading && handleLookup()}
            className='w-full px-4 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-brand-primary mb-4 text-center text-lg'
          />

          <button
            onClick={handleLookup}
            disabled={lookupLoading || phone.replace(/\D/g, '').length < 7}
            className='w-full px-6 py-3 bg-brand-primary text-white rounded-xl font-semibold hover:bg-brand-primary-hover transition-smooth disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
          >
            {lookupLoading ? (
              <Loader2 className='w-5 h-5 animate-spin' />
            ) : (
              'Find Account'
            )}
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className='min-h-screen'>
      <nav className='sticky top-0 z-50 bg-[var(--bg-nav-blur)] backdrop-blur-xl border-b border-[var(--border-default)]'>
        <div className='max-w-7xl mx-auto px-6 py-4'>
          <a href={SIPPY_HOME} className='flex items-center gap-2 group w-fit'>
            <ArrowLeft className='w-5 h-5 text-[var(--text-secondary)] group-hover:text-brand-primary transition-smooth' />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src='/images/logos/sippy-wordmark-cheetah-on-white.svg'
              alt='Sippy'
              width={110}
              height={44}
              className='dark:hidden'
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src='/images/logos/sippy-wordmark-white.svg'
              alt='Sippy'
              width={110}
              height={44}
              className='hidden dark:block'
            />
          </a>
        </div>
      </nav>

      <section className='relative overflow-hidden'>
        <div className='absolute inset-0 pointer-events-none'>
          <div className='absolute top-[-120px] right-[-160px] w-[560px] h-[560px] bg-brand-primary/15 blur-[150px]' />
          <div className='absolute bottom-[-180px] left-[-120px] w-[520px] h-[520px] bg-[#bfdbfe]/22 blur-[170px]' />
        </div>

        <div className='relative z-10 max-w-4xl mx-auto px-6 py-6 md:py-8'>
          {children}
        </div>
      </section>
    </div>
  );
}
