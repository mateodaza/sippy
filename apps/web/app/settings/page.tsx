'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthenticateWithJWT, useCreateSpendPermission, useRevokeSpendPermission, useListSpendPermissions, useCurrentUser, useIsSignedIn, useSignOut, useExportEvmAccount, useEvmAccounts, useSendUserOperation } from '@coinbase/cdp-hooks';
import { sendOtp, verifyOtp, storeToken, getStoredToken, clearToken } from '../../lib/auth';
import { parseUnits } from 'viem';
import { getBalances } from '../../lib/blockscout';
import { ensureGasReady, buildUsdcTransferCall } from '../../lib/usdc-transfer';
import { Language, getStoredLanguage, storeLanguage, detectLanguageFromPhone, fetchUserLanguage, resolveLanguage, localizeError, t } from '../../lib/i18n';

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

const DAILY_LIMIT_UNVERIFIED = 50   // must match backend EL-001 constant
const DAILY_LIMIT_VERIFIED   = 500

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
  phoneNumber?: string;
}

type ExportStep = 'idle' | 'warning' | 'sweep_offer' | 'sweeping' | 'export_active';

interface EmailStatus {
  hasEmail: boolean;
  verified: boolean;
  maskedEmail: string | null;
}

type EmailGateContext = 'export' | 'revoke' | null;
type EmailGateStep = 'idle' | 'warning_no_email' | 'code_entry' | 'code_sent';

type EmailSectionStep =
  | 'loading'
  | 'fetch_error'
  | 'no_email'
  | 'add_sent'
  | 'unverified'
  | 'verify_entry'
  | 'verified'
  | 'change_entry'
  | 'change_sent';

