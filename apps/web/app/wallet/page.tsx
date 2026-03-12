'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  useAuthenticateWithJWT,
  useCurrentUser,
  useIsSignedIn,
  useSignOut,
  useSendUserOperation,
} from '@coinbase/cdp-hooks';
import { sendOtp, verifyOtp, storeToken, getStoredToken, getFreshToken, clearToken } from '@/lib/auth';
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

const NETWORK = process.env.NEXT_PUBLIC_SIPPY_NETWORK || 'arbitrum';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';
const CDP_PROJECT_ID = process.env.NEXT_PUBLIC_CDP_PROJECT_ID || '';

type AuthStep = 'phone' | 'otp' | 'authenticated';
type SendStep = 'form' | 'confirm' | 'sending' | 'success' | 'error';
type SendFrom = 'whatsapp' | 'web';

function WalletContent() {
  const searchParams = useSearchParams();
  const phoneFromUrl = searchParams.get('phone') || '';

  // Auth state
  const [authStep, setAuthStep] = useState<AuthStep>('phone');
  const [phoneNumber, setPhoneNumber] = useState(phoneFromUrl);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasCheckedSession, setHasCheckedSession] = useState(false);

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
  const { authenticateWithJWT } = useAuthenticateWithJWT();
  const { currentUser } = useCurrentUser();
  const { isSignedIn } = useIsSignedIn();
  const { signOut } = useSignOut();
  const {
    sendUserOperation,
    status: sendOpStatus,
    data: sendOpData,
    error: sendOpError,
  } = useSendUserOperation();

  const smartAccountAddress =
    currentUser?.evmSmartAccountObjects?.[0]?.address ?? null;

  const isPhoneLocked = !!phoneFromUrl;
  const isCdpConfigured = !!CDP_PROJECT_ID;

  // Active balance based on selected send-from wallet
  const activeBalance = sendFrom === 'whatsapp' ? eoaBalances : smartBalances;

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
    if (authStep !== 'authenticated') return;
    fetchWalletData();
    const interval = setInterval(fetchWalletData, 30000);
    return () => clearInterval(interval);
  }, [authStep, fetchWalletData]);

  // ============================================================================
  // Auth
  // ============================================================================

  useEffect(() => {
    const checkExistingSession = async () => {
      if (hasCheckedSession) return;
      if (isSignedIn === undefined) return;
      if (isSignedIn && !currentUser) return;

      setHasCheckedSession(true);

      if (!isSignedIn) {
        setIsCheckingSession(false);
        return;
      }

      const addr =
        currentUser!.evmSmartAccounts?.[0] ||
        currentUser!.evmAccounts?.[0];
      if (!addr) {
        setIsCheckingSession(false);
        return;
      }

      if (!getFreshToken()) {
        clearToken();
        await signOut();
        setIsCheckingSession(false);
        return;
      }

      setAuthStep('authenticated');
      setIsCheckingSession(false);
    };

    checkExistingSession();
  }, [isSignedIn, currentUser, hasCheckedSession]);

  const handleSendOtp = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!isCdpConfigured) throw new Error('CDP not configured.');

      if (isSignedIn && currentUser) {
        setAuthStep('authenticated');
        return;
      }

      const formattedPhone = phoneNumber.startsWith('+')
        ? phoneNumber
        : `+${phoneNumber}`;
      setPhoneNumber(formattedPhone);
      await sendOtp(formattedPhone);
      setAuthStep('otp');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to send verification code';
      if (
        msg.toLowerCase().includes('already') ||
        msg.toLowerCase().includes('session')
      ) {
        if (currentUser) {
          setAuthStep('authenticated');
          return;
        }
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = await verifyOtp(phoneNumber, otp);
      storeToken(token);
      const { user } = await authenticateWithJWT();
      const addr = user.evmSmartAccounts?.[0] || user.evmAccounts?.[0];
      if (!addr)
        throw new Error(
          'No wallet found. Set up your wallet first at sippy.lat/setup'
        );

      setAuthStep('authenticated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

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
      setSendError('Enter a valid amount.');
      return;
    }
    if (activeBalance && numAmount > parseFloat(activeBalance.usdc)) {
      setSendError('Insufficient balance.');
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
          setSendError('Session expired. Please sign in again.');
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
          setSendError('This phone number is not a Sippy user.');
          return;
        }
        if (response.status === 429) {
          setSendError('Too many lookups. Try again later.');
          return;
        }
        if (!response.ok) {
          setSendError('Could not resolve phone number.');
          return;
        }

        const data = await response.json();
        setResolvedAddress(data.address);
        setSendStep('confirm');
      } catch {
        setSendError('Network error. Please try again.');
      }
    } else {
      setSendError('Enter a valid phone number or 0x address.');
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
          throw new Error(body.error || 'Send failed');
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
      setSendError(err instanceof Error ? err.message : 'Transaction failed.');
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
      setSendError(
        sendOpError instanceof Error ? sendOpError.message : 'Transaction failed.'
      );
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
            <p className='text-gray-600'>Checking your session...</p>
          </div>
        </div>
      </div>
    );
  }

  if (authStep !== 'authenticated') {
    return (
      <div className='min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4'>
        <div className='max-w-md w-full bg-white rounded-2xl shadow-xl p-8'>
          <h1 className='text-2xl font-bold mb-6 text-gray-900'>Sippy Wallet</h1>
          <p className='text-gray-600 mb-6'>
            Verify your phone number to access your wallet.
          </p>

          {!isCdpConfigured && (
            <div className='mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm'>
              <strong>Configuration Required:</strong> Set NEXT_PUBLIC_CDP_PROJECT_ID.
            </div>
          )}

          {error && (
            <div className='mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm'>
              {error}
            </div>
          )}

          {authStep === 'phone' && (
            <>
              <input
                type='tel'
                value={phoneNumber}
                onChange={(e) => !isPhoneLocked && setPhoneNumber(e.target.value)}
                placeholder='+573001234567'
                disabled={isPhoneLocked}
                className={`w-full p-3 border rounded-lg mb-4 text-gray-900 ${
                  isPhoneLocked ? 'bg-gray-100 text-gray-600' : ''
                }`}
              />
              {isPhoneLocked && (
                <p className='text-sm text-gray-500 mb-4'>Phone number from your WhatsApp link</p>
              )}
              <button
                onClick={handleSendOtp}
                disabled={isLoading || !phoneNumber || !isCdpConfigured}
                className='w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {isLoading ? 'Sending...' : 'Send Verification Code'}
              </button>
            </>
          )}

          {authStep === 'otp' && (
            <>
              <p className='text-gray-600 mb-4'>
                We sent a 6-digit code to {phoneNumber}
              </p>
              <input
                type='text'
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder='123456'
                maxLength={6}
                className='w-full p-3 border rounded-lg mb-4 text-center text-2xl tracking-widest text-gray-900'
              />
              <button
                onClick={handleVerifyOtp}
                disabled={isLoading || otp.length !== 6}
                className='w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {isLoading ? 'Verifying...' : 'Verify'}
              </button>
              <button
                onClick={() => setAuthStep('phone')}
                className='w-full mt-2 text-gray-500 py-2'
              >
                Back
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

        {/* Wallet cards */}
        <div className='grid grid-cols-2 gap-3'>
          {/* WhatsApp Wallet (EOA) */}
          <button
            onClick={() => setSendFrom('whatsapp')}
            className={`bg-white rounded-2xl shadow p-4 text-left transition-all ${
              sendFrom === 'whatsapp' ? 'ring-2 ring-emerald-500' : 'opacity-70'
            }`}
          >
            <p className='text-xs text-gray-500 mb-1 font-medium'>WhatsApp Wallet</p>
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
            <p className='text-xs text-gray-500 mb-1 font-medium'>Web Wallet</p>
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
              {sendFrom === 'whatsapp' ? 'WhatsApp Wallet' : 'Web Wallet'} address
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
            Copy
          </button>
        </div>

        {/* Send section */}
        <div className='bg-white rounded-2xl shadow-xl p-6'>
          <div className='flex items-center justify-between mb-4'>
            <h2 className='text-lg font-semibold text-gray-900'>Send</h2>
            <span className='text-xs text-gray-400'>
              from{' '}
              <span className='font-medium text-gray-600'>
                {sendFrom === 'whatsapp' ? 'WhatsApp Wallet' : 'Web Wallet'}
              </span>
            </span>
          </div>

          {sendStep === 'form' && (
            <div className='space-y-3'>
              <div>
                <label className='block text-sm text-gray-600 mb-1'>
                  To (phone or 0x address)
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
                  Amount (USDC)
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
                    MAX
                  </button>
                </div>
              </div>
              {sendError && <p className='text-sm text-red-600'>{sendError}</p>}
              <button
                onClick={handleSendReview}
                disabled={!recipient || !amount}
                className='w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                Review
              </button>
            </div>
          )}

          {sendStep === 'confirm' && (
            <div className='space-y-4'>
              <div className='p-4 bg-gray-50 rounded-lg'>
                <p className='text-sm text-gray-600'>Sending</p>
                <p className='text-2xl font-bold text-gray-900'>
                  ${parseFloat(amount).toFixed(2)} USDC
                </p>
                <p className='text-sm text-gray-600 mt-2'>To</p>
                <p className='text-sm font-mono text-gray-800 break-all'>
                  {isPhoneNumber(recipient.trim())
                    ? `${recipient.trim()} (${formatAddress(resolvedAddress || '')})`
                    : formatAddress(resolvedAddress || '')}
                </p>
                <p className='text-xs text-gray-400 mt-2'>
                  from {sendFrom === 'whatsapp' ? 'WhatsApp Wallet' : 'Web Wallet'}
                </p>
              </div>
              <button
                onClick={handleSendConfirm}
                className='w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700'
              >
                Confirm Send
              </button>
              <button
                onClick={() => setSendStep('form')}
                className='w-full py-2 text-gray-500 text-sm hover:text-gray-700'
              >
                Back
              </button>
            </div>
          )}

          {sendStep === 'sending' && (
            <div className='text-center py-6'>
              <div className='animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mx-auto mb-4' />
              <p className='text-gray-700 font-medium'>
                Sending ${parseFloat(amount).toFixed(2)} USDC...
              </p>
            </div>
          )}

          {sendStep === 'success' && (
            <div className='space-y-4'>
              <div className='text-center py-4'>
                <div className='text-4xl mb-2'>&#10003;</div>
                <p className='text-gray-900 font-semibold'>Sent!</p>
                <p className='text-sm text-gray-600'>
                  ${parseFloat(amount).toFixed(2)} USDC sent successfully
                </p>
              </div>
              {sendTxHash && (
                <a
                  href={getExplorerTxUrl(sendTxHash)}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='block text-center text-sm text-emerald-600 hover:text-emerald-700 underline'
                >
                  View on Blockscout
                </a>
              )}
              <button
                onClick={resetSend}
                className='w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700'
              >
                Send Another
              </button>
            </div>
          )}

          {sendStep === 'error' && (
            <div className='space-y-4'>
              <div className='p-4 bg-red-50 border border-red-200 rounded-lg'>
                <p className='text-sm text-red-700'>
                  {sendError || 'Transaction failed.'}
                </p>
              </div>
              <button
                onClick={handleSendConfirm}
                className='w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700'
              >
                Retry
              </button>
              <button
                onClick={resetSend}
                className='w-full py-2 text-gray-500 text-sm hover:text-gray-700'
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Activity */}
        <ActivityList transactions={activity} />

        {/* Navigation */}
        <div className='bg-white rounded-2xl shadow-xl p-4 flex items-center justify-between'>
          <a
            href='/settings'
            className='text-sm text-emerald-600 hover:text-emerald-700 font-medium'
          >
            Settings & Export Key
          </a>
          <button
            onClick={async () => {
              clearToken();
              await signOut();
              setAuthStep('phone');
              setEoaBalances(null);
              setSmartBalances(null);
              setActivity([]);
              setHasCheckedSession(false);
              resetSend();
            }}
            className='text-sm text-gray-500 hover:text-gray-700'
          >
            Sign out
          </button>
        </div>

        <div className='text-center text-xs text-gray-500 pb-4'>
          <p>Powered by Coinbase</p>
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
