'use client';

import { useState, Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSignInWithSms, useVerifySmsOTP, useGetAccessToken, useCreateSpendPermission } from '@coinbase/cdp-hooks';
import { parseUnits } from 'viem';

/**
 * Setup Page for Embedded Wallets
 *
 * Uses CDP's SMS authentication flow:
 * 1. User enters phone number
 * 2. CDP sends OTP via SMS
 * 3. User verifies OTP
 * 4. User creates spend permission
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

type Step = 'phone' | 'otp' | 'permission' | 'done';

function SetupContent() {
  const searchParams = useSearchParams();

  // Phone number from WhatsApp link - LOCKED (user cannot change)
  const phoneFromUrl = searchParams.get('phone') || '';

  const [step, setStep] = useState<Step>('phone');
  const [phoneNumber, setPhoneNumber] = useState(phoneFromUrl);
  const [otp, setOtp] = useState('');
  const [flowId, setFlowId] = useState<string | null>(null);
  const [dailyLimit, setDailyLimit] = useState('100'); // Default $100/day
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  // CDP Hooks
  const { signInWithSms } = useSignInWithSms();
  const { verifySmsOTP } = useVerifySmsOTP();
  const { getAccessToken } = useGetAccessToken();
  const { createSpendPermission, status: permissionStatus } = useCreateSpendPermission();

  // Security: Phone number must match what was sent in the WhatsApp link
  const isPhoneLocked = !!phoneFromUrl;

  // Check if CDP is configured
  const isCdpConfigured = !!CDP_PROJECT_ID;

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
      setStep('otp');
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
      console.log('Is new user:', isNewUser);

      // Get the user's smart account address
      // CDP embedded wallets use evmSmartAccounts, not evmAccounts
      const smartAccountAddress = user.evmSmartAccounts?.[0] || user.evmAccounts?.[0];
      if (!smartAccountAddress) {
        throw new Error('No wallet found. Please try again.');
      }

      setWalletAddress(smartAccountAddress);

      // Register wallet with backend
      if (BACKEND_URL) {
        try {
          const accessToken = await getAccessToken();
          if (accessToken) {
            const response = await fetch(`${BACKEND_URL}/api/register-wallet`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              },
            });

            if (!response.ok) {
              console.warn('Failed to register wallet with backend:', await response.text());
            }
          }
        } catch (regErr) {
          console.warn('Backend registration failed:', regErr);
        }
      }

      setStep('permission');
    } catch (err) {
      console.error('OTP verification failed:', err);
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Create Spend Permission
  const handleApprovePermission = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!walletAddress) {
        throw new Error('No wallet address. Please restart the process.');
      }

      if (!SIPPY_SPENDER_ADDRESS) {
        throw new Error('Sippy spender address not configured.');
      }

      console.log('Creating spend permission for:', {
        spender: SIPPY_SPENDER_ADDRESS,
        dailyLimit,
        network: NETWORK,
      });

      // Create spend permission using CDP SDK
      // This will prompt the user to sign the permission
      const result = await createSpendPermission({
        network: NETWORK as 'arbitrum',
        spender: SIPPY_SPENDER_ADDRESS as `0x${string}`,
        token: USDC_ADDRESS as `0x${string}`,
        allowance: parseUnits(dailyLimit, 6), // USDC has 6 decimals
        periodInDays: 1, // Daily limit
        // CDP paymaster only works on Base - users on Arbitrum need ETH for gas
        ...(NETWORK === 'base' && { useCdpPaymaster: true }),
      });

      console.log('Spend permission created:', result);

      // The userOpHash is NOT the permissionHash - we need to let the backend
      // fetch the actual permissionHash from CDP after the permission is created onchain
      console.log('Permission userOpHash:', result.userOperationHash);

      // Register permission with backend - this MUST succeed for transfers to work
      // Backend will verify and fetch the actual permissionHash from CDP
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
            dailyLimit,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Failed to register permission with backend:', errorText);
          throw new Error('Failed to register permission. Please try again.');
        }
      }

      setStep('done');
    } catch (err) {
      console.error('Permission creation failed:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to create permission'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4'>
      <div className='max-w-md w-full bg-white rounded-2xl shadow-xl p-8'>
        {/* Progress indicator */}
        <div className='flex justify-between mb-8'>
          {['phone', 'otp', 'permission', 'done'].map((s, i) => (
            <div
              key={s}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                step === s
                  ? 'bg-emerald-600 text-white'
                  : ['phone', 'otp', 'permission', 'done'].indexOf(step) > i
                    ? 'bg-emerald-200 text-emerald-800'
                    : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Error display */}
        {error && (
          <div className='mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm'>
            {error}
          </div>
        )}

        {/* Configuration warning */}
        {!isCdpConfigured && (
          <div className='mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm'>
            <strong>Configuration Required:</strong> Set NEXT_PUBLIC_CDP_PROJECT_ID in your environment.
          </div>
        )}

        {/* Step 1: Phone Number */}
        {step === 'phone' && (
          <div>
            <h1 className='text-2xl font-bold mb-4 text-gray-900'>
              Set Up Your Wallet
            </h1>
            <p className='text-gray-600 mb-6'>
              Enter your phone number to create your self-custodial wallet.
            </p>
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
          </div>
        )}

        {/* Step 2: OTP Verification */}
        {step === 'otp' && (
          <div>
            <h1 className='text-2xl font-bold mb-4 text-gray-900'>
              Enter Code
            </h1>
            <p className='text-gray-600 mb-6'>
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
              onClick={() => setStep('phone')}
              className='w-full mt-2 text-gray-500 py-2'
            >
              Back
            </button>
          </div>
        )}

        {/* Step 3: Spend Permission */}
        {step === 'permission' && (
          <div>
            <h1 className='text-2xl font-bold mb-4 text-gray-900'>
              Set Spending Limit
            </h1>
            <p className='text-gray-600 mb-6'>
              Choose how much Sippy can send per day on your behalf. You can
              change this anytime.
            </p>

            <div className='space-y-3 mb-6'>
              {['50', '100', '250', '500'].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setDailyLimit(amount)}
                  className={`w-full p-4 rounded-lg border-2 text-left ${
                    dailyLimit === amount
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

              <div className='flex items-center gap-2 p-4 border-2 border-gray-200 rounded-lg'>
                <span className='text-gray-700'>Custom: $</span>
                <input
                  type='number'
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  className='w-24 p-2 border rounded text-gray-900'
                />
                <span className='text-gray-700'>/day</span>
              </div>
            </div>

            <div className='bg-blue-50 p-4 rounded-lg mb-6 text-sm'>
              <p className='font-semibold text-blue-900'>What this means:</p>
              <ul className='mt-2 space-y-1 text-blue-800'>
                <li>Sippy can send up to ${dailyLimit} USDC per day</li>
                <li>Limit resets automatically every day - no re-setup needed</li>
                <li>You own your wallet and keys</li>
                <li>You can revoke or change this anytime</li>
              </ul>
            </div>

            <button
              onClick={handleApprovePermission}
              disabled={isLoading}
              className='w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {isLoading ? 'Approving...' : 'Approve & Continue'}
            </button>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 'done' && (
          <div className='text-center'>
            <div className='text-6xl mb-4'>🎉</div>
            <h1 className='text-2xl font-bold mb-4 text-gray-900'>
              You&apos;re All Set!
            </h1>
            <p className='text-gray-600 mb-6'>
              Your wallet is ready. Return to WhatsApp and start sending
              dollars!
            </p>

            {walletAddress && (
              <div className='bg-gray-100 p-4 rounded-lg text-left text-sm mb-6'>
                <p className='font-semibold mb-2 text-gray-900'>Your wallet:</p>
                <p className='font-mono text-xs text-gray-600 break-all'>
                  {walletAddress}
                </p>
              </div>
            )}

            <div className='bg-gray-100 p-4 rounded-lg text-left text-sm'>
              <p className='font-semibold mb-2 text-gray-900'>
                Try these commands:
              </p>
              <ul className='space-y-1 font-mono text-gray-700'>
                <li>• balance</li>
                <li>• send $5 to +573001234567</li>
                <li>• history</li>
              </ul>
            </div>
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

export default function SetupPage() {
  return (
    <Suspense
      fallback={
        <div className='min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center'>
          <div className='text-gray-600'>Loading...</div>
        </div>
      }
    >
      <SetupContent />
    </Suspense>
  );
}
