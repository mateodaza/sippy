'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  useSignInWithSms,
  useVerifySmsOTP,
  useGetAccessToken,
  useCurrentUser,
  useIsSignedIn,
  useSignOut,
  useSendUserOperation,
} from '@coinbase/cdp-hooks';
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

function WalletContent() {
  const searchParams = useSearchParams();
  const phoneFromUrl = searchParams.get('phone') || '';

  // Auth state
  const [authStep, setAuthStep] = useState<AuthStep>('phone');
  const [phoneNumber, setPhoneNumber] = useState(phoneFromUrl);
  const [otp, setOtp] = useState('');
  const [flowId, setFlowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasCheckedSession, setHasCheckedSession] = useState(false);

  // Wallet state
  const [balances, setBalances] = useState<Balance | null>(null);
  const [activity, setActivity] = useState<NormalizedTransaction[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Send state
  const [sendStep, setSendStep] = useState<SendStep>('form');
  const [recipient, setRecipient] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendTxHash, setSendTxHash] = useState<string | null>(null);

  // CDP Hooks
  const { signInWithSms } = useSignInWithSms();
  const { verifySmsOTP } = useVerifySmsOTP();
  const { getAccessToken } = useGetAccessToken();
  const { currentUser } = useCurrentUser();
  const { isSignedIn } = useIsSignedIn();
  const { signOut } = useSignOut();
  const {
    sendUserOperation,
    status: sendOpStatus,
    data: sendOpData,
    error: sendOpError,
  } = useSendUserOperation();

  // Smart account address — NEVER fall back to evmAccounts for UserOps
  const smartAccountAddress =
    currentUser?.evmSmartAccountObjects?.[0]?.address ?? null;

  const isPhoneLocked = !!phoneFromUrl;
  const isCdpConfigured = !!CDP_PROJECT_ID;

  // ============================================================================
  // Data fetching
  // ============================================================================

  const fetchWalletData = useCallback(async () => {
    if (!smartAccountAddress) return;
    setIsLoadingData(true);
    try {
      const [bal, act] = await Promise.all([
        getBalances(smartAccountAddress),
        getActivity(smartAccountAddress, 10),
      ]);
      setBalances(bal);
      setActivity(act);
    } catch (err) {
      console.error('Failed to fetch wallet data:', err);
    } finally {
      setIsLoadingData(false);
    }
  }, [smartAccountAddress]);

  // Fetch data on auth and auto-refresh every 30s
  useEffect(() => {
    if (authStep !== 'authenticated' || !smartAccountAddress) return;
    fetchWalletData();
    const interval = setInterval(fetchWalletData, 30000);
    return () => clearInterval(interval);
  }, [authStep, smartAccountAddress, fetchWalletData]);

  // ============================================================================
  // Auth (same pattern as /settings)
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

      setAuthStep('authenticated');
      setIsCheckingSession(false);
    };

    checkExistingSession();
  }, [isSignedIn, currentUser, hasCheckedSession]);

  const handleSendOtp = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!isCdpConfigured)
        throw new Error('CDP not configured.');

      if (isSignedIn && currentUser) {
        setAuthStep('authenticated');
        return;
      }

      const formattedPhone = phoneNumber.startsWith('+')
        ? phoneNumber
        : `+${phoneNumber}`;
      const result = await signInWithSms({ phoneNumber: formattedPhone });
      setFlowId(result.flowId);
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
      if (!flowId)
        throw new Error('No flow ID. Please restart the process.');

      const { user } = await verifySmsOTP({ flowId, otp });
      const addr =
        user.evmSmartAccounts?.[0] || user.evmAccounts?.[0];
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

    // Validate amount
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setSendError('Enter a valid amount.');
      return;
    }
    if (balances && numAmount > parseFloat(balances.usdc)) {
      setSendError('Insufficient balance.');
      return;
    }

    // Validate and resolve recipient
    const trimmed = recipient.trim();
    if (isAddress(trimmed)) {
      setResolvedAddress(trimmed);
      setSendStep('confirm');
    } else if (isPhoneNumber(trimmed)) {
      // Resolve phone via authenticated endpoint
      try {
        const accessToken = await getAccessToken();
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
    if (!smartAccountAddress || !resolvedAddress) return;

    setSendError(null);
    setSendStep('sending');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken)
        throw new Error('Session expired. Please sign in again.');

      const gasReady = await ensureGasReady(BACKEND_URL, accessToken);
      if (!gasReady)
        throw new Error(
          'Unable to prepare transaction. Try again in a few minutes.'
        );

      const call = buildUsdcTransferCall(resolvedAddress, amount);
      await sendUserOperation({
        evmSmartAccount: smartAccountAddress as `0x${string}`,
        network: NETWORK as 'arbitrum',
        calls: [call],
      });
    } catch (err) {
      console.error('Send failed:', err);
      setSendError(
        err instanceof Error ? err.message : 'Transaction failed.'
      );
      setSendStep('error');
    }
  };

  // Watch send UserOp status
  useEffect(() => {
    if (sendOpStatus === 'success' && sendOpData) {
      const txHash = sendOpData.transactionHash ?? null;
      setSendTxHash(txHash);
      setSendStep('success');

      // Fire-and-forget audit log
      (async () => {
        try {
          const accessToken = await getAccessToken();
          if (!accessToken || !BACKEND_URL || !txHash || !resolvedAddress)
            return;
          await fetch(`${BACKEND_URL}/api/log-web-send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              toAddress: resolvedAddress,
              amount,
              txHash,
            }),
          });
        } catch {} // Fire-and-forget
      })();

      // Refresh data after send
      fetchWalletData();
    }
    if (sendOpStatus === 'error' && sendOpError) {
      setSendError(
        sendOpError instanceof Error
          ? sendOpError.message
          : 'Transaction failed.'
      );
      setSendStep('error');
    }
  }, [sendOpStatus, sendOpData, sendOpError]);

  const resetSend = () => {
    setSendStep('form');
    setRecipient('');
    setResolvedAddress(null);
    setAmount('');
    setSendError(null);
    setSendTxHash(null);
  };

  const handleMax = () => {
    if (balances) setAmount(balances.usdc);
  };

  // ============================================================================
  // Render
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

  // Auth screens
  if (authStep !== 'authenticated') {
    return (
      <div className='min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4'>
        <div className='max-w-md w-full bg-white rounded-2xl shadow-xl p-8'>
          <h1 className='text-2xl font-bold mb-6 text-gray-900'>
            Sippy Wallet
          </h1>
          <p className='text-gray-600 mb-6'>
            Verify your phone number to access your wallet.
          </p>

          {!isCdpConfigured && (
            <div className='mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm'>
              <strong>Configuration Required:</strong> Set
              NEXT_PUBLIC_CDP_PROJECT_ID in your environment.
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
                onChange={(e) =>
                  !isPhoneLocked && setPhoneNumber(e.target.value)
                }
                placeholder='+573001234567'
                disabled={isPhoneLocked}
                className={`w-full p-3 border rounded-lg mb-4 text-gray-900 ${
                  isPhoneLocked ? 'bg-gray-100 text-gray-600' : ''
                }`}
              />
              {isPhoneLocked && (
                <p className='text-sm text-gray-500 mb-4'>
                  Phone number from your WhatsApp link
                </p>
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

  // Authenticated wallet view
  return (
    <div className='min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 p-4'>
      <div className='max-w-md mx-auto space-y-4'>
        {/* Balance Card */}
        <div className='bg-white rounded-2xl shadow-xl p-6'>
          <div className='flex justify-between items-start mb-4'>
            <h1 className='text-xl font-bold text-gray-900'>Sippy Wallet</h1>
            <button
              onClick={fetchWalletData}
              disabled={isLoadingData}
              className='text-gray-400 hover:text-gray-600 p-1'
              title='Refresh'
            >
              <svg
                className={`w-5 h-5 ${isLoadingData ? 'animate-spin' : ''}`}
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                />
              </svg>
            </button>
          </div>

          {balances ? (
            <>
              <p className='text-4xl font-bold text-gray-900 mb-1'>
                ${parseFloat(balances.usdc).toFixed(2)}
              </p>
              <p className='text-sm text-gray-500'>USDC</p>
              {parseFloat(balances.eth) > 0 && (
                <p className='text-xs text-gray-400 mt-1'>
                  {parseFloat(balances.eth).toFixed(6)} ETH
                </p>
              )}
            </>
          ) : (
            <div className='animate-pulse'>
              <div className='h-10 bg-gray-200 rounded w-32 mb-2' />
              <div className='h-4 bg-gray-100 rounded w-16' />
            </div>
          )}

          {smartAccountAddress && (
            <div className='mt-4 pt-4 border-t'>
              <p className='text-xs text-gray-400'>
                {formatAddress(smartAccountAddress)}
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(smartAccountAddress)
                  }
                  className='ml-2 text-emerald-600 hover:text-emerald-700'
                >
                  Copy
                </button>
              </p>
            </div>
          )}
        </div>

        {/* Send Section */}
        <div className='bg-white rounded-2xl shadow-xl p-6'>
          <h2 className='text-lg font-semibold text-gray-900 mb-4'>Send</h2>

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
              {sendError && (
                <p className='text-sm text-red-600'>{sendError}</p>
              )}
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
              await signOut();
              setAuthStep('phone');
              setBalances(null);
              setActivity([]);
              setHasCheckedSession(false);
              resetSend();
            }}
            className='text-sm text-gray-500 hover:text-gray-700'
          >
            Sign out
          </button>
        </div>

        {/* Footer */}
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
