'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  useSendUserOperation,
} from '@coinbase/cdp-hooks';
import { getStoredToken, clearToken } from '@/lib/auth';
import { useSessionGuard } from '@/lib/useSessionGuard';
import {
  getBalances,
  getActivity,
  formatAddress,
  getExplorerTxUrl,
  type NormalizedTransaction,
  type Balance,
} from '@/lib/blockscout';
import { ensureGasReady, buildUsdcTransferCall } from '@/lib/usdc-transfer';
import { ActivityList } from '@/components/activity/ActivityList';
import {
  Language,
  getStoredLanguage,
  storeLanguage,
  resolveLanguage,
  localizeError,
  t,
} from '../../lib/i18n';

const NETWORK = process.env.NEXT_PUBLIC_SIPPY_NETWORK || 'arbitrum';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';
const CDP_PROJECT_ID = process.env.NEXT_PUBLIC_CDP_PROJECT_ID || '';

type SendStep = 'form' | 'confirm' | 'sending' | 'success' | 'error';
type SendFrom = 'whatsapp' | 'web';

function WalletContent() {
  const searchParams = useSearchParams();
  const phoneFromUrl = searchParams.get('phone') || '';

  // Session guard hook
  const {
    isAuthenticated,
    isCheckingSession,
    expiryWarning,
    reAuthVisible,
    reAuthStep,
    reAuthPhone,
    reAuthOtp,
    reAuthError,
    reAuthLoading,
    setReAuthPhone,
    setReAuthOtp,
    handleReAuthSendOtp,
    handleReAuthVerifyOtp,
    requireReauth,
    dismissReAuth,
    currentUser,
    signOut,
  } = useSessionGuard();

  const isPhoneLocked = !!phoneFromUrl;
  const isCdpConfigured = !!CDP_PROJECT_ID;

  // Initialize re-auth phone from URL param
  useEffect(() => {
    if (phoneFromUrl) setReAuthPhone(phoneFromUrl);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Language state
  const [lang, setLang] = useState<Language>('en');

  // Wallet state — two wallets
  const [eoaAddress, setEoaAddress] = useState<string | null>(null);
  const [eoaBalances, setEoaBalances] = useState<Balance | null>(null);
  const [smartBalances, setSmartBalances] = useState<Balance | null>(null);
  const [activity, setActivity] = useState<NormalizedTransaction[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Send state
  const [sendStep, setSendStep] = useState<SendStep>('form');
  const [sendFrom, setSendFrom] = useState<SendFrom>('whatsapp');
  const [recipient, setRecipient] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendTxHash, setSendTxHash] = useState<string | null>(null);

  // CDP Hooks
  const {
    sendUserOperation,
    status: sendOpStatus,
    data: sendOpData,
    error: sendOpError,
  } = useSendUserOperation();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const smartAccountAddress = (currentUser as any)?.evmSmartAccountObjects?.[0]?.address ?? null;

  // Active balance based on selected send-from wallet
  const activeBalance = sendFrom === 'whatsapp' ? eoaBalances : smartBalances;

  // ============================================================================
  // Language
  // ============================================================================

  useEffect(() => {
    const cached = getStoredLanguage()
    if (cached) setLang(cached)

    const token = getStoredToken()
    resolveLanguage(phoneFromUrl || null, token, BACKEND_URL)
      .then(resolved => { if (resolved !== cached) setLang(resolved) })
      .catch(() => {})
  }, [])

  // ============================================================================
  // Data fetching
  // ============================================================================

  const fetchWalletData = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    setIsLoadingData(true);
    try {
      // Fetch EOA address from backend
      const statusRes = await fetch(`${BACKEND_URL}/api/wallet-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (statusRes.ok) {
        const status = await statusRes.json();
        if (status.walletAddress) {
          setEoaAddress(status.walletAddress);
          const [eoaBal, act] = await Promise.all([
            getBalances(status.walletAddress),
            getActivity(status.walletAddress, 10),
          ]);
          setEoaBalances(eoaBal);
          setActivity(act);
          // Auto-select whichever wallet has funds
          if (parseFloat(eoaBal?.usdc ?? '0') > 0) setSendFrom('whatsapp');
        }
      }

      // Fetch smart account balance in parallel if available
      if (smartAccountAddress) {
        const smartBal = await getBalances(smartAccountAddress);
        setSmartBalances(smartBal);
        // If EOA is empty but smart account has funds, auto-select smart
        if (
          parseFloat(eoaBalances?.usdc ?? '0') === 0 &&
          parseFloat(smartBal?.usdc ?? '0') > 0
        ) {
          setSendFrom('web');
        }
      }
    } catch (err) {
      console.error('Failed to fetch wallet data:', err);
    } finally {
      setIsLoadingData(false);
    }
  }, [smartAccountAddress, BACKEND_URL]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchWalletData();
    const interval = setInterval(fetchWalletData, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchWalletData]);

  // ============================================================================
  // Send flow
  // ============================================================================

  const isPhoneNumber = (input: string) =>
    /^\+?\d{7,15}$/.test(input.replace(/[\s\-()]/g, ''));

  const isAddress = (input: string) => /^0x[a-fA-F0-9]{40}$/.test(input);

  const handleSendReview = async () => {
    setSendError(null);

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setSendError(t('wallet.errInvalidAmount', lang));
      return;
    }
    if (activeBalance && numAmount > parseFloat(activeBalance.usdc)) {
      setSendError(t('wallet.errInsufficientBalance', lang));
      return;
    }

    const trimmed = recipient.trim();
    if (isAddress(trimmed)) {
      setResolvedAddress(trimmed);
      setSendStep('confirm');
    } else if (isPhoneNumber(trimmed)) {
      try {
        const accessToken = getStoredToken();
        if (!accessToken) {
          setSendError(t('wallet.errSessionExpired', lang));
          return;
        }

        const response = await fetch(`${BACKEND_URL}/api/resolve-phone`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            phone: trimmed.startsWith('+') ? trimmed : `+${trimmed}`,
          }),
        });

        if (response.status === 404) {
          setSendError(t('wallet.errNotSippyUser', lang));
          return;
        }
        if (response.status === 429) {
          setSendError(t('wallet.errTooManyLookups', lang));
          return;
        }
        if (!response.ok) {
          setSendError(t('wallet.errResolvePhone', lang));
          return;
        }

        const data = await response.json();
        setResolvedAddress(data.address);
        setSendStep('confirm');
      } catch {
        setSendError(t('wallet.errNetwork', lang));
      }
    } else {
      setSendError(t('wallet.errInvalidInput', lang));
    }
  };

  const handleSendConfirm = async () => {
    if (!resolvedAddress) return;

    setSendError(null);
    setSendStep('sending');

    try {
      if (sendFrom === 'whatsapp') {
        // EOA send via backend SpendPermission
        const accessToken = getStoredToken();
        if (!accessToken) throw new Error('Session expired. Please sign in again.');

        const res = await fetch(`${BACKEND_URL}/api/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ to: resolvedAddress, amount }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(localizeError(body, 'send', lang));
        }

        const data = await res.json();
        setSendTxHash(data.txHash ?? null);
        setSendStep('success');
        fetchWalletData();
      } else {
        // Smart account UserOp
        if (!smartAccountAddress) throw new Error('Smart account not found.');

        const accessToken = getStoredToken();
        if (!accessToken) throw new Error('Session expired. Please sign in again.');

        const gasReady = await ensureGasReady(BACKEND_URL, accessToken);
        if (!gasReady)
          throw new Error('Unable to prepare transaction. Try again in a few minutes.');

        const call = buildUsdcTransferCall(resolvedAddress, amount);
        await sendUserOperation({
          evmSmartAccount: smartAccountAddress as `0x${string}`,
          network: NETWORK as 'arbitrum',
          calls: [call],
        });
        // success handled by useEffect watching sendOpStatus
      }
    } catch (err) {
      console.error('Send failed:', err);
      setSendError(localizeError(err, 'send', lang));
      setSendStep('error');
    }
  };

  // Watch smart account UserOp status
  useEffect(() => {
    if (sendFrom !== 'web') return;
    if (sendOpStatus === 'success' && sendOpData) {
      setSendTxHash(sendOpData.transactionHash ?? null);
      setSendStep('success');
      fetchWalletData();
    }
    if (sendOpStatus === 'error' && sendOpError) {
      setSendError(localizeError(sendOpError, 'send', lang));
      setSendStep('error');
    }
  }, [sendOpStatus, sendOpData, sendOpError, sendFrom, fetchWalletData]);

  const resetSend = () => {
    setSendStep('form');
    setRecipient('');
    setResolvedAddress(null);
    setAmount('');
    setSendError(null);
    setSendTxHash(null);
  };

  const handleMax = () => {
    if (activeBalance) setAmount(activeBalance.usdc);
  };

  // ============================================================================
  // Render helpers
  // ============================================================================

  if (isCheckingSession) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4'>
        <div className='max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center'>
          <div className='animate-pulse'>
            <div className='text-4xl mb-4'>💰</div>
            <p className='text-gray-600'>{t('wallet.loading', lang)}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !isCheckingSession) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4'>
        <div className='max-w-md w-full bg-white rounded-2xl shadow-xl p-8'>
          <h1 className='text-2xl font-bold mb-6 text-gray-900'>{t('wallet.title', lang)}</h1>
          <p className='text-gray-600 mb-6'>
            {t('wallet.subtitle', lang)}
          </p>

          {!isCdpConfigured && (
            <div className='mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm'>
              <strong>{t('wallet.configRequired', lang)}</strong> {t('wallet.configInstruction', lang)}
            </div>
          )}

          {reAuthError && (
            <div className='mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm'>
              {reAuthError}
            </div>
          )}

          {reAuthStep === 'phone' && (
            <>
              <input
                type='tel'
                value={reAuthPhone}
                onChange={(e) => !isPhoneLocked && setReAuthPhone(e.target.value)}
                placeholder='+573001234567'
                disabled={isPhoneLocked}
                className={`w-full p-3 border rounded-lg mb-4 text-gray-900 ${
                  isPhoneLocked ? 'bg-gray-100 text-gray-600' : ''
                }`}
              />
              {isPhoneLocked && (
                <p className='text-sm text-gray-500 mb-4'>{t('wallet.phoneFromWhatsapp', lang)}</p>
              )}
              <button
                onClick={handleReAuthSendOtp}
                disabled={reAuthLoading || !reAuthPhone || !isCdpConfigured}
                className='w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {reAuthLoading ? t('wallet.sending', lang) : t('wallet.sendCode', lang)}
              </button>
            </>
          )}

          {reAuthStep === 'otp' && (
            <>
              <p className='text-gray-600 mb-4'>
                {t('wallet.codeSentTo', lang)} {reAuthPhone}
              </p>
              <input
                type='text'
                value={reAuthOtp}
                onChange={(e) => setReAuthOtp(e.target.value.replace(/\D/g, ''))}
                placeholder='123456'
                maxLength={6}
                className='w-full p-3 border rounded-lg mb-4 text-center text-2xl tracking-widest text-gray-900'
              />
              <button
                onClick={handleReAuthVerifyOtp}
                disabled={reAuthLoading || reAuthOtp.length !== 6}
                className='w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {reAuthLoading ? t('wallet.verifying', lang) : t('wallet.verify', lang)}
              </button>
              <button
                onClick={() => setReAuthOtp('')}
                className='w-full mt-2 text-gray-500 py-2'
              >
                {t('wallet.back', lang)}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // Authenticated wallet view
  // ============================================================================

  return (
    <div className='min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 p-4'>
      <div className='max-w-md mx-auto space-y-4'>

        {/* Expiry warning banner */}
        {expiryWarning && (
          <div className='flex items-center justify-between p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-800 text-sm'>
            <span>Your session expires soon. Re-authenticate to continue.</span>
            <button onClick={requireReauth} className='ml-3 font-semibold underline whitespace-nowrap'>
              Re-auth
            </button>
          </div>
        )}

        {/* Inline re-auth overlay */}
        {reAuthVisible && (
          <div className='bg-white rounded-2xl shadow-xl p-6 border border-amber-200'>
            <div className='flex items-center justify-between mb-4'>
              <h2 className='text-lg font-semibold text-gray-900'>Session expired</h2>
              <button onClick={dismissReAuth} className='text-gray-400 hover:text-gray-600 text-xl leading-none'>&times;</button>
            </div>
            {reAuthError && (
              <div className='mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm'>
                {reAuthError}
              </div>
            )}
            {reAuthStep === 'phone' && (
              <>
                <input
                  type='tel'
                  value={reAuthPhone}
                  onChange={(e) => setReAuthPhone(e.target.value)}
                  placeholder='+573001234567'
                  className='w-full p-3 border rounded-lg mb-3 text-gray-900'
                />
                <button
                  onClick={handleReAuthSendOtp}
                  disabled={reAuthLoading || !reAuthPhone}
                  className='w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  {reAuthLoading ? t('wallet.sending', lang) : t('wallet.sendCode', lang)}
                </button>
              </>
            )}
            {reAuthStep === 'otp' && (
              <>
                <p className='text-gray-600 mb-3 text-sm'>{t('wallet.codeSentTo', lang)} {reAuthPhone}</p>
                <input
                  type='text'
                  value={reAuthOtp}
                  onChange={(e) => setReAuthOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder='123456'
                  maxLength={6}
                  className='w-full p-3 border rounded-lg mb-3 text-center text-2xl tracking-widest text-gray-900'
                />
                <button
                  onClick={handleReAuthVerifyOtp}
                  disabled={reAuthLoading || reAuthOtp.length !== 6}
                  className='w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  {reAuthLoading ? t('wallet.verifying', lang) : t('wallet.verify', lang)}
                </button>
              </>
            )}
          </div>
        )}

        {/* Wallet cards */}
        <div className='grid grid-cols-2 gap-3'>
          {/* WhatsApp Wallet (EOA) */}
          <button
            onClick={() => setSendFrom('whatsapp')}
            className={`bg-white rounded-2xl shadow p-4 text-left transition-all ${
              sendFrom === 'whatsapp' ? 'ring-2 ring-emerald-500' : 'opacity-70'
            }`}
          >
            <p className='text-xs text-gray-500 mb-1 font-medium'>{t('wallet.whatsappWallet', lang)}</p>
            {isLoadingData ? (
              <div className='animate-pulse h-7 bg-gray-100 rounded w-20 mb-1' />
            ) : (
              <p className='text-xl font-bold text-gray-900'>
                ${parseFloat(eoaBalances?.usdc ?? '0').toFixed(2)}
              </p>
            )}
            <p className='text-xs text-gray-400 mt-1 truncate'>
              {eoaAddress ? formatAddress(eoaAddress) : '—'}
            </p>
          </button>

          {/* Web Wallet (Smart Account) */}
          <button
            onClick={() => setSendFrom('web')}
            className={`bg-white rounded-2xl shadow p-4 text-left transition-all ${
              sendFrom === 'web' ? 'ring-2 ring-emerald-500' : 'opacity-70'
            }`}
          >
            <p className='text-xs text-gray-500 mb-1 font-medium'>{t('wallet.webWallet', lang)}</p>
            {isLoadingData ? (
              <div className='animate-pulse h-7 bg-gray-100 rounded w-20 mb-1' />
            ) : (
              <p className='text-xl font-bold text-gray-900'>
                ${parseFloat(smartBalances?.usdc ?? '0').toFixed(2)}
              </p>
            )}
            <p className='text-xs text-gray-400 mt-1 truncate'>
              {smartAccountAddress ? formatAddress(smartAccountAddress) : '—'}
            </p>
          </button>
        </div>

        {/* Selected wallet address + copy */}
        <div className='bg-white rounded-2xl shadow-xl px-5 py-3 flex items-center justify-between'>
          <div>
            <p className='text-xs text-gray-400'>
              {sendFrom === 'whatsapp' ? t('wallet.whatsappWallet', lang) : t('wallet.webWallet', lang)} {t('wallet.walletAddress', lang)}
            </p>
            <p className='text-sm font-mono text-gray-700'>
              {sendFrom === 'whatsapp'
                ? eoaAddress
                  ? formatAddress(eoaAddress)
                  : '—'
                : smartAccountAddress
                  ? formatAddress(smartAccountAddress)
                  : '—'}
            </p>
          </div>
          <button
            onClick={() => {
              const addr = sendFrom === 'whatsapp' ? eoaAddress : smartAccountAddress;
              if (addr) navigator.clipboard.writeText(addr);
            }}
            className='text-xs text-emerald-600 hover:text-emerald-700 font-medium'
          >
            {t('wallet.copy', lang)}
          </button>
        </div>

        {/* Send section */}
        <div className='bg-white rounded-2xl shadow-xl p-6'>
          <div className='flex items-center justify-between mb-4'>
            <h2 className='text-lg font-semibold text-gray-900'>{t('wallet.send', lang)}</h2>
            <span className='text-xs text-gray-400'>
              {t('wallet.sendFrom', lang)}{' '}
              <span className='font-medium text-gray-600'>
                {sendFrom === 'whatsapp' ? t('wallet.whatsappWallet', lang) : t('wallet.webWallet', lang)}
              </span>
            </span>
          </div>

          {sendStep === 'form' && (
            <div className='space-y-3'>
              <div>
                <label className='block text-sm text-gray-600 mb-1'>
                  {t('wallet.toLabel', lang)} ({t('wallet.toLabelHint', lang)})
                </label>
                <input
                  type='text'
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder='+573001234567 or 0x...'
                  className='w-full p-3 border rounded-lg text-gray-900'
                />
              </div>
              <div>
                <label className='block text-sm text-gray-600 mb-1'>
                  {t('wallet.amountLabel', lang)}
                </label>
                <div className='flex gap-2'>
                  <input
                    type='number'
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder='0.00'
                    step='0.01'
                    min='0'
                    className='flex-1 p-3 border rounded-lg text-gray-900'
                  />
                  <button
                    onClick={handleMax}
                    className='px-4 py-3 bg-gray-100 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200'
                  >
                    {t('wallet.max', lang).toUpperCase()}
                  </button>
                </div>
              </div>
              {sendError && <p className='text-sm text-red-600'>{sendError}</p>}
              <button
                onClick={handleSendReview}
                disabled={!recipient || !amount}
                className='w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {t('wallet.review', lang)}
              </button>
            </div>
          )}

          {sendStep === 'confirm' && (
            <div className='space-y-4'>
              <div className='p-4 bg-gray-50 rounded-lg'>
                <p className='text-sm text-gray-600'>{t('wallet.send', lang)}</p>
                <p className='text-2xl font-bold text-gray-900'>
                  ${parseFloat(amount).toFixed(2)} USDC
                </p>
                <p className='text-sm text-gray-600 mt-2'>{t('wallet.to', lang)}</p>
                <p className='text-sm font-mono text-gray-800 break-all'>
                  {isPhoneNumber(recipient.trim())
                    ? `${recipient.trim()} (${formatAddress(resolvedAddress || '')})`
                    : formatAddress(resolvedAddress || '')}
                </p>
                <p className='text-xs text-gray-400 mt-2'>
                  from {sendFrom === 'whatsapp' ? t('wallet.whatsappWallet', lang) : t('wallet.webWallet', lang)}
                </p>
              </div>
              <button
                onClick={handleSendConfirm}
                className='w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700'
              >
                {t('wallet.confirmSend', lang)}
              </button>
              <button
                onClick={() => setSendStep('form')}
                className='w-full py-2 text-gray-500 text-sm hover:text-gray-700'
              >
                {t('wallet.back', lang)}
              </button>
            </div>
          )}

          {sendStep === 'sending' && (
            <div className='text-center py-6'>
              <div className='animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mx-auto mb-4' />
              <p className='text-gray-700 font-medium'>
                {t('wallet.sendingProgress', lang)} ${parseFloat(amount).toFixed(2)} USDC...
              </p>
            </div>
          )}

          {sendStep === 'success' && (
            <div className='space-y-4'>
              <div className='text-center py-4'>
                <div className='text-4xl mb-2'>&#10003;</div>
                <p className='text-gray-900 font-semibold'>{t('wallet.sent', lang)}</p>
                <p className='text-sm text-gray-600'>
                  ${parseFloat(amount).toFixed(2)} USDC {t('wallet.sentSuccess', lang)}
                </p>
              </div>
              {sendTxHash && (
                <a
                  href={getExplorerTxUrl(sendTxHash)}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='block text-center text-sm text-emerald-600 hover:text-emerald-700 underline'
                >
                  {t('wallet.viewOnBlockscout', lang)}
                </a>
              )}
              <button
                onClick={resetSend}
                className='w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700'
              >
                {t('wallet.sendAnother', lang)}
              </button>
            </div>
          )}

          {sendStep === 'error' && (
            <div className='space-y-4'>
              <div className='p-4 bg-red-50 border border-red-200 rounded-lg'>
                <p className='text-sm text-red-700'>
                  {sendError || t('wallet.txFailed', lang)}
                </p>
              </div>
              <button
                onClick={handleSendConfirm}
                className='w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700'
              >
                {t('wallet.retry', lang)}
              </button>
              <button
                onClick={resetSend}
                className='w-full py-2 text-gray-500 text-sm hover:text-gray-700'
              >
                {t('wallet.cancel', lang)}
              </button>
            </div>
          )}
        </div>

        {/* Activity */}
        <ActivityList transactions={activity} lang={lang} />

        {/* Navigation */}
        <div className='bg-white rounded-2xl shadow-xl p-4 flex items-center justify-between'>
          <a
            href='/settings'
            className='text-sm text-emerald-600 hover:text-emerald-700 font-medium'
          >
            {t('wallet.settings', lang)}
          </a>
          <button
            onClick={async () => {
              clearToken();
              await signOut();
              setEoaBalances(null);
              setSmartBalances(null);
              setActivity([]);
              resetSend();
            }}
            className='text-sm text-gray-500 hover:text-gray-700'
          >
            {t('wallet.signOut', lang)}
          </button>
        </div>

        <div className='text-center text-xs text-gray-500 pb-4'>
          <p>{t('wallet.poweredBy', lang)}</p>
          <p className='mt-1'>Network: {NETWORK}</p>
        </div>
      </div>
    </div>
  );
}

export default function WalletPage() {
  return (
    <Suspense
      fallback={
        <div className='min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center'>
          <div className='text-gray-600'>Loading...</div>
        </div>
      }
    >
      <WalletContent />
    </Suspense>
  );
}
