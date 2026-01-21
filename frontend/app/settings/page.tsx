'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSignInWithSms, useVerifySmsOTP, useGetAccessToken, useCreateSpendPermission, useRevokeSpendPermission, useListSpendPermissions, useCurrentUser, useIsSignedIn } from '@coinbase/cdp-hooks';
import { parseUnits } from 'viem';

/**
 * Settings Page for Embedded Wallets
 *
 * Uses CDP's SMS authentication flow to:
 * 1. View current spend permission details
 * 2. Revoke existing permission
 * 3. Create new permission with different limit
 *
 * Session persistence: Uses useCurrentUser and useIsSignedIn hooks
 * to automatically restore session if user is already authenticated.
 */

// Environment variables
const SIPPY_SPENDER_ADDRESS =
  process.env.NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS || '';
const NETWORK = process.env.NEXT_PUBLIC_SIPPY_NETWORK || 'arbitrum';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';
const CDP_PROJECT_ID = process.env.NEXT_PUBLIC_CDP_PROJECT_ID || '';

// USDC addresses by network (CDP SDK doesn't support 'usdc' shortcut on Arbitrum)
const USDC_ADDRESSES: Record<string, string> = {
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};
const USDC_ADDRESS = USDC_ADDRESSES[NETWORK] || USDC_ADDRESSES.arbitrum;

type AuthStep = 'phone' | 'otp' | 'authenticated';

interface WalletStatus {
  hasWallet: boolean;
  walletAddress?: string;
  hasPermission: boolean;
  dailyLimit?: number;
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const phoneFromUrl = searchParams.get('phone') || '';

  const [authStep, setAuthStep] = useState<AuthStep>('phone');
  const [phoneNumber, setPhoneNumber] = useState(phoneFromUrl);
  const [otp, setOtp] = useState('');
  const [flowId, setFlowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasCheckedSession, setHasCheckedSession] = useState(false);