function SettingsContent() {
  const searchParams = useSearchParams();
  const phoneFromUrl = searchParams.get('phone') || '';

  const [authStep, setAuthStep] = useState<AuthStep>('phone');
  const [phoneNumber, setPhoneNumber] = useState(phoneFromUrl);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasCheckedSession, setHasCheckedSession] = useState(false);

  // Language state
  const [lang, setLang] = useState<Language>('en');

  // Permission state
  const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);
  const [newLimit, setNewLimit] = useState('100');
  const [permissionStatus, setPermissionStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');

  // Export state machine (wallet recovery)
  const [exportStep, setExportStep] = useState<ExportStep>('idle');
  const [exportUnlockedAt, setExportUnlockedAt] = useState<number | null>(null);
  const [exportAttemptId, setExportAttemptId] = useState<string | null>(null);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);
  const [exportCountdown, setExportCountdown] = useState(0);

  // Sweep state (transfer USDC from smart account → EOA before export)
  const [smartAccountBalance, setSmartAccountBalance] = useState<string | null>(null);
  const [sweepTxHash, setSweepTxHash] = useState<string | null>(null);
  const [sweepError, setSweepError] = useState<string | null>(null);

  // Email management state
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [emailSectionStep, setEmailSectionStep] = useState<EmailSectionStep>('loading');
  const [emailInput, setEmailInput] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Email gate state
  const [emailGateContext, setEmailGateContext] = useState<EmailGateContext>(null);
  const [emailGateStep, setEmailGateStep] = useState<EmailGateStep>('idle');
  const [emailGateCode, setEmailGateCode] = useState('');
  const [emailGateError, setEmailGateError] = useState<string | null>(null);
  const [emailGateLoading, setEmailGateLoading] = useState(false);
  const [emailGateToken, setEmailGateToken] = useState<string | null>(null);

  // CDP Hooks
  const { authenticateWithJWT } = useAuthenticateWithJWT();
  const { createSpendPermission } = useCreateSpendPermission();
  const { revokeSpendPermission } = useRevokeSpendPermission();
  const { refetch: refetchPermissions, data: permissionsData } = useListSpendPermissions({
    network: NETWORK as 'arbitrum',
  });
  const { currentUser } = useCurrentUser();
  const { isSignedIn } = useIsSignedIn();
  const { signOut } = useSignOut();
  const { sendUserOperation, status: sweepStatus, data: sweepData, error: sweepOpError } = useSendUserOperation();

  // Smart account address — NEVER fall back to evmAccounts for UserOps
  const smartAccountAddress = currentUser?.evmSmartAccountObjects?.[0]?.address ?? null;

  // Security: Phone number must match what was sent in the WhatsApp link
  const isPhoneLocked = !!phoneFromUrl;

  // Check if CDP is configured
  const isCdpConfigured = !!CDP_PROJECT_ID;

  // Language mount effect — two-phase: instant render from cache, then authoritative API update
  useEffect(() => {
    const cached = getStoredLanguage();
    if (cached) setLang(cached);

    const token = getStoredToken();
    resolveLanguage(phoneFromUrl || null, token, BACKEND_URL)
      .then(resolved => { if (resolved !== cached) setLang(resolved) })
      .catch(() => {});
  }, []);

  // Fetch email status from backend
  const fetchEmailStatus = async () => {
    const accessToken = getStoredToken();
    if (!accessToken || !BACKEND_URL) return;
    setEmailSectionStep('loading');
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/email-status`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        setEmailSectionStep('fetch_error');
        return;
      }
      const data: EmailStatus = await res.json();
      setEmailStatus(data);
      if (!data.hasEmail) setEmailSectionStep('no_email');
      else if (!data.verified) setEmailSectionStep('unverified');
      else setEmailSectionStep('verified');
    } catch {
      // On fetch failure, enter error state so gate buttons stay disabled
      // and the user can retry. Do NOT set emailStatus to a false-email
      // sentinel — that would route verified users into the bypass path.
      setEmailSectionStep('fetch_error');
    }
  };

  // Session recovery: Check for existing session on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      // Only run once
      if (hasCheckedSession) return;

      // Wait for CDP to initialize - isSignedIn starts as undefined
      if (isSignedIn === undefined) return;

      // If signed in, wait for currentUser to be populated before deciding
      // This prevents a race condition where isSignedIn=true but currentUser is still loading
      if (isSignedIn && !currentUser) {
        console.log('Signed in but waiting for currentUser to load...');
        return; // Don't set hasCheckedSession yet, wait for currentUser
      }

      // Now we can make a decision
      setHasCheckedSession(true);

      // If not signed in, show phone step
      if (!isSignedIn) {
        console.log('No existing session, showing login');
        setIsCheckingSession(false);
        return;
      }

      // At this point: isSignedIn=true AND currentUser is loaded
      console.log('Found existing CDP session, restoring...');

      try {
        // Get wallet address from current user
        const smartAccountAddress = currentUser!.evmSmartAccounts?.[0] || currentUser!.evmAccounts?.[0];
        if (!smartAccountAddress) {
          console.log('No wallet in session');
          setIsCheckingSession(false);
          return;
        }

        setWalletAddress(smartAccountAddress);
        console.log('Restored wallet:', smartAccountAddress);

        // Validate the stored JWT against the backend before restoring session.
        // An expired token returns 401; treat any non-ok response as invalid.
        if (BACKEND_URL) {
          const accessToken = getStoredToken();
          if (!accessToken) {
            clearToken();
            await signOut();
            setIsCheckingSession(false);
            return;
          }

          const response = await fetch(`${BACKEND_URL}/api/wallet-status`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });

          if (!response.ok) {
            // Token rejected by backend (expired or invalid) — force re-auth
            console.warn('Stored JWT rejected by backend, signing out');
            clearToken();
            await signOut();
            setIsCheckingSession(false);
            return;
          }

          const status = await response.json();
          setWalletStatus(status);
          if (status.dailyLimit) {
            setNewLimit(status.dailyLimit.toString());
          }
          if (status.phoneNumber) {
            setVerifiedPhone(status.phoneNumber);
          }
          console.log('Wallet status restored:', status);
          await fetchEmailStatus();
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
  }, [isSignedIn, currentUser, hasCheckedSession]);

  // Fetch wallet status from backend after authentication
  const fetchWalletStatus = async () => {
    try {
      const accessToken = getStoredToken();
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
        if (status.phoneNumber) {
          setVerifiedPhone(status.phoneNumber);
        }
      }
    } catch (err) {
      console.error('Failed to fetch wallet status:', err);
    }
  };

  // Send email verification code
  const handleSendEmailCode = async (email: string) => {
    setEmailLoading(true);
    setEmailError(null);
    try {
      const accessToken = getStoredToken();
      const res = await fetch(`${BACKEND_URL}/api/auth/send-email-code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setEmailInput(email);
        setEmailSectionStep((prev) =>
          prev === 'change_entry' ? 'change_sent' : 'add_sent'
        );
      } else {
        const err = await res.json().catch(() => ({}));
        setEmailError(localizeError(err, 'email-send', lang));
      }
    } catch {
      setEmailError(localizeError({}, 'email-send', lang));
    } finally {
      setEmailLoading(false);
    }
  };

  // Verify email code
  const handleVerifyEmailCode = async () => {
    if (!emailInput || !emailCode) return;
    setEmailLoading(true);
    setEmailError(null);
    try {
      const accessToken = getStoredToken();
      const res = await fetch(`${BACKEND_URL}/api/auth/verify-email-code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: emailInput, code: emailCode }),
      });
      if (res.ok) {
        setEmailCode('');
        setEmailInput('');
        await fetchEmailStatus();
      } else {
        const err = await res.json().catch(() => ({}));
        setEmailError(localizeError(err, 'email-verify', lang));
      }
    } catch {
      setEmailError(localizeError({}, 'email-verify', lang));
    } finally {
      setEmailLoading(false);
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
      setPhoneNumber(formattedPhone);

      console.log('Sending OTP to:', formattedPhone);
      await sendOtp(formattedPhone);
      setAuthStep('otp');
    } catch (err) {
      console.error('Failed to send OTP:', err);
      setError(localizeError(err instanceof Error ? err : {}, 'otp-send', lang));
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('Verifying OTP...');
      const token = await verifyOtp(phoneNumber, otp);
      storeToken(token);

      const phoneLang = detectLanguageFromPhone(phoneNumber);
      storeLanguage(phoneLang);
      setLang(phoneLang);
      fetchUserLanguage(token, BACKEND_URL)
        .then(({ language }) => { storeLanguage(language); setLang(language); })
        .catch(() => {});

      const { user } = await authenticateWithJWT();

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
      await fetchEmailStatus();
    } catch (err) {
      console.error('OTP verification failed:', err);
      setError(localizeError(err instanceof Error ? err : {}, 'otp-verify', lang));
    } finally {
      setIsLoading(false);
    }
  };

  // Revoke permission
  const handleRevoke = useCallback(async (gateToken?: string) => {
    setPermissionStatus('loading');
    setError(null);

    try {
      if (!walletAddress) {
        throw new Error('Wallet address not found. Please refresh and try again.');
      }

      // FAIL CLOSED: if this user has a verified email, a gate token is required.
      // Do not proceed to CDP or DB without one. This guards against any code path
      // that calls handleRevoke(undefined) for a verified-email user.
      if (emailStatus?.verified === true && !gateToken) {
        throw new Error(t('settings.errGateRequired', lang));
      }

      // STEP 1: Onchain revoke via CDP SDK.
      console.log('Finding spend permission to revoke...');
      // refetch() returns void on CDP hooks, so we trigger it for side-effect
      // then read from permissionsData (already current after the await).
      await refetchPermissions();

      const sippyPermission = permissionsData?.spendPermissions?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) =>
          p.permission?.spender?.toLowerCase() === SIPPY_SPENDER_ADDRESS.toLowerCase() &&
          !p.revoked
      );

      if (!sippyPermission) {
        throw new Error('No active Sippy permission found to revoke.');
      }

      console.log('Revoking spend permission:', sippyPermission.permissionHash);

      await revokeSpendPermission({
        network: NETWORK as 'arbitrum',
        permissionHash: sippyPermission.permissionHash,
        ...(NETWORK === 'base' && { useCdpPaymaster: true }),
      });

      // STEP 2: Sync DB — only reached if onchain revoke succeeded.
      // Backend enforces gate token for verified-email users.
      if (BACKEND_URL) {
        const accessToken = getStoredToken();
        if (!accessToken) {
          throw new Error('Failed to get access token. Please try again.');
        }
        const revokeRes = await fetch(`${BACKEND_URL}/api/revoke-permission`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify(gateToken ? { gateToken } : {}),
        });
        if (!revokeRes.ok) {
          const data = await revokeRes.json().catch(() => ({}));
          if ((data as { error?: string }).error === 'gate_required') {
            throw new Error(t('settings.errGateRequired', lang));
          }
          console.error('Failed to update backend after revoke:', data);
          throw new Error(localizeError(data, 'revoke-permission', lang));
        }
      }

      setWalletStatus((prev) => prev ? { ...prev, hasPermission: false, dailyLimit: undefined } : null);
      setPermissionStatus('success');
    } catch (err) {
      console.error('Revoke failed:', err);
      setError(err instanceof Error ? err.message : localizeError(err, 'revoke-permission', lang));
      setPermissionStatus('error');
    }
  }, [walletAddress, emailStatus, permissionsData, refetchPermissions, revokeSpendPermission, lang]);

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
            dailyLimit: newLimit,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Failed to register permission with backend:', errorText);
          throw new Error(localizeError({ message: errorText }, 'enable-permission', lang));
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
      setError(err instanceof Error ? err.message : localizeError(err, 'enable-permission', lang));
      setPermissionStatus('error');
    }
  };

  // Enable permission (for users who revoked or don't have one)
  const handleEnablePermission = async () => {
    setNewLimit('100');
    await handleChangeLimit();
  };

  // ============================================================================
  // Wallet Export (Recovery Feature)
  // ============================================================================

  const { evmAccounts } = useEvmAccounts();
  const eoaAddress = evmAccounts?.[0]?.address ?? null;
  const { exportEvmAccount } = useExportEvmAccount();
  const [exportedKey, setExportedKey] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Fire-and-forget audit logging
  const logExportEventFn = async (event: string, attemptIdOverride?: string) => {
    const id = attemptIdOverride ?? exportAttemptId;
    if (!id) return;
    try {
      const accessToken = getStoredToken();
      if (!accessToken || !BACKEND_URL) return;
      await fetch(`${BACKEND_URL}/api/log-export-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ event, attemptId: id }),
      });
    } catch {} // Fire-and-forget
  };

  const resetExport = useCallback((reason: 'completed' | 'expired' | 'cancelled') => {
    logExportEventFn(reason);
    setExportStep('idle');
    setExportUnlockedAt(null);
    setHasCopied(false);
    setExportAttemptId(null);
    setExportedKey(null);
    setExportError(null);
    setSmartAccountBalance(null);
    setSweepTxHash(null);
    setSweepError(null);
  }, []);

  // Start export flow
  const handleExportStart = () => {
    const attemptId = crypto.randomUUID();
    setExportAttemptId(attemptId);
    setSweepError(null);
    setSweepTxHash(null);
    setSmartAccountBalance(null);
    setExportStep('warning');
    logExportEventFn('initiated', attemptId);
  };

  // After warning acknowledged — check balance and offer sweep
  const handleWarningContinue = async () => {
    if (!smartAccountAddress) {
      // No smart account → skip sweep, go straight to export
      await handleExportContinue();
      return;
    }

    try {
      const balances = await getBalances(smartAccountAddress);
      const balance = balances.usdc; // Already formatted string (e.g. "10.5")

      // If balance < $0.01, auto-skip sweep
      if (parseFloat(balance) < 0.01) {
        await handleExportContinue();
        return;
      }

      setSmartAccountBalance(balance);
      setExportStep('sweep_offer');
    } catch (err) {
      console.error('Failed to fetch balance for sweep:', err);
      // On failure, still let user proceed to export
      await handleExportContinue();
    }
  };

  // Execute sweep: transfer all USDC from smart account → EOA
  const handleSweep = async () => {
    if (!smartAccountAddress || !eoaAddress || !smartAccountBalance) return;

    setSweepError(null);
    setExportStep('sweeping');

    try {
      // Step 1: Ensure gas
      const accessToken = getStoredToken();
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const gasReady = await ensureGasReady(BACKEND_URL, accessToken);
      if (!gasReady) throw new Error('Unable to prepare transaction. Try again in a few minutes.');

      // Step 2: Build and send UserOperation
      const call = buildUsdcTransferCall(eoaAddress, smartAccountBalance);
      await sendUserOperation({
        evmSmartAccount: smartAccountAddress as `0x${string}`,
        network: NETWORK as 'arbitrum',
        calls: [call],
      });
    } catch (err) {
      console.error('Sweep failed:', err);
      setSweepError(localizeError(err instanceof Error ? err : {}, 'sweep', lang));
    }
  };

  // ── Email gate helpers ─────────────────────────────────────────────────────

  const resetEmailGate = useCallback(() => {
    setEmailGateContext(null);
    setEmailGateStep('idle');
    setEmailGateCode('');
    setEmailGateError(null);
    setEmailGateLoading(false);
    setEmailGateToken(null);
  }, []);

  const proceedWithGatedOperation = useCallback(async (gateToken?: string) => {
    const ctx = emailGateContext;

    if (ctx === 'export') {
      // Backend enforcement: for verified-email users, validate and consume the gate
      // token on the server before starting the export. This prevents client-side-only
      // enforcement — an API-level attacker cannot bypass this without a valid token.
      if (emailStatus?.verified === true) {
        if (!gateToken) {
          setEmailGateError(t('settings.errGateRequired', lang));
          return;
        }
        try {
          const accessToken = getStoredToken();
          const res = await fetch(`${BACKEND_URL}/api/auth/validate-export-gate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ gateToken }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setEmailGateError(localizeError(data, 'export-gate-verify', lang));
            return;
          }
        } catch {
          setEmailGateError(localizeError({}, 'export-gate-verify', lang));
          return;
        }
      }
      resetEmailGate();
      handleExportStart();
    } else if (ctx === 'revoke') {
      resetEmailGate();
      handleRevoke(gateToken);
    }
  }, [emailGateContext, emailStatus, resetEmailGate, handleExportStart, handleRevoke, lang]);

  const handleEmailGateSendCode = useCallback(async () => {
    setEmailGateLoading(true);
    setEmailGateError(null);
    try {
      const token = getStoredToken();
      const res = await fetch(`${BACKEND_URL}/api/auth/send-gate-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailGateError((data as { error?: string; message?: string }).error === 'no_verified_email'
          ? t('settings.errNoVerifiedEmail', lang)
          : localizeError(data, 'export-gate-send', lang));
      } else {
        setEmailGateStep('code_sent');
      }
    } catch {
      setEmailGateError(localizeError({}, 'export-gate-send', lang));
    } finally {
      setEmailGateLoading(false);
    }
  }, [lang]);

  const handleEmailGateVerify = useCallback(async () => {
    setEmailGateLoading(true);
    setEmailGateError(null);
    try {
      const token = getStoredToken();
      const res = await fetch(`${BACKEND_URL}/api/auth/verify-gate-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: emailGateCode }),
      });
      const data = await res.json() as { success?: boolean; gateToken?: unknown; error?: string; message?: string };
      if (!res.ok || !data.success) {
        setEmailGateError(data.error === 'invalid_or_expired_code'
          ? t('settings.errInvalidCode', lang)
          : localizeError(data, 'export-gate-verify', lang));
      } else if (!data.gateToken || typeof data.gateToken !== 'string') {
        // Fail closed: success=true but no usable token is an error condition.
        // Never call proceedWithGatedOperation without a valid token.
        setEmailGateError(localizeError({}, 'export-gate-verify', lang));
      } else {
        proceedWithGatedOperation(data.gateToken);
      }
    } catch {
      setEmailGateError(localizeError({}, 'export-gate-verify', lang));
    } finally {
      setEmailGateLoading(false);
    }
  }, [emailGateCode, proceedWithGatedOperation, lang]);

  // Watch sweep status changes
  useEffect(() => {
    if (sweepStatus === 'success' && sweepData) {
      setSweepTxHash(sweepData.transactionHash ?? null);
      logExportEventFn('swept');
      // Auto-proceed to export after successful sweep
      handleExportContinue();
    }
    if (sweepStatus === 'error' && sweepOpError) {
      setSweepError(localizeError(sweepOpError instanceof Error ? sweepOpError : {}, 'sweep', lang));
      setExportStep('sweeping'); // Stay on sweeping to show error + retry/skip
    }
  }, [sweepStatus, sweepData, sweepOpError]);

  // Activate export — fetch key programmatically
  const handleExportContinue = async () => {
    if (!eoaAddress) {
      setExportError('No account address available.');
      return;
    }
    setIsExporting(true);
    setExportError(null);
    try {
      const { privateKey } = await exportEvmAccount({ evmAccount: eoaAddress as `0x${string}` });
      setExportedKey(privateKey);
      setExportStep('export_active');
      setExportUnlockedAt(Date.now());
      logExportEventFn('unlocked');
      logExportEventFn('iframe_ready'); // Reuse event for "key ready"
    } catch (err) {
      setExportError(localizeError(err instanceof Error ? err : {}, 'export', lang));
    } finally {
      setIsExporting(false);
    }
  };

  // 5-minute expiry timer
  useEffect(() => {
    if (!exportUnlockedAt) return;
    const remaining = 5 * 60 * 1000 - (Date.now() - exportUnlockedAt);
    if (remaining <= 0) { resetExport('expired'); return; }
    const timer = setTimeout(() => resetExport('expired'), remaining);
    return () => clearTimeout(timer);
  }, [exportUnlockedAt]);

  // Countdown display
  useEffect(() => {
    if (!exportUnlockedAt) { setExportCountdown(0); return; }
    const tick = () => {
      const remaining = Math.max(0, 5 * 60 - Math.floor((Date.now() - exportUnlockedAt) / 1000));
      setExportCountdown(remaining);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [exportUnlockedAt]);

  // Copy key to clipboard
  const handleCopyKey = async () => {
    if (!exportedKey) return;
    try {
      await navigator.clipboard.writeText(exportedKey);
      setHasCopied(true);
      logExportEventFn('copied');
    } catch {
      // Fallback for mobile browsers that block clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = exportedKey;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setHasCopied(true);
      logExportEventFn('copied');
    }
  };

  // Show loading while checking for existing session
  if (isCheckingSession) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4'>
        <div className='max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center'>
          <div className='animate-pulse'>
            <div className='text-4xl mb-4'>🔐</div>
            <p className='text-gray-600'>{t('settings.loading', lang)}</p>
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
          <h1 className='text-2xl font-bold mb-2 text-gray-900'>
            {t('settings.authTitle', lang)}
          </h1>
          <p className='text-gray-600 mb-6'>
            {t('settings.authSubtitle', lang)}
          </p>

          {/* Configuration warning */}
          {!isCdpConfigured && (
            <div className='mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm'>
              <strong>{t('settings.configRequired', lang)}</strong> {t('settings.configInstruction', lang)}
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
                placeholder={t('settings.phonePlaceholder', lang)}
                disabled={isPhoneLocked}
                className={`w-full p-3 border rounded-lg mb-4 text-gray-900 ${
                  isPhoneLocked ? 'bg-gray-100 text-gray-600' : ''
                }`}
              />
              {isPhoneLocked && (
                <p className='text-sm text-gray-500 mb-4'>
                  {t('settings.phoneFromWhatsapp', lang)}
                </p>
              )}
              <button
                onClick={handleSendOtp}
                disabled={isLoading || !phoneNumber || !isCdpConfigured}
                className='w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {isLoading ? t('settings.sending', lang) : t('settings.sendCode', lang)}
              </button>
            </>
          )}

          {authStep === 'otp' && (
            <>
              <p className='text-gray-600 mb-4'>
                {t('settings.codeSentTo', lang)} {phoneNumber}
              </p>
              <input
                type='text'
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder={t('settings.codePlaceholder', lang)}
                maxLength={6}
                className='w-full p-3 border rounded-lg mb-4 text-center text-2xl tracking-widest text-gray-900'
              />
              <button
                onClick={handleVerifyOtp}
                disabled={isLoading || otp.length !== 6}
                className='w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {isLoading ? t('settings.verifying', lang) : t('settings.verify', lang)}
              </button>
              <button
                onClick={() => setAuthStep('phone')}
                className='w-full mt-2 text-gray-500 py-2'
              >
                {t('settings.back', lang)}
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
          {t('settings.title', lang)}
        </h1>

        {error && (
          <div className='mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm'>
            {error}
          </div>
        )}

        {permissionStatus === 'success' && (
          <div className='mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm'>
            {t('settings.updateSuccess', lang)}
          </div>
        )}

        {/* Daily transfer limit */}
        <div className='mb-6 p-4 bg-gray-50 rounded-lg'>
          <p className='text-sm text-gray-600'>{t('settings.dailyLimit', lang)}</p>
          {emailSectionStep === 'loading' && (
            <p className='text-2xl font-bold text-gray-400'>— {t('settings.perDay', lang)}</p>
          )}
          {emailSectionStep === 'fetch_error' && (
            <>
              <p className='text-2xl font-bold text-gray-400'>— {t('settings.perDay', lang)}</p>
              <p className='text-xs text-gray-400 mt-1'>{t('settings.limitLoadError', lang)}</p>
            </>
          )}
          {(emailSectionStep === 'verified' || emailSectionStep === 'change_entry' || emailSectionStep === 'change_sent') && (
            <>
              <p className='text-2xl font-bold text-gray-900'>${DAILY_LIMIT_VERIFIED}{t('settings.perDay', lang)}</p>
              <p className='text-xs text-green-600 mt-1'>✓ {t('settings.emailVerified', lang)}</p>
            </>
          )}
          {emailSectionStep === 'unverified' && (
            <>
              <p className='text-2xl font-bold text-gray-900'>${DAILY_LIMIT_UNVERIFIED}{t('settings.perDay', lang)}</p>
              <div className='mt-3 border border-amber-400 bg-amber-50 rounded-lg p-3'>
                <p className='text-sm text-amber-800 mb-2'>{t('settings.verifyEmailCta', lang)}</p>
                <button
                  onClick={() => { const el = document.getElementById('recovery-email'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth' }) }}
                  className='text-sm text-amber-700 underline'
                >
                  {t('settings.unlockLimit', lang)}
                </button>
              </div>
            </>
          )}
          {(emailSectionStep === 'no_email' || emailSectionStep === 'add_sent' || emailSectionStep === 'verify_entry') && (
            <>
              <p className='text-2xl font-bold text-gray-900'>${DAILY_LIMIT_UNVERIFIED}{t('settings.perDay', lang)}</p>
              <div className='mt-3 border border-amber-400 bg-amber-50 rounded-lg p-3'>
                <p className='text-sm text-amber-800 mb-2'>{t('settings.verifyEmailCta', lang)}</p>
                <button
                  onClick={() => { const el = document.getElementById('recovery-email'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth' }) }}
                  className='text-sm text-amber-700 underline'
                >
                  {t('settings.unlockLimit', lang)}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Current permission status */}
        <div className='mb-6 p-4 bg-gray-50 rounded-lg'>
          <p className='text-sm text-gray-600'>{t('settings.currentLimit', lang)}</p>
          <p className='text-2xl font-bold text-gray-900'>
            {walletStatus?.hasPermission && walletStatus.dailyLimit
              ? `$${walletStatus.dailyLimit}${t('settings.perDay', lang)}`
              : t('settings.noPermission', lang)}
          </p>
        </div>

        {/* Change limit */}
        {walletStatus?.hasPermission && (
          <div className='mb-6'>
            <label className='block text-sm font-medium mb-2 text-gray-700'>
              {t('settings.changeLimitLabel', lang)}
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
                  <span className='font-bold text-gray-900'>${amount}{t('settings.perDay', lang)}</span>
                  {amount === '100' && (
                    <span className='ml-2 text-sm text-emerald-600'>
                      {t('settings.recommended', lang)}
                    </span>
                  )}
                </button>
              ))}

              <div className='flex items-center gap-2 p-3 border-2 border-gray-200 rounded-lg'>
                <span className='text-gray-700'>{t('settings.customPrefix', lang)}</span>
                <input
                  type='number'
                  value={newLimit}
                  onChange={(e) => setNewLimit(e.target.value)}
                  className='w-24 p-2 border rounded text-gray-900'
                />
                <span className='text-gray-700'>{t('settings.perDay', lang)}</span>
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
              {permissionStatus === 'loading' ? t('settings.updating', lang) : t('settings.updateLimit', lang)}
            </button>
          </div>
        )}

        {/* Revoke permission */}
        {walletStatus?.hasPermission && (
          <div className='border-t pt-6'>
            <h2 className='text-lg font-semibold mb-2 text-red-600'>
              {t('settings.disableTitle', lang)}
            </h2>
            <p className='text-sm text-gray-600 mb-4'>
              {t('settings.disableDesc', lang)}
            </p>
            {!(emailGateContext === 'revoke' && emailGateStep !== 'idle') && (
              <button
                onClick={() => {
                  if (emailSectionStep === 'loading' || emailSectionStep === 'fetch_error') return;
                  if (emailStatus?.verified) {
                    setEmailGateContext('revoke');
                    setEmailGateStep('code_entry');
                  } else {
                    setEmailGateContext('revoke');
                    setEmailGateStep('warning_no_email');
                  }
                }}
                disabled={permissionStatus === 'loading' || emailSectionStep === 'loading' || emailSectionStep === 'fetch_error'}
                className='w-full py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {permissionStatus === 'loading'
                  ? t('settings.revoking', lang)
                  : t('settings.revokePermission', lang)}
              </button>
            )}
            {emailGateStep === 'warning_no_email' && emailGateContext === 'revoke' && (
              <div className='rounded border border-yellow-400 bg-yellow-50 p-3 text-sm text-yellow-800'>
                <p className='mb-2'>
                  ⚠️ {t('settings.emailWarning', lang)}
                </p>
                <div className='flex gap-2'>
                  <button className='w-full py-2 text-gray-500 text-sm hover:text-gray-700' onClick={resetEmailGate}>{t('settings.cancel', lang)}</button>
                  <button className='w-full py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700' onClick={() => proceedWithGatedOperation()}>{t('settings.continueAnyway', lang)}</button>
                </div>
              </div>
            )}
            {emailGateStep === 'code_entry' && emailGateContext === 'revoke' && (
              <div className='space-y-2'>
                <p className='text-sm'>
                  {t('settings.verifyIdentity', lang)}
                  {emailStatus?.maskedEmail && (
                    <span className='ml-1 text-gray-500'>({emailStatus.maskedEmail})</span>
                  )}
                </p>
                <button
                  className='w-full py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed'
                  onClick={handleEmailGateSendCode}
                  disabled={emailGateLoading}
                >
                  {emailGateLoading ? t('settings.emailSending', lang) : t('settings.emailSendCode', lang)}
                </button>
                {emailGateError && <p className='text-sm text-red-600'>{emailGateError}</p>}
                <button className='w-full py-2 text-gray-500 text-sm hover:text-gray-700' onClick={resetEmailGate}>{t('settings.cancel', lang)}</button>
              </div>
            )}
            {emailGateStep === 'code_sent' && emailGateContext === 'revoke' && (
              <div className='space-y-2'>
                <p className='text-sm'>{t('settings.emailCodeInstruction', lang)}</p>
                <input
                  type='text'
                  inputMode='numeric'
                  maxLength={6}
                  value={emailGateCode}
                  onChange={(e) => setEmailGateCode(e.target.value.replace(/\D/g, ''))}
                  placeholder={t('settings.emailCodePlaceholder', lang)}
                  className='w-full p-3 border rounded-lg text-gray-900'
                />
                <button
                  className='w-full py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed'
                  onClick={handleEmailGateVerify}
                  disabled={emailGateLoading || emailGateCode.length !== 6}
                >
                  {emailGateLoading ? t('settings.emailVerifying', lang) : t('settings.verify', lang)}
                </button>
                {emailGateError && <p className='text-sm text-red-600'>{emailGateError}</p>}
                <div className='flex gap-2'>
                  <button className='w-full py-2 text-gray-500 text-sm hover:text-gray-700' onClick={() => setEmailGateStep('code_entry')}>{t('settings.back', lang)}</button>
                  <button className='w-full py-2 text-gray-500 text-sm hover:text-gray-700' onClick={resetEmailGate}>{t('settings.cancel', lang)}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Re-enable permission */}
        {walletStatus && !walletStatus.hasPermission && (
          <div>
            <h2 className='text-lg font-semibold mb-2 text-gray-900'>
              {t('settings.enableTitle', lang)}
            </h2>
            <p className='text-gray-600 mb-4'>
              {t('settings.disableDesc', lang)}
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
                  <span className='font-bold text-gray-900'>${amount}{t('settings.perDay', lang)}</span>
                  {amount === '100' && (
                    <span className='ml-2 text-sm text-emerald-600'>
                      {t('settings.recommended', lang)}
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
              {permissionStatus === 'loading' ? t('settings.enabling', lang) : t('settings.enableSippy', lang)}
            </button>
          </div>
        )}

        {/* Wallet info */}
        {walletAddress && (
          <div className='mt-6 pt-6 border-t'>
            <p className='text-sm text-gray-600 mb-2'>{t('settings.walletAddress', lang)}</p>
            <p className='font-mono text-xs text-gray-500 break-all'>
              {walletAddress}
            </p>
          </div>
        )}

        {/* Recovery Email */}
        <div id='recovery-email' className='mt-6 pt-6 border-t'>
          <h2 className='text-lg font-semibold mb-3 text-gray-900'>
            {t('settings.recoveryEmail', lang)}
          </h2>

          {emailSectionStep === 'fetch_error' && (
            <div className='text-sm text-red-600'>
              {t('settings.emailLoadError', lang)}{' '}
              <button className='underline' onClick={fetchEmailStatus}>{t('settings.emailLoadRetry', lang)}</button>
            </div>
          )}

          {emailSectionStep === 'no_email' && (
            <>
              {!bannerDismissed && (
                <div className='mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex justify-between items-start'>
                  <p className='text-sm text-blue-800'>{t('settings.addEmailBanner', lang)}</p>
                  <button onClick={() => setBannerDismissed(true)} className='ml-2 text-blue-600 hover:text-blue-800'>✕</button>
                </div>
              )}
              <label className='block text-sm font-medium mb-2 text-gray-700'>{t('settings.emailLabel', lang)}</label>
              <input
                type='email'
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder={t('settings.emailPlaceholder', lang)}
                className='w-full p-3 border rounded-lg mb-3 text-gray-900'
              />
              <button
                onClick={() => handleSendEmailCode(emailInput)}
                disabled={!emailInput || emailLoading}
                className='w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {emailLoading ? t('settings.emailSending', lang) : t('settings.addEmailBtn', lang)}
              </button>
            </>
          )}

          {emailSectionStep === 'add_sent' && (
            <>
              <label className='block text-sm font-medium mb-2 text-gray-700'>{t('settings.emailLabel', lang)}</label>
              <p className='text-sm text-gray-600 mb-3'>{t('settings.emailCodeSentTo', lang)} {emailInput}</p>
              <input
                type='text'
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                placeholder={t('settings.emailCodeInput', lang)}
                maxLength={6}
                className='w-full p-3 border rounded-lg mb-3 text-gray-900'
              />
              <button
                onClick={handleVerifyEmailCode}
                disabled={emailCode.length !== 6 || emailLoading}
                className='w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed mb-2'
              >
                {emailLoading ? t('settings.emailVerifying', lang) : t('settings.emailVerifyBtn', lang)}
              </button>
              <button
                onClick={() => handleSendEmailCode(emailInput)}
                disabled={emailLoading}
                className='w-full py-2 text-gray-500 text-sm hover:text-gray-700'
              >
                {t('settings.resendCode', lang)}
              </button>
            </>
          )}

          {emailSectionStep === 'unverified' && (
            <>
              <label className='block text-sm font-medium mb-2 text-gray-700'>{t('settings.emailLabel', lang)}</label>
              <p className='text-sm text-gray-600 mb-3'>{emailStatus?.maskedEmail} — {t('settings.emailNotVerified', lang)}</p>
              <button
                onClick={() => setEmailSectionStep('verify_entry')}
                className='w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 mb-2'
              >
                {t('settings.emailVerifyBtn', lang)}
              </button>
              <button
                onClick={() => setEmailSectionStep('verify_entry')}
                className='w-full py-2 text-gray-500 text-sm hover:text-gray-700'
              >
                {t('settings.resendCode', lang)}
              </button>
            </>
          )}

          {emailSectionStep === 'verify_entry' && (
            <>
              <label className='block text-sm font-medium mb-2 text-gray-700'>{t('settings.emailLabel', lang)}</label>
              <p className='text-sm text-gray-600 mb-3'>{t('settings.emailEnterToVerify', lang)} ({emailStatus?.maskedEmail})</p>
              <input
                type='email'
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder={t('settings.emailPlaceholder', lang)}
                className='w-full p-3 border rounded-lg mb-3 text-gray-900'
              />
              <input
                type='text'
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                placeholder={t('settings.emailCodeInput', lang)}
                maxLength={6}
                className='w-full p-3 border rounded-lg mb-3 text-gray-900'
              />
              <button
                onClick={handleVerifyEmailCode}
                disabled={!emailInput || emailCode.length !== 6 || emailLoading}
                className='w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed mb-2'
              >
                {emailLoading ? t('settings.emailVerifying', lang) : t('settings.emailVerifyBtn', lang)}
              </button>
              <button
                onClick={() => handleSendEmailCode(emailInput)}
                disabled={!emailInput || emailLoading}
                className='w-full py-2 text-gray-500 text-sm hover:text-gray-700'
              >
                {t('settings.resendCode', lang)}
              </button>
            </>
          )}

          {emailSectionStep === 'verified' && (
            <>
              <label className='block text-sm font-medium mb-2 text-gray-700'>{t('settings.emailLabel', lang)}</label>
              <p className='text-sm text-gray-600 mb-3'>{emailStatus?.maskedEmail} ✓ {t('settings.emailVerified', lang)}</p>
              <button
                onClick={() => { setEmailInput(''); setEmailCode(''); setEmailSectionStep('change_entry'); }}
                className='w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700'
              >
                Change
              </button>
            </>
          )}

          {emailSectionStep === 'change_entry' && (
            <>
              <label className='block text-sm font-medium mb-2 text-gray-700'>{t('settings.emailLabel', lang)}</label>
              <p className='text-sm text-gray-600 mb-3'>{t('settings.emailEnterToVerify', lang)}</p>
              <input
                type='email'
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder={t('settings.emailPlaceholder', lang)}
                className='w-full p-3 border rounded-lg mb-3 text-gray-900'
              />
              <button
                onClick={() => handleSendEmailCode(emailInput)}
                disabled={!emailInput || emailLoading}
                className='w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {emailLoading ? t('settings.emailSending', lang) : t('settings.emailSendCode', lang)}
              </button>
            </>
          )}

          {emailSectionStep === 'change_sent' && (
            <>
              <label className='block text-sm font-medium mb-2 text-gray-700'>{t('settings.emailLabel', lang)}</label>
              <p className='text-sm text-gray-600 mb-3'>{t('settings.emailCodeSentTo', lang)} {emailInput}</p>
              <input
                type='text'
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                placeholder={t('settings.emailCodeInput', lang)}
                maxLength={6}
                className='w-full p-3 border rounded-lg mb-3 text-gray-900'
              />
              <button
                onClick={handleVerifyEmailCode}
                disabled={emailCode.length !== 6 || emailLoading}
                className='w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed mb-2'
              >
                {emailLoading ? t('settings.emailVerifying', lang) : t('settings.emailVerifyBtn', lang)}
              </button>
              <button
                onClick={() => handleSendEmailCode(emailInput)}
                disabled={emailLoading}
                className='w-full py-2 text-gray-500 text-sm hover:text-gray-700'
              >
                {t('settings.resendCode', lang)}
              </button>
            </>
          )}

          {emailError && <p className='text-red-600 text-sm mt-2'>{emailError}</p>}
        </div>

        {/* Wallet Security */}
        <div className='mt-6 pt-6 border-t'>
          <h2 className='text-lg font-semibold mb-3 text-gray-900'>
            {t('settings.walletSecurity', lang)}
          </h2>

          {exportStep === 'idle' && (
            <>
              {eoaAddress ? (
                <>
                  {!(emailGateContext === 'export' && emailGateStep !== 'idle') && (
                    <button
                      onClick={() => {
                        if (emailSectionStep === 'loading' || emailSectionStep === 'fetch_error') return;
                        if (emailStatus?.verified) {
                          setEmailGateContext('export');
                          setEmailGateStep('code_entry');
                        } else {
                          setEmailGateContext('export');
                          setEmailGateStep('warning_no_email');
                        }
                      }}
                      disabled={exportStep !== 'idle' || emailSectionStep === 'loading' || emailSectionStep === 'fetch_error'}
                      className='w-full py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed'
                    >
                      {t('settings.exportKey', lang)}
                    </button>
                  )}
                  {emailGateStep === 'warning_no_email' && emailGateContext === 'export' && (
                    <div className='rounded border border-yellow-400 bg-yellow-50 p-3 text-sm text-yellow-800'>
                      <p className='mb-2'>
                        ⚠️ {t('settings.emailWarning', lang)}
                      </p>
                      <div className='flex gap-2'>
                        <button className='w-full py-2 text-gray-500 text-sm hover:text-gray-700' onClick={resetEmailGate}>{t('settings.cancel', lang)}</button>
                        <button className='w-full py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700' onClick={() => proceedWithGatedOperation()}>{t('settings.continueAnyway', lang)}</button>
                      </div>
                    </div>
                  )}
                  {emailGateStep === 'code_entry' && emailGateContext === 'export' && (
                    <div className='space-y-2'>
                      <p className='text-sm'>
                        {t('settings.verifyIdentity', lang)}
                        {emailStatus?.maskedEmail && (
                          <span className='ml-1 text-gray-500'>({emailStatus.maskedEmail})</span>
                        )}
                      </p>
                      <button
                        className='w-full py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed'
                        onClick={handleEmailGateSendCode}
                        disabled={emailGateLoading}
                      >
                        {emailGateLoading ? t('settings.emailSending', lang) : t('settings.emailSendCode', lang)}
                      </button>
                      {emailGateError && <p className='text-sm text-red-600'>{emailGateError}</p>}
                      <button className='w-full py-2 text-gray-500 text-sm hover:text-gray-700' onClick={resetEmailGate}>{t('settings.cancel', lang)}</button>
                    </div>
                  )}
                  {emailGateStep === 'code_sent' && emailGateContext === 'export' && (
                    <div className='space-y-2'>
                      <p className='text-sm'>{t('settings.emailCodeInstruction', lang)}</p>
                      <input
                        type='text'
                        inputMode='numeric'
                        maxLength={6}
                        value={emailGateCode}
                        onChange={(e) => setEmailGateCode(e.target.value.replace(/\D/g, ''))}
                        placeholder={t('settings.emailCodePlaceholder', lang)}
                        className='w-full p-3 border rounded-lg text-gray-900'
                      />
                      <button
                        className='w-full py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed'
                        onClick={handleEmailGateVerify}
                        disabled={emailGateLoading || emailGateCode.length !== 6}
                      >
                        {emailGateLoading ? t('settings.emailVerifying', lang) : t('settings.verify', lang)}
                      </button>
                      {emailGateError && <p className='text-sm text-red-600'>{emailGateError}</p>}
                      <div className='flex gap-2'>
                        <button className='w-full py-2 text-gray-500 text-sm hover:text-gray-700' onClick={() => setEmailGateStep('code_entry')}>{t('settings.back', lang)}</button>
                        <button className='w-full py-2 text-gray-500 text-sm hover:text-gray-700' onClick={resetEmailGate}>{t('settings.cancel', lang)}</button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className='text-xs text-gray-400'>
                  {t('settings.noExportAccount', lang)}
                </p>
              )}
            </>
          )}

          {exportStep === 'warning' && (
            <div className='space-y-4'>
              <div className='p-4 bg-red-50 border border-red-200 rounded-lg'>
                <p className='text-sm text-red-800 font-medium mb-2'>
                  {t('settings.exportWarningTitle', lang)}
                </p>
                <p className='text-sm text-red-700'>
                  {t('settings.exportWarningBody', lang)}
                </p>
              </div>
              {exportError && (
                <div className='p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm'>
                  {exportError}
                </div>
              )}
              <button
                onClick={handleWarningContinue}
                disabled={isExporting}
                className='w-full py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {isExporting ? t('settings.loadingKey', lang) : t('settings.understandContinue', lang)}
              </button>
              <button
                onClick={() => resetExport('cancelled')}
                disabled={isExporting}
                className='w-full py-2 text-gray-500 text-sm hover:text-gray-700'
              >
                {t('settings.cancel', lang)}
              </button>
            </div>
          )}

          {exportStep === 'sweep_offer' && (
            <div className='space-y-4'>
              <div className='p-4 bg-amber-50 border border-amber-200 rounded-lg'>
                <p className='text-sm text-amber-800 font-medium mb-2'>
                  {t('settings.transferFirst', lang)}
                </p>
                <p className='text-sm text-amber-700'>
                  {t('settings.transferDesc', lang)}
                </p>
              </div>

              <div className='p-4 bg-gray-50 rounded-lg'>
                <p className='text-sm text-gray-600'>{t('settings.smartBalance', lang)}</p>
                <p className='text-2xl font-bold text-gray-900'>
                  ${parseFloat(smartAccountBalance || '0').toFixed(2)} USDC
                </p>
                {eoaAddress && (
                  <p className='text-xs text-gray-500 mt-2 font-mono break-all'>
                    To: {eoaAddress}
                  </p>
                )}
              </div>

              <button
                onClick={handleSweep}
                className='w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700'
              >
                {t('settings.transferTo', lang)} (${parseFloat(smartAccountBalance || '0').toFixed(2)})
              </button>

              <button
                onClick={handleExportContinue}
                disabled={isExporting}
                className='w-full py-2 text-gray-500 text-sm hover:text-gray-700'
              >
                {t('settings.skipShowKey', lang)}
              </button>
              <p className='text-xs text-amber-600 text-center'>
                {t('settings.skipWarning', lang)}
              </p>
            </div>
          )}

          {exportStep === 'sweeping' && (
            <div className='space-y-4'>
              {!sweepError ? (
                <div className='text-center py-6'>
                  <div className='animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mx-auto mb-4' />
                  <p className='text-gray-700 font-medium'>{t('settings.transferring', lang)}</p>
                  <p className='text-sm text-gray-500 mt-1'>
                    {t('settings.movingFunds', lang)}
                  </p>
                </div>
              ) : (
                <>
                  <div className='p-4 bg-red-50 border border-red-200 rounded-lg'>
                    <p className='text-sm text-red-700'>{sweepError}</p>
                  </div>
                  <button
                    onClick={handleSweep}
                    className='w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700'
                  >
                    {t('settings.retryTransfer', lang)}
                  </button>
                  <button
                    onClick={handleExportContinue}
                    disabled={isExporting}
                    className='w-full py-2 text-gray-500 text-sm hover:text-gray-700'
                  >
                    {t('settings.skipAnyway', lang)}
                  </button>
                </>
              )}
            </div>
          )}

          {exportStep === 'export_active' && exportedKey && (
            <div className='space-y-4'>
              <div className='flex justify-between items-center'>
                <span className='text-sm font-medium text-gray-700'>
                  {t('settings.yourPrivateKey', lang)}
                </span>
                <span className={`text-sm font-mono ${exportCountdown <= 60 ? 'text-red-600' : 'text-gray-500'}`}>
                  {Math.floor(exportCountdown / 60)}:{(exportCountdown % 60).toString().padStart(2, '0')}
                </span>
              </div>

              <div className='p-3 bg-gray-100 rounded-lg'>
                <p className='font-mono text-xs break-all text-gray-800 select-all'>
                  {exportedKey}
                </p>
              </div>

              <button
                onClick={handleCopyKey}
                className={`w-full py-3 rounded-lg font-semibold ${
                  hasCopied
                    ? 'bg-green-600 text-white'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {hasCopied ? t('settings.copied', lang) : t('settings.copyKey', lang)}
              </button>

              <button
                onClick={() => resetExport(hasCopied ? 'completed' : 'cancelled')}
                className='w-full py-3 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700'
              >
                {t('settings.done', lang)}
              </button>

              <p className='text-xs text-red-500 text-center'>
                {t('settings.keyWillClear', lang)}
              </p>
            </div>
          )}
        </div>

        {/* Navigation + Sign out */}
        <div className='mt-6 pt-6 border-t flex items-center justify-between'>
          <a
            href='/wallet'
            className='text-sm text-emerald-600 hover:text-emerald-700 font-medium'
          >
            {t('settings.openWallet', lang)}
          </a>
          <button
            onClick={async () => {
              if (exportStep !== 'idle') resetExport('cancelled');
              clearToken();
              await signOut();
              setAuthStep('phone');
              setWalletAddress(null);
              setWalletStatus(null);
              setVerifiedPhone(null);
              setHasCheckedSession(false);
            }}
            className='text-sm text-gray-500 hover:text-gray-700'
          >
            {t('settings.signOut', lang)}
          </button>
        </div>

        {/* Footer */}
        <div className='mt-8 text-center text-xs text-gray-500'>
          <p>{t('settings.poweredBy', lang)}</p>
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
