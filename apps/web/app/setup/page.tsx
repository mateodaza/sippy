'use client';

import { useState, Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthenticateWithJWT, useCreateSpendPermission, useCurrentUser, useIsSignedIn, useSignOut, useSignInWithSms, useVerifySmsOTP, useGetAccessToken } from '@coinbase/cdp-hooks';
import { sendOtp, verifyOtp, storeToken, getStoredToken, clearToken, getFreshToken } from '../../lib/auth';
import { Language, getStoredLanguage, storeLanguage, detectLanguageFromPhone, fetchUserLanguage, resolveLanguage, localizeError, t } from '../../lib/i18n';
import { parseUnits } from 'viem';
import { SippyPhoneInput } from '../../components/ui/phone-input';
import { isBlockedPrefix, isNANP } from '@sippy/shared';
import { CDPProviderCustomAuth, CDPProviderNative } from '../providers/cdp-provider';

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

type Step = 'phone' | 'otp' | 'email' | 'tos' | 'permission' | 'done';
type AuthMode = 'twilio' | 'cdp-sms';

const TOS_VERSION = '1.0';
const TOS_URL = 'https://www.sippy.lat/terms';

function SetupContent({ authMode, phoneFromUrl: phoneFromUrlProp }: { authMode: AuthMode; phoneFromUrl: string }) {
  const router = useRouter();

  const phoneFromUrl = phoneFromUrlProp;

  // Redirect to settings if user already has a valid (non-expired) session
  useEffect(() => {
    if (!phoneFromUrl && getFreshToken()) {
      router.replace('/settings');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [step, setStep] = useState<Step>('phone');
  const [phoneNumber, setPhoneNumber] = useState(phoneFromUrl);
  const [otp, setOtp] = useState('');
  const [dailyLimit, setDailyLimit] = useState('100'); // Default $100/day
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true); // Start true to check on mount
  const [isPreparingWallet, setIsPreparingWallet] = useState(false); // Waiting for gas
  const [gasReady, setGasReady] = useState(false);
  const [hasCheckedSession, setHasCheckedSession] = useState(false); // Only check once on mount
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [tosChecked, setTosChecked] = useState(false);
  const [lang, setLang] = useState<Language>('en');

  // Keep html lang attribute in sync for screen readers
  useEffect(() => { document.documentElement.lang = lang }, [lang])

  // CDP Hooks — shared
  const { authenticateWithJWT } = useAuthenticateWithJWT();
  const { createSpendPermission, status: permissionStatus } = useCreateSpendPermission();
  const { currentUser } = useCurrentUser();
  const { isSignedIn } = useIsSignedIn();
  const { signOut } = useSignOut();

  // CDP SMS hooks (only used when authMode === 'cdp-sms')
  const { signInWithSms } = useSignInWithSms();
  const { verifySmsOTP } = useVerifySmsOTP();
  const { getAccessToken } = useGetAccessToken();
  const [cdpFlowId, setCdpFlowId] = useState<string | null>(null);

  // Flag: CDP SMS OTP verified, waiting for currentUser to populate with wallet
  const [awaitingCdpWallet, setAwaitingCdpWallet] = useState(false);

  // Security: Phone number must match what was sent in the WhatsApp link
  const isPhoneLocked = !!phoneFromUrl;

  // Check if CDP is configured
  const isCdpConfigured = !!CDP_PROJECT_ID;

  // Language init: phone prefix wins immediately, then API can override for returning users
  useEffect(() => {
    if (phoneFromUrl) {
      const detected = detectLanguageFromPhone(phoneFromUrl);
      storeLanguage(detected);
      setLang(detected);
    } else {
      const cached = getStoredLanguage();
      if (cached) setLang(cached);
    }

    // Only check API for language if no phone in URL (phone prefix is authoritative during setup)
    if (!phoneFromUrl) {
      const token = getStoredToken();
      resolveLanguage(null, token, BACKEND_URL)
        .then(resolved => { storeLanguage(resolved); setLang(resolved) })
        .catch(() => {})
    }
  }, [phoneFromUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Recovery: Check for existing session on mount (only once)
  useEffect(() => {
    const checkExistingSession = async () => {
      // Only run this check once on mount
      if (hasCheckedSession) return;

      // Wait for CDP to initialize
      if (isSignedIn === undefined) return;

      // Mark that we've checked
      setHasCheckedSession(true);

      // If not signed in, just show the phone step
      if (!isSignedIn || !currentUser) {
        console.log('No existing session, starting fresh');
        setIsCheckingSession(false);
        return;
      }

      console.log('Found existing CDP session, checking state...');

      try {
        // Get wallet address from current user
        const smartAccountAddress = currentUser.evmSmartAccounts?.[0] || currentUser.evmAccounts?.[0];
        if (!smartAccountAddress) {
          console.log('No wallet in session, starting fresh');
          clearToken();
          await signOut();
          setIsCheckingSession(false);
          return;
        }

        setWalletAddress(smartAccountAddress);
        console.log('Found wallet:', smartAccountAddress);

        // Check backend status
        if (BACKEND_URL) {
          const accessToken = getStoredToken();
          if (accessToken) {
            // First ensure wallet is registered (this also triggers refuel)
            const registerResponse = await fetch(`${BACKEND_URL}/api/register-wallet`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ walletAddress: smartAccountAddress }),
            });

            if (registerResponse.ok) {
              console.log('Wallet registered/confirmed in backend');
            } else {
              const errText = await registerResponse.text();
              console.error('Wallet registration failed on recovery:', errText);
              setError(lang === 'es' ? 'Error registrando la billetera. Intenta de nuevo.' :
                       lang === 'pt' ? 'Erro ao registrar a carteira. Tente novamente.' :
                       'Failed to register wallet. Please try again.');
              setIsCheckingSession(false);
              return;
            }

            // Check wallet status to determine which step to resume from
            const statusResponse = await fetch(`${BACKEND_URL}/api/wallet-status`, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
              },
            });

            if (statusResponse.ok) {
              const status = await statusResponse.json();
              console.log('Backend wallet status:', status);

              if (status.hasPermission) {
                // Already complete
                console.log('User already has permission, going to done');
                setStep('done');
              } else if (status.tosAccepted) {
                // ToS accepted, resume at permission step
                console.log('ToS accepted, resuming at permission step');
                setStep('permission');
              } else {
                // Wallet registered but ToS not accepted — resume at ToS step.
                // Email step is only shown in the initial fresh flow, not on recovery.
                console.log('Wallet registered but ToS not accepted, resuming at tos step');
                setStep('tos');
              }
            } else {
              // wallet-status returned non-OK — resume at tos step (safe default).
              console.log('Wallet status unavailable, resuming at tos step');
              setStep('tos');
            }
          }
        } else {
          // No backend, just go to tos step
          setStep('tos');
        }
      } catch (err) {
        console.error('Session recovery failed:', err);
        // On error, let user start fresh
        try {
          clearToken();
          await signOut();
        } catch (cleanupErr) {
          console.error('Session cleanup failed:', cleanupErr);
        }
      } finally {
        setIsCheckingSession(false);
      }
    };

    checkExistingSession();
  }, [isSignedIn, currentUser, hasCheckedSession]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ensure wallet has gas before allowing permission creation
  const ensureGasReady = async (): Promise<boolean> => {
    if (!BACKEND_URL) return true; // No backend, assume ready

    setIsPreparingWallet(true);
    setError(null);

    try {
      const accessToken = getStoredToken();
      if (!accessToken) {
        throw new Error('No access token');
      }

      console.log('Ensuring wallet has gas...');
      const response = await fetch(`${BACKEND_URL}/api/ensure-gas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to check gas status');
      }

      const result = await response.json();
      console.log('Gas status:', result);

      if (result.ready) {
        setGasReady(true);
        return true;
      } else {
        // Refuel failed - show the actual error
        console.error('Gas ensure failed:', result.error);
        setError(localizeError(result, 'fund-gas', lang));
        return false;
      }
    } catch (err) {
      console.error('Failed to ensure gas:', err);
      setError(t('setup.errPrepare', lang));
      return false;
    } finally {
      setIsPreparingWallet(false);
    }
  };

  // Step 1: Send SMS OTP
  const handleSendOtp = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // PhoneInput already provides E.164 format; normalize just in case
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      setPhoneNumber(formattedPhone);

      if (isBlockedPrefix(formattedPhone)) {
        setError(lang === 'es' ? 'Este país no está disponible.' :
                 lang === 'pt' ? 'Este país não está disponível.' :
                 'This country is not available.');
        return;
      }

      // Detect language from phone prefix before sending OTP so the UI switches immediately
      const phoneLang = detectLanguageFromPhone(formattedPhone);
      storeLanguage(phoneLang);
      setLang(phoneLang);

      if (authMode === 'cdp-sms') {
        // CDP native SMS — CDP sends the SMS directly
        const result = await signInWithSms({ phoneNumber: formattedPhone });
        setCdpFlowId(result.flowId);
      } else {
        // Twilio flow — backend sends SMS
        await sendOtp(formattedPhone);
      }

      setStep('otp');
    } catch (err) {
      console.error('Failed to send OTP:', err);
      setError(localizeError(err, 'otp-send', lang));
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (authMode === 'cdp-sms') {
        // CDP native SMS flow: verify OTP via CDP, then wait for wallet via useEffect
        if (!cdpFlowId) throw new Error('Missing CDP flow ID. Please restart.');

        await verifySmsOTP({ flowId: cdpFlowId, otp });

        // CDP has now authenticated the user and created a wallet.
        // Get CDP access token and exchange it for a Sippy JWT.
        const cdpAccessToken = await getAccessToken();
        if (!cdpAccessToken) {
          throw new Error('Failed to get CDP access token.');
        }

        const exchangeRes = await fetch(`${BACKEND_URL}/api/auth/exchange-cdp-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cdpAccessToken }),
        });

        if (!exchangeRes.ok) {
          const errBody = await exchangeRes.json().catch(() => ({}));
          // Distinguish auth failures from server errors
          if (exchangeRes.status === 401 || exchangeRes.status === 422) {
            throw new Error(errBody.error || 'Authentication failed. Please try again.');
          }
          throw new Error(errBody.error || 'Failed to exchange CDP token');
        }

        const { token } = await exchangeRes.json();
        storeToken(token);

        // Detect language
        const phoneLang = detectLanguageFromPhone(phoneNumber);
        storeLanguage(phoneLang);
        setLang(phoneLang);
        fetchUserLanguage(token, BACKEND_URL)
          .then(({ language }) => { storeLanguage(language); setLang(language) })
          .catch(() => {});

        // After verifySmsOTP, CDP SDK updates its internal state asynchronously.
        // React won't re-render mid-handler, so `currentUser` from the closure is stale.
        // Set a flag so a useEffect can pick up the wallet once currentUser updates.
        setAwaitingCdpWallet(true);
        // Keep isLoading true — the useEffect will clear it when the wallet arrives.
        return;
      }

      // Twilio flow: verify OTP via backend, get Sippy JWT directly
      const sippyJwt = await verifyOtp(phoneNumber, otp);
      storeToken(sippyJwt);

      // Detect and store language immediately from phone, then update from API
      const phoneLang = detectLanguageFromPhone(phoneNumber);
      storeLanguage(phoneLang);
      setLang(phoneLang);
      fetchUserLanguage(sippyJwt, BACKEND_URL)
        .then(({ language }) => { storeLanguage(language); setLang(language) })
        .catch(() => {});

      const { user } = await authenticateWithJWT();

      // Get the user's smart account address
      const smartAccountAddress = user?.evmSmartAccounts?.[0] || user?.evmAccounts?.[0];
      if (!smartAccountAddress) {
        throw new Error('No wallet found. Please try again.');
      }

      setWalletAddress(smartAccountAddress);

      // Register wallet with backend
      if (BACKEND_URL) {
        try {
          const accessToken = getStoredToken();
          if (accessToken) {
            const cdpToken = await getAccessToken();
            const response = await fetch(`${BACKEND_URL}/api/register-wallet`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ walletAddress: smartAccountAddress, cdpAccessToken: cdpToken }),
            });

            if (!response.ok) {
              const errText = await response.text();
              console.error('Wallet registration failed:', errText);
              setError(lang === 'es' ? 'Error registrando la billetera. Intenta de nuevo.' :
                       lang === 'pt' ? 'Erro ao registrar a carteira. Tente novamente.' :
                       'Failed to register wallet. Please try again.');
              return;
            }
          }
        } catch (regErr) {
          console.error('Backend registration error:', regErr);
          setError(lang === 'es' ? 'Error registrando la billetera. Intenta de nuevo.' :
                   lang === 'pt' ? 'Erro ao registrar a carteira. Tente novamente.' :
                   'Failed to register wallet. Please try again.');
          return;
        }
      }

      setStep('email');
    } catch (err) {
      console.error('OTP verification failed:', err);
      setError(localizeError(err, 'otp-verify', lang));
    } finally {
      // For CDP SMS flow with awaitingCdpWallet, keep isLoading true
      if (authMode !== 'cdp-sms') {
        setIsLoading(false);
      }
    }
  };

  // Effect: After CDP SMS OTP verification, wait for currentUser to populate with a wallet.
  // verifySmsOTP triggers an internal SDK state update; React re-renders with the new
  // currentUser on the next tick. This effect fires on that re-render.
  useEffect(() => {
    if (!awaitingCdpWallet) return;

    const smartAccountAddress = currentUser?.evmSmartAccounts?.[0] || currentUser?.evmAccounts?.[0];
    if (!smartAccountAddress) return; // Not yet populated, wait for next render

    // Wallet is available — continue the setup flow
    setAwaitingCdpWallet(false);
    setWalletAddress(smartAccountAddress);

    const registerAndContinue = async () => {
      try {
        if (BACKEND_URL) {
          const accessToken = getStoredToken();
          if (accessToken) {
            const cdpToken = await getAccessToken();
            const response = await fetch(`${BACKEND_URL}/api/register-wallet`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ walletAddress: smartAccountAddress, cdpAccessToken: cdpToken }),
            });

            if (!response.ok) {
              const errText = await response.text();
              console.error('Wallet registration failed:', errText);
              setError(lang === 'es' ? 'Error registrando la billetera. Intenta de nuevo.' :
                       lang === 'pt' ? 'Erro ao registrar a carteira. Tente novamente.' :
                       'Failed to register wallet. Please try again.');
              setIsLoading(false);
              return;
            }
          }
        }

        setStep('email');
      } catch (regErr) {
        console.error('Backend registration error:', regErr);
        setError(lang === 'es' ? 'Error registrando la billetera. Intenta de nuevo.' :
                 lang === 'pt' ? 'Erro ao registrar a carteira. Tente novamente.' :
                 'Failed to register wallet. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    registerAndContinue();
  }, [awaitingCdpWallet, currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 3a: Send email verification code
  const handleSendEmailCode = async () => {
    if (!email) return;
    setIsLoading(true);
    setError(null);
    try {
      const accessToken = getStoredToken();
      const response = await fetch(`${BACKEND_URL}/api/auth/send-email-code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        setEmailSent(true);
      } else {
        setError(localizeError(response, 'email-send', lang));
      }
    } catch (err) {
      setError(localizeError(err, 'email-send', lang));
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3b: Verify email code
  const handleVerifyEmailCode = async () => {
    if (!emailCode) return;
    setIsLoading(true);
    setError(null);
    try {
      const accessToken = getStoredToken();
      const response = await fetch(`${BACKEND_URL}/api/auth/verify-email-code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, code: emailCode }),
      });
      if (response.ok) {
        setEmailVerified(true);
        setTimeout(() => setStep('tos'), 1500);
      } else {
        setError(localizeError(response, 'email-verify', lang));
      }
    } catch (err) {
      setError(localizeError(err, 'email-verify', lang));
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3c: Skip email
  const handleSkipEmail = () => {
    setStep('tos');
  };

  // Step 4a: Accept ToS
  const handleAcceptTos = async () => {
    if (!tosChecked) {
      setError(t('setup.tosRequired', lang));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (BACKEND_URL) {
        const accessToken = getStoredToken();
        if (accessToken) {
          const response = await fetch(`${BACKEND_URL}/api/accept-tos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ version: TOS_VERSION }),
          });

          if (!response.ok) {
            throw new Error('Failed to record ToS acceptance');
          }
        }
      }

      setStep('permission');
    } catch (err) {
      console.error('ToS acceptance failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to accept Terms of Service');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 4: Create Spend Permission
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

      // First ensure wallet has gas (this will wait for refuel if needed)
      console.log('Checking gas availability...');
      const hasGas = await ensureGasReady();
      if (!hasGas) {
        throw new Error('Could not prepare wallet for transaction. Please try again.');
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
        const accessToken = getStoredToken();
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
          throw new Error(t('setup.errRegisterPermission', lang));
        }
      }

      setStep('done');
    } catch (err: unknown) {
      console.error('Permission creation failed:', err);

      // Check if it's a gas/balance error and provide helpful message
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.toLowerCase().includes('insufficient') ||
          errorMsg.toLowerCase().includes('balance') ||
          errorMsg.toLowerCase().includes('gas')) {
        setError(t('setup.errInsufficientEth', lang));
        // Trigger a re-registration to attempt refuel again
        if (BACKEND_URL && walletAddress) {
          try {
            const accessToken = getStoredToken();
            if (accessToken) {
              await fetch(`${BACKEND_URL}/api/register-wallet`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ walletAddress }),
              });
            }
          } catch (regErr) {
            console.error('Wallet re-registration failed:', regErr);
          }
        }
      } else {
        setError(
          err instanceof Error ? err.message : t('setup.errCreatePermission', lang)
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading while checking session
  if (isCheckingSession) {
    return (
      <div className='min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4'>
        <div className='max-w-md w-full bg-[var(--bg-primary)] panel-frame rounded-2xl p-8 text-center'>
          <div className='animate-pulse'>
            <div className='text-4xl mb-4'>🔍</div>
            <p className='text-[var(--text-secondary)]'>{t('setup.loading', lang)}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4'>
      <div className='max-w-md w-full bg-[var(--bg-primary)] panel-frame rounded-2xl p-8'>
        {/* Progress indicator */}
        <div className='flex justify-between mb-8'>
          {(['phone', 'otp', 'email', 'tos', 'permission', 'done'] as const).map((s, i) => (
            <div
              key={s}
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                step === s
                  ? 'bg-brand-primary text-white'
                  : (['phone', 'otp', 'email', 'tos', 'permission', 'done'] as const).indexOf(step) > i
                    ? 'bg-brand-primary-light text-brand-primary-hover'
                    : 'bg-[var(--border-default)] text-[var(--text-muted)]'
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Error display */}
        {error && (
          <div className='mb-4 p-3 bg-[var(--fill-danger-light)] border border-red-200 rounded-lg text-red-700 text-sm'>
            {error}
          </div>
        )}

        {/* Configuration warning */}
        {!isCdpConfigured && (
          <div className='mb-4 p-3 bg-[var(--fill-warning-light)] border border-yellow-200 rounded-lg text-yellow-800 text-sm'>
            <strong>{t('setup.configRequired', lang)}</strong> {t('setup.configInstruction', lang)}
          </div>
        )}

        {/* Step 1: Phone Number */}
        {step === 'phone' && (
          <div>
            <h1 className='font-display text-2xl font-bold uppercase mb-4 text-[var(--text-primary)]'>
              {t('setup.title', lang)}
            </h1>
            <p className='text-[var(--text-secondary)] mb-6'>
              {t('setup.subtitle', lang)}
            </p>
            <div className='mb-4'>
              <SippyPhoneInput
                value={phoneNumber}
                onChange={setPhoneNumber}
                locked={isPhoneLocked}
              />
            </div>
            {isPhoneLocked && (
              <p className='text-sm text-[var(--text-secondary)] mb-4'>
                {t('setup.phoneFromWhatsapp', lang)}
              </p>
            )}
            <button
              onClick={handleSendOtp}
              disabled={isLoading || !phoneNumber || phoneNumber.replace(/\D/g, '').length < 7 || !isCdpConfigured}
              className='w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {isLoading ? t('setup.sending', lang) : t('setup.sendCode', lang)}
            </button>
          </div>
        )}

        {/* Step 2: OTP Verification */}
        {step === 'otp' && (
          <div>
            <h1 className='font-display text-2xl font-bold uppercase mb-4 text-[var(--text-primary)]'>
              {t('setup.enterCode', lang)}
            </h1>
            <p className='text-[var(--text-secondary)] mb-6'>
              {t('setup.codeSentTo', lang)} {phoneNumber}
            </p>
            <input
              type='text'
              inputMode='numeric'
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder={t('setup.codePlaceholder', lang)}
              maxLength={6}
              className='w-full p-3 border rounded-lg mb-4 text-center text-2xl tracking-widest text-[var(--text-primary)]'
            />
            <button
              onClick={handleVerifyOtp}
              disabled={isLoading || otp.length !== 6}
              className='w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {isLoading ? t('setup.verifying', lang) : t('setup.verify', lang)}
            </button>
            <button
              onClick={() => setStep('phone')}
              className='w-full mt-2 text-[var(--text-secondary)] py-2'
            >
              {t('setup.back', lang)}
            </button>
          </div>
        )}

        {/* Step 3: Email (optional) */}
        {step === 'email' && (
          <div>
            <h1 className='font-display text-2xl font-bold uppercase mb-4 text-[var(--text-primary)]'>
              {t('setup.emailTitle', lang)}
            </h1>
            <p className='text-[var(--text-secondary)] mb-6'>
              {t('setup.emailSubtitle', lang)}
            </p>

            {!emailSent && (
              <>
                <input
                  type='email'
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('setup.emailPlaceholder', lang)}
                  className='w-full p-3 border rounded-lg mb-4 text-[var(--text-primary)]'
                />
                <button
                  onClick={handleSendEmailCode}
                  disabled={isLoading || !email}
                  className='w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  {isLoading ? t('setup.emailSending', lang) : t('setup.emailSendCode', lang)}
                </button>
              </>
            )}

            {emailSent && !emailVerified && (
              <>
                <p className='text-[var(--text-secondary)] mb-4'>{t('setup.emailCodeSentTo', lang)} {email}</p>
                <input
                  type='text'
                  inputMode='numeric'
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value)}
                  placeholder={t('setup.emailCodePlaceholder', lang)}
                  maxLength={6}
                  className='w-full p-3 border rounded-lg mb-4 text-center text-2xl tracking-widest text-[var(--text-primary)]'
                />
                <button
                  onClick={handleVerifyEmailCode}
                  disabled={isLoading || !emailCode}
                  className='w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  {isLoading ? t('setup.emailVerifying', lang) : t('setup.emailVerify', lang)}
                </button>
              </>
            )}

            {emailVerified && (
              <div className='text-center py-4'>
                <div className='text-4xl mb-2'>✅</div>
                <p className='text-semantic-success font-semibold'>{t('setup.emailVerified', lang)}</p>
                <p className='text-sm text-[var(--text-secondary)] mt-1'>{t('setup.continuingSetup', lang)}</p>
              </div>
            )}

            {!emailVerified && (
              <button
                onClick={handleSkipEmail}
                className='w-full mt-4 text-[var(--text-secondary)] py-2 text-sm'
              >
                {t('setup.skipEmail', lang)}
              </button>
            )}
          </div>
        )}

        {/* Step 4: Terms of Service */}
        {step === 'tos' && (
          <div>
            <h1 className='font-display text-2xl font-bold uppercase mb-4 text-[var(--text-primary)]'>
              {t('setup.tosTitle', lang)}
            </h1>
            <p className='text-[var(--text-secondary)] mb-6'>
              {t('setup.tosSubtitle', lang)}
            </p>

            <a
              href={TOS_URL}
              target='_blank'
              rel='noopener noreferrer'
              className='block w-full p-4 mb-4 bg-[var(--bg-secondary)] border border-brand-primary/20 rounded-lg text-brand-primary font-semibold hover:bg-brand-primary-light transition-smooth text-center'
            >
              {t('setup.tosLink', lang)} ↗
            </a>

            <label className='flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer mb-6 transition-colors border-brand-primary/20 hover:border-brand-primary'>
              <input
                type='checkbox'
                checked={tosChecked}
                onChange={(e) => { setTosChecked(e.target.checked); setError(null); }}
                className='mt-0.5 w-5 h-5 rounded border-brand-primary/30 text-brand-primary focus:ring-brand-primary'
              />
              <span className='text-[var(--text-primary)] text-sm'>{t('setup.tosCheckbox', lang)}</span>
            </label>

            <button
              onClick={handleAcceptTos}
              disabled={isLoading || !tosChecked}
              className='w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {isLoading ? '...' : t('setup.tosContinue', lang)}
            </button>
          </div>
        )}

        {/* Step 5: Spend Permission */}
        {step === 'permission' && (
          <div>
            <h1 className='font-display text-2xl font-bold uppercase mb-4 text-[var(--text-primary)]'>
              {t('setup.spendTitle', lang)}
            </h1>
            <p className='text-[var(--text-secondary)] mb-6'>
              {t('setup.spendSubtitle', lang)}
            </p>

            <div className='space-y-3 mb-6'>
              {['50', '100', '250', '500'].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setDailyLimit(amount)}
                  className={`w-full p-4 rounded-lg border-2 text-left ${
                    dailyLimit === amount
                      ? 'border-brand-primary bg-brand-primary-light'
                      : 'border-brand-primary/20 hover:border-[var(--border-strong)]'
                  }`}
                >
                  <span className='font-bold text-[var(--text-primary)]'>${amount}{t('setup.perDay', lang)}</span>
                  {amount === '100' && (
                    <span className='ml-2 text-sm text-brand-primary'>
                      {t('setup.recommended', lang)}
                    </span>
                  )}
                </button>
              ))}

              <div className='flex items-center gap-2 p-4 border-2 border-brand-primary/20 rounded-lg'>
                <span className='text-[var(--text-secondary)]'>{t('setup.customPrefix', lang)}</span>
                <input
                  type='number'
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  className='w-24 p-2 border rounded text-[var(--text-primary)]'
                />
                <span className='text-[var(--text-secondary)]'>{t('setup.perDay', lang)}</span>
              </div>
            </div>

            <div className='bg-[var(--fill-info-light)] p-4 rounded-lg mb-6 text-sm'>
              <p className='font-semibold text-blue-900'>{t('setup.whatThisMeans', lang)}</p>
              <ul className='mt-2 space-y-1 text-blue-800'>
                <li>{t('setup.spendExplain', lang).replace('{n}', dailyLimit)}</li>
                <li>{t('setup.limitResets', lang)}</li>
                <li>{t('setup.youOwnWallet', lang)}</li>
                <li>{t('setup.revokable', lang)}</li>
              </ul>
            </div>

            <button
              onClick={handleApprovePermission}
              disabled={isLoading || isPreparingWallet}
              className='w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {isPreparingWallet
                ? t('setup.preparingWallet', lang)
                : isLoading
                  ? t('setup.approving', lang)
                  : t('setup.approve', lang)}
            </button>

            {isPreparingWallet && (
              <p className='mt-2 text-sm text-[var(--text-secondary)] text-center animate-pulse'>
                {t('setup.fundingGas', lang)}
              </p>
            )}
          </div>
        )}

        {/* Step 5: Done */}
        {step === 'done' && (
          <div className='text-center'>
            <div className='text-6xl mb-4'>🎉</div>
            <h1 className='font-display text-2xl font-bold uppercase mb-4 text-[var(--text-primary)]'>
              {t('setup.allSet', lang)}
            </h1>
            <p className='text-[var(--text-secondary)] mb-6'>
              {t('setup.walletReady', lang)}
            </p>

            {walletAddress && (
              <div className='bg-[var(--bg-tertiary)] p-4 rounded-lg text-left text-sm mb-6'>
                <p className='font-semibold mb-2 text-[var(--text-primary)]'>{t('setup.yourWallet', lang)}</p>
                <p className='font-mono text-xs text-[var(--text-secondary)] break-all'>
                  {walletAddress}
                </p>
              </div>
            )}

            <div className='bg-[var(--bg-tertiary)] p-4 rounded-lg text-left text-sm'>
              <p className='font-semibold mb-2 text-[var(--text-primary)]'>
                {t('setup.tryCommands', lang)}
              </p>
              <ul className='space-y-1 font-mono text-[var(--text-secondary)]'>
                <li>• {t('setup.cmdBalance', lang)}</li>
                <li>• {t('setup.cmdSend', lang)}</li>
                <li>• {t('setup.cmdHistory', lang)}</li>
              </ul>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className='mt-8 text-center text-xs text-[var(--text-secondary)]'>
          <p>{t('setup.poweredBy', lang)}</p>
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

/**
 * Gate component for bare /setup (no phone in URL).
 * Renders a phone input first, then mounts the correct provider after submission.
 */
function PhoneEntryGate() {
  const [submittedPhone, setSubmittedPhone] = useState<string | null>(null);
  const router = useRouter();
  const [lang] = useState<Language>(() => getStoredLanguage() || 'en');

  // Redirect to settings if user already has a valid session
  useEffect(() => {
    if (getFreshToken()) {
      router.replace('/settings');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!submittedPhone) {
    return (
      <div className='min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4'>
        <div className='max-w-md w-full bg-[var(--bg-primary)] panel-frame rounded-2xl p-8'>
          <h1 className='font-display text-2xl font-bold uppercase mb-4 text-[var(--text-primary)]'>
            {t('setup.title', lang)}
          </h1>
          <p className='text-[var(--text-secondary)] mb-6'>
            {t('setup.subtitle', lang)}
          </p>
          <PhoneEntryForm onSubmit={setSubmittedPhone} lang={lang} />
        </div>
      </div>
    );
  }

  const authMode: AuthMode = isNANP(submittedPhone) ? 'cdp-sms' : 'twilio';
  const Provider = isNANP(submittedPhone) ? CDPProviderNative : CDPProviderCustomAuth;

  return (
    <Provider>
      <Suspense
        fallback={
          <div className='min-h-screen bg-[var(--bg-primary)] flex items-center justify-center'>
            <div className='text-[var(--text-secondary)]'>Loading...</div>
          </div>
        }
      >
        <SetupContent authMode={authMode} phoneFromUrl={submittedPhone} />
      </Suspense>
    </Provider>
  );
}

/**
 * Inline phone entry form used inside PhoneEntryGate.
 */
function PhoneEntryForm({ onSubmit, lang }: { onSubmit: (phone: string) => void; lang: Language }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const formatted = phone.startsWith('+') ? phone : `+${phone}`;
    if (isBlockedPrefix(formatted)) {
      setError(lang === 'es' ? 'Este país no está disponible.' :
               lang === 'pt' ? 'Este país não está disponível.' :
               'This country is not available.');
      return;
    }
    if (formatted.replace(/\D/g, '').length < 7) {
      setError(lang === 'es' ? 'Número inválido.' :
               lang === 'pt' ? 'Número inválido.' :
               'Invalid phone number.');
      return;
    }
    onSubmit(formatted);
  };

  return (
    <>
      {error && (
        <div className='mb-4 p-3 bg-[var(--fill-danger-light)] border border-red-200 rounded-lg text-red-700 text-sm'>
          {error}
        </div>
      )}
      <div className='mb-4'>
        <SippyPhoneInput
          value={phone}
          onChange={setPhone}
          locked={false}
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={!phone || phone.replace(/\D/g, '').length < 7}
        className='w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed'
      >
        {t('setup.sendCode', lang)}
      </button>
    </>
  );
}

function SetupPageInner() {
  const searchParams = useSearchParams();

  // Phone number from WhatsApp link
  const rawPhone = (searchParams.get('phone') || '').replace(/[^\d]/g, '');
  const phoneFromUrl = rawPhone ? `+${rawPhone}` : '';

  // No phone from URL → show phone entry gate (provider chosen after phone is known)
  if (!phoneFromUrl) {
    return <PhoneEntryGate />;
  }

  // Phone from URL → mount correct provider immediately
  const authMode: AuthMode = isNANP(phoneFromUrl) ? 'cdp-sms' : 'twilio';
  const Provider = isNANP(phoneFromUrl) ? CDPProviderNative : CDPProviderCustomAuth;

  return (
    <Provider>
      <SetupContent authMode={authMode} phoneFromUrl={phoneFromUrl} />
    </Provider>
  );
}

export default function SetupPage() {
  return (
    <Suspense
      fallback={
        <div className='min-h-screen bg-[var(--bg-primary)] flex items-center justify-center'>
          <div className='text-[var(--text-secondary)]'>Loading...</div>
        </div>
      }
    >
      <SetupPageInner />
    </Suspense>
  );
}