  // Permission state
  const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);
  const [newLimit, setNewLimit] = useState('100');
  const [permissionStatus, setPermissionStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');

  // CDP Hooks
  const { signInWithSms } = useSignInWithSms();
  const { verifySmsOTP } = useVerifySmsOTP();
  const { getAccessToken } = useGetAccessToken();
  const { createSpendPermission } = useCreateSpendPermission();
  const { revokeSpendPermission } = useRevokeSpendPermission();
  const { refetch: refetchPermissions, data: permissionsData } = useListSpendPermissions({
    network: NETWORK as 'arbitrum',
  });
  const { currentUser } = useCurrentUser();
  const { isSignedIn } = useIsSignedIn();

  // Security: Phone number must match what was sent in the WhatsApp link
  const isPhoneLocked = !!phoneFromUrl;

  // Check if CDP is configured
  const isCdpConfigured = !!CDP_PROJECT_ID;

  // Session recovery: Check for existing session on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      // Only run once
      if (hasCheckedSession) return;

      // Wait for CDP to initialize
      if (isSignedIn === undefined) return;

      setHasCheckedSession(true);

      // If not signed in, show phone step
      if (!isSignedIn || !currentUser) {
        console.log('No existing session, showing login');
        setIsCheckingSession(false);
        return;
      }

      console.log('Found existing CDP session, restoring...');

      try {
        // Get wallet address from current user
        const smartAccountAddress = currentUser.evmSmartAccounts?.[0] || currentUser.evmAccounts?.[0];
        if (!smartAccountAddress) {
          console.log('No wallet in session');
          setIsCheckingSession(false);
          return;
        }

        setWalletAddress(smartAccountAddress);
        console.log('Restored wallet:', smartAccountAddress);

        // Fetch wallet status from backend
        if (BACKEND_URL) {
          const accessToken = await getAccessToken();
          if (accessToken) {
            const response = await fetch(`${BACKEND_URL}/api/wallet-status`, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
              },
            });

            if (response.ok) {
              const status = await response.json();
              setWalletStatus(status);
              if (status.dailyLimit) {
                setNewLimit(status.dailyLimit.toString());
              }
              console.log('Wallet status restored:', status);
            }
          }
        }

        // Session restored - go directly to authenticated view
        setAuthStep('authenticated');
      } catch (err) {
        console.error('Session recovery failed:', err);
      } finally {
        setIsCheckingSession(false);
      }
    };

    checkExistingSession();
  }, [isSignedIn, currentUser, hasCheckedSession, getAccessToken]);

  // Fetch wallet status from backend after authentication
  const fetchWalletStatus = async () => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken || !BACKEND_URL) return;

      const response = await fetch(`${BACKEND_URL}/api/wallet-status`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const status = await response.json();
        setWalletStatus(status);
        if (status.dailyLimit) {
          setNewLimit(status.dailyLimit.toString());
        }
      }
    } catch (err) {
      console.error('Failed to fetch wallet status:', err);
    }
  };

  // Step 1: Send SMS OTP
  const handleSendOtp = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!isCdpConfigured) {
        throw new Error('CDP not configured. Please set NEXT_PUBLIC_CDP_PROJECT_ID.');
      }

      // Phone number must be in E.164 format (e.g., +573001234567)
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

      console.log('Sending OTP to:', formattedPhone);
      const result = await signInWithSms({ phoneNumber: formattedPhone });

      setFlowId(result.flowId);
      setAuthStep('otp');
    } catch (err) {
      console.error('Failed to send OTP:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to send verification code'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!flowId) {
        throw new Error('No flow ID. Please restart the process.');
      }

      console.log('Verifying OTP...');
      const { user, isNewUser } = await verifySmsOTP({ flowId, otp });

      console.log('User authenticated:', user.userId);

      // Get the user's smart account address
      const smartAccountAddress = user.evmSmartAccounts?.[0] || user.evmAccounts?.[0];
      if (!smartAccountAddress) {
        throw new Error('No wallet found. Please set up your wallet first at sippy.lat/setup');
      }

      setWalletAddress(smartAccountAddress);
      setAuthStep('authenticated');

      // Fetch current wallet status
      await fetchWalletStatus();
    } catch (err) {
      console.error('OTP verification failed:', err);
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Revoke permission
  const handleRevoke = async () => {
    setPermissionStatus('loading');
    setError(null);

    try {
      if (!walletAddress) {
        throw new Error('Wallet address not found. Please refresh and try again.');
      }

      console.log('Finding spend permission to revoke...');

      // Refresh permissions list first
      await refetchPermissions();

      // Find the permission for Sippy's spender from the data
      const sippyPermission = permissionsData?.spendPermissions?.find(
        (p) =>
          p.permission?.spender?.toLowerCase() === SIPPY_SPENDER_ADDRESS.toLowerCase() &&
          !p.revoked
      );

      if (!sippyPermission) {
        throw new Error('No active Sippy permission found to revoke.');
      }

      console.log('Revoking spend permission:', sippyPermission.permissionHash);

      // Revoke using CDP SDK
      await revokeSpendPermission({
        network: NETWORK as 'arbitrum',
        permissionHash: sippyPermission.permissionHash,
        // CDP paymaster only works on Base
        ...(NETWORK === 'base' && { useCdpPaymaster: true }),
      });

      // Update backend - this MUST succeed to keep state in sync
      if (BACKEND_URL) {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error('Failed to get access token. Please try again.');
        }

        const response = await fetch(`${BACKEND_URL}/api/revoke-permission`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Failed to update backend after revoke:', errorText);
          throw new Error('Failed to sync revocation with backend. Please try again.');
        }
      }

      setWalletStatus((prev) => prev ? { ...prev, hasPermission: false, dailyLimit: undefined } : null);
      setPermissionStatus('success');
    } catch (err) {
      console.error('Revoke failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to revoke permission');
      setPermissionStatus('error');
    }
  };

  // Create/update permission with new limit
  const handleChangeLimit = async () => {
    setPermissionStatus('loading');
    setError(null);

    try {
      if (!SIPPY_SPENDER_ADDRESS) {
        throw new Error('Sippy spender address not configured.');
      }

      console.log('Creating new spend permission with limit:', newLimit);

      // Create new spend permission using CDP SDK
      const result = await createSpendPermission({
        network: NETWORK as 'arbitrum',
        spender: SIPPY_SPENDER_ADDRESS as `0x${string}`,
        token: USDC_ADDRESS as `0x${string}`,
        allowance: parseUnits(newLimit, 6), // USDC has 6 decimals
        periodInDays: 1, // Daily limit
        // CDP paymaster only works on Base - users on Arbitrum need ETH for gas
        ...(NETWORK === 'base' && { useCdpPaymaster: true }),
      });

      console.log('Spend permission created:', result);

      // Register permission with backend - this MUST succeed for transfers to work
      if (BACKEND_URL) {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error('Failed to get access token. Please try again.');
        }

        const response = await fetch(`${BACKEND_URL}/api/register-permission`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            dailyLimit: newLimit,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Failed to register permission with backend:', errorText);
          throw new Error('Failed to register permission. Please try again.');
        }

        // Use the backend response as source of truth (derives limit from onchain)
        const data = await response.json();
        const onchainLimit = data.dailyLimit ?? parseFloat(newLimit);
        setWalletStatus((prev) => prev ? { ...prev, hasPermission: true, dailyLimit: onchainLimit } : null);
        setNewLimit(onchainLimit.toString());
      } else {
        // No backend configured, use local value
        setWalletStatus((prev) => prev ? { ...prev, hasPermission: true, dailyLimit: parseFloat(newLimit) } : null);
      }

      setPermissionStatus('success');
    } catch (err) {
      console.error('Change limit failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to change limit');
      setPermissionStatus('error');
    }
  };

  // Enable permission (for users who revoked or don't have one)
  const handleEnablePermission = async () => {
    setNewLimit('100');
    await handleChangeLimit();
  };

  // Show loading while checking for existing session
  if (isCheckingSession) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4'>
        <div className='max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center'>
          <div className='animate-pulse'>
            <div className='text-4xl mb-4'>🔐</div>
            <p className='text-gray-600'>Checking your session...</p>
          </div>
        </div>
      </div>
    );
  }

  // Render auth flow if not authenticated
  if (authStep !== 'authenticated') {
    return (
      <div className='min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4'>
        <div className='max-w-md w-full bg-white rounded-2xl shadow-xl p-8'>
          <h1 className='text-2xl font-bold mb-6 text-gray-900'>
            Sippy Settings
          </h1>
          <p className='text-gray-600 mb-6'>
            Verify your phone number to access settings.
          </p>

          {/* Configuration warning */}
          {!isCdpConfigured && (
            <div className='mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm'>
              <strong>Configuration Required:</strong> Set NEXT_PUBLIC_CDP_PROJECT_ID in your environment.
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

  // Settings UI for authenticated users
  return (
    <div className='min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4'>
      <div className='max-w-md w-full bg-white rounded-2xl shadow-xl p-8'>
        <h1 className='text-2xl font-bold mb-6 text-gray-900'>
          Sippy Settings
        </h1>

        {error && (
          <div className='mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm'>
            {error}
          </div>
        )}

        {permissionStatus === 'success' && (
          <div className='mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm'>
            Settings updated successfully!
          </div>
        )}

        {/* Current permission status */}
        <div className='mb-6 p-4 bg-gray-50 rounded-lg'>
          <p className='text-sm text-gray-600'>Current daily limit</p>
          <p className='text-2xl font-bold text-gray-900'>
            {walletStatus?.hasPermission && walletStatus.dailyLimit
              ? `$${walletStatus.dailyLimit}/day`
              : 'No permission'}
          </p>
        </div>

        {/* Change limit */}
        {walletStatus?.hasPermission && (
          <div className='mb-6'>
            <label className='block text-sm font-medium mb-2 text-gray-700'>
              Change daily limit
            </label>
            <div className='space-y-3 mb-4'>
              {['50', '100', '250', '500'].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setNewLimit(amount)}
                  className={`w-full p-3 rounded-lg border-2 text-left ${
                    newLimit === amount
                      ? 'border-emerald-600 bg-emerald-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className='font-bold text-gray-900'>${amount}/day</span>
                  {amount === '100' && (
                    <span className='ml-2 text-sm text-emerald-600'>
                      (Recommended)
                    </span>
                  )}
                </button>
              ))}

              <div className='flex items-center gap-2 p-3 border-2 border-gray-200 rounded-lg'>
                <span className='text-gray-700'>Custom: $</span>
                <input
                  type='number'
                  value={newLimit}
                  onChange={(e) => setNewLimit(e.target.value)}
                  className='w-24 p-2 border rounded text-gray-900'
                />
                <span className='text-gray-700'>/day</span>
              </div>
            </div>

            <button
              onClick={handleChangeLimit}
              disabled={
                permissionStatus === 'loading' ||
                newLimit === walletStatus.dailyLimit?.toString()
              }
              className='w-full px-4 py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {permissionStatus === 'loading' ? 'Updating...' : 'Update Limit'}
            </button>
          </div>
        )}

        {/* Revoke permission */}
        {walletStatus?.hasPermission && (
          <div className='border-t pt-6'>
            <h2 className='text-lg font-semibold mb-2 text-red-600'>
              Disable Sippy Access
            </h2>
            <p className='text-sm text-gray-600 mb-4'>
              This will revoke Sippy&apos;s permission to send from your wallet.
              You can re-enable anytime.
            </p>
            <button
              onClick={handleRevoke}
              disabled={permissionStatus === 'loading'}
              className='w-full py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {permissionStatus === 'loading'
                ? 'Revoking...'
                : 'Revoke Permission'}
            </button>
          </div>
        )}

        {/* Re-enable permission */}
        {walletStatus && !walletStatus.hasPermission && (
          <div>
            <p className='text-gray-600 mb-4'>
              Sippy doesn&apos;t have permission to send from your wallet.
            </p>

            <div className='space-y-3 mb-4'>
              {['50', '100', '250', '500'].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setNewLimit(amount)}
                  className={`w-full p-3 rounded-lg border-2 text-left ${
                    newLimit === amount
                      ? 'border-emerald-600 bg-emerald-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className='font-bold text-gray-900'>${amount}/day</span>
                  {amount === '100' && (
                    <span className='ml-2 text-sm text-emerald-600'>
                      (Recommended)
                    </span>
                  )}
                </button>
              ))}
            </div>

            <button
              onClick={handleChangeLimit}
              disabled={permissionStatus === 'loading'}
              className='w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {permissionStatus === 'loading' ? 'Enabling...' : 'Enable Sippy'}
            </button>
          </div>
        )}

        {/* Wallet info */}
        {walletAddress && (
          <div className='mt-6 pt-6 border-t'>
            <p className='text-sm text-gray-600 mb-2'>Your wallet address:</p>
            <p className='font-mono text-xs text-gray-500 break-all'>
              {walletAddress}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className='mt-8 text-center text-xs text-gray-500'>
          <p>Powered by Coinbase</p>
          <p className='mt-1'>Network: {NETWORK}</p>
          {SIPPY_SPENDER_ADDRESS && (
            <p className='mt-1 font-mono text-[10px] truncate'>
              Spender: {SIPPY_SPENDER_ADDRESS}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className='min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center'>
          <div className='text-gray-600'>Loading...</div>
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
