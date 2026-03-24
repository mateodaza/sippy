'use client'

import { useState, Suspense, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  useAuthenticateWithJWT,
  useCreateSpendPermission,
  useCurrentUser,
  useIsSignedIn,
  useSignOut,
  useGetAccessToken,
} from '@coinbase/cdp-hooks'
import {
  sendOtp,
  verifyOtp,
  storeToken,
  getStoredToken,
  clearToken,
  getFreshToken,
  type OtpChannel,
} from '../../lib/auth'
import {
  Language,
  getStoredLanguage,
  storeLanguage,
  detectLanguageFromPhone,
  fetchUserLanguage,
  resolveLanguage,
  localizeError,
  t,
} from '../../lib/i18n'
import { parseUnits } from 'viem'
import { SippyPhoneInput } from '../../components/ui/phone-input'
import { isBlockedPrefix, isNANP } from '@sippy/shared'
import { getDefaultChannel, canSwitchChannel } from '../../lib/auth-mode'
import { ChannelPicker, ResendButton } from '../../components/shared/ChannelPicker'
import { CDPProviderCustomAuth } from '../providers/cdp-provider'

/**
 * Setup Page for Embedded Wallets
 *
 * Uses CDP's SMS authentication flow:
 * 1. User enters phone number
 * 2. CDP sends OTP via SMS
 * 3. User verifies OTP
 * 4. User creates spend permission
 */

/**
 * Retry getAccessToken with delays. In the Twilio/customAuth flow,
 * the CDP session may not be fully settled immediately after
 * authenticateWithJWT(), so getAccessToken() can fail on the first call.
 */
async function getCdpTokenWithRetry(
  getAccessToken: () => Promise<string | null>,
  maxAttempts = 3,
  delayMs = 1000
): Promise<string | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const token = await getAccessToken()
      if (token) return token
    } catch (err) {
      console.warn(
        `CDP getAccessToken attempt ${attempt}/${maxAttempts} failed:`,
        err instanceof Error ? err.message : err
      )
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, delayMs * attempt))
    }
  }
  console.error('CDP getAccessToken failed after all retries')
  return null
}

// Environment variables
const SIPPY_SPENDER_ADDRESS = process.env.NEXT_PUBLIC_SIPPY_SPENDER_ADDRESS || ''
const NETWORK = process.env.NEXT_PUBLIC_SIPPY_NETWORK || 'arbitrum'
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
const CDP_PROJECT_ID = process.env.NEXT_PUBLIC_CDP_PROJECT_ID || ''

// USDC addresses by network (CDP SDK doesn't support 'usdc' shortcut on Arbitrum)
const USDC_ADDRESSES: Record<string, string> = {
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
}
const USDC_ADDRESS = USDC_ADDRESSES[NETWORK] || USDC_ADDRESSES.arbitrum

type Step = 'phone' | 'otp' | 'email' | 'tos' | 'permission' | 'done'
// 'permission' is hidden — auto-created with max limit after ToS
const STEPS: Step[] = ['phone', 'otp', 'email', 'tos', 'done']

const TOS_VERSION = '1.0'
const TOS_URL = 'https://www.sippy.lat/terms'

function SetupContent({ phoneFromUrl: phoneFromUrlProp }: { phoneFromUrl: string }) {
  const router = useRouter()

  const phoneFromUrl = phoneFromUrlProp

  // Redirect to settings if user already has a valid (non-expired) session
  useEffect(() => {
    if (!phoneFromUrl && getFreshToken()) {
      router.replace('/settings')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [step, setStep] = useState<Step>('phone')
  const [phoneNumber, setPhoneNumber] = useState(phoneFromUrl)
  const [otp, setOtp] = useState('')
  // dailyLimit is derived from emailVerified at permission-creation time (see handleApprovePermission)
  const [error, setError] = useState<string | null>(null)
  const [isSessionExpired, setIsSessionExpired] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true) // Start true to check on mount
  const [isPreparingWallet, setIsPreparingWallet] = useState(false) // Waiting for gas
  const [gasReady, setGasReady] = useState(false)
  const [hasCheckedSession, setHasCheckedSession] = useState(false) // Only check once on mount
  const [cdpInitAttempts, setCdpInitAttempts] = useState(0) // Track CDP initialization attempts to prevent infinite wait
  const [email, setEmail] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [emailVerified, setEmailVerified] = useState(false)
  const [tosChecked, setTosChecked] = useState(false)
  const [lang, setLang] = useState<Language>('en')
  const emailTimerRef = useRef<number | null>(null)

  // Cleanup email verification timer on unmount
  useEffect(() => {
    return () => {
      if (emailTimerRef.current !== null) clearTimeout(emailTimerRef.current)
    }
  }, [])

  // Keep html lang attribute in sync for screen readers
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  // CDP Hooks — shared
  const { authenticateWithJWT } = useAuthenticateWithJWT()
  const { createSpendPermission, status: permissionStatus } = useCreateSpendPermission()
  const { currentUser } = useCurrentUser()
  const { isSignedIn } = useIsSignedIn()
  const { signOut } = useSignOut()

  const { getAccessToken } = useGetAccessToken()

  // OTP channel: +1 → whatsapp only, others → sms with whatsapp fallback
  const [otpChannel, setOtpChannel] = useState<OtpChannel>('sms')

  // Flag: OTP verified, waiting for currentUser to populate with wallet
  const [awaitingCdpWallet, setAwaitingCdpWallet] = useState(false)

  // Security: Phone number must match what was sent in the WhatsApp link
  const isPhoneLocked = !!phoneFromUrl

  // Check if CDP is configured
  const isCdpConfigured = !!CDP_PROJECT_ID

  /**
   * Check wallet-status (and email-status) to advance to the correct step.
   * Used after wallet registration to skip steps for returning users.
   *
   * Decision tree:
   *   hasPermission   → redirect to /settings (fully onboarded)
   *   tosAccepted     → permission step
   *   email verified  → tos step (skip email, they already have one)
   *   otherwise       → email step (genuinely fresh user)
   */
  const advanceToCorrectStep = async (accessToken: string): Promise<boolean> => {
    if (!BACKEND_URL) {
      setStep('email')
      return false
    }
    try {
      const headers = { Authorization: `Bearer ${accessToken}` }

      const statusResponse = await fetch(`${BACKEND_URL}/api/wallet-status`, { headers })
      if (!statusResponse.ok) {
        setStep('email')
        return false
      }
      const status = await statusResponse.json()

      if (status.hasPermission) {
        router.replace('/settings')
        return true
      }
      if (status.tosAccepted) {
        setStep('permission')
        return true
      }

      // ToS not accepted — check if email is already verified to skip the email step
      try {
        const emailRes = await fetch(`${BACKEND_URL}/api/auth/email-status`, { headers })
        if (emailRes.ok) {
          const emailData = await emailRes.json()
          if (emailData.verified) {
            setStep('tos')
            return true
          }
        }
      } catch {
        // email-status failed — not critical, just show email step
      }
    } catch (err) {
      console.error('advanceToCorrectStep failed:', err)
    }
    // Fresh user or no verified email — show email step
    setStep('email')
    return false
  }

  // Language init: phone prefix wins immediately, then API can override for returning users
  useEffect(() => {
    if (phoneFromUrl) {
      const detected = detectLanguageFromPhone(phoneFromUrl)
      storeLanguage(detected)
      setLang(detected)
    } else {
      const cached = getStoredLanguage()
      if (cached) setLang(cached)
    }

    // Only check API for language if no phone in URL (phone prefix is authoritative during setup)
    if (!phoneFromUrl) {
      const token = getStoredToken()
      resolveLanguage(null, token, BACKEND_URL)
        .then((resolved) => {
          storeLanguage(resolved)
          setLang(resolved)
        })
        .catch(() => {
          /* language fetch failed */
        })
    }
  }, [phoneFromUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Permission step is hidden — auto-create when we land on it
  const permissionFired = useRef(false)
  useEffect(() => {
    if (step === 'permission' && !permissionFired.current) {
      permissionFired.current = true
      handleApprovePermission()
    }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // Recovery: Check for existing session on mount (only once)
  useEffect(() => {
    // Only run this check once on mount
    if (hasCheckedSession) return

    // Wait for CDP to initialize
    if (isSignedIn === undefined) return

    // Under CDPProviderCustomAuth, CDP uses getJwt() (our stored JWT) to
    // bootstrap. On the first render cycle isSignedIn may still be false
    // while CDP is authenticating. Don't clear the token or give up yet —
    // schedule a retry after 1s so CDP has time to complete.
    // Give up after 3 retries (~3s) to avoid hanging forever.
    if (!isSignedIn && getStoredToken() && cdpInitAttempts < 3) {
      const timer = setTimeout(() => setCdpInitAttempts((prev) => prev + 1), 1000)
      return () => clearTimeout(timer)
    }

    // If CDP init retries were exhausted, log it for diagnosability
    if (!isSignedIn && cdpInitAttempts >= 3) {
      console.warn('CDP initialization failed after 3 attempts — clearing stale session')
    }

    // Mark that we've checked
    setHasCheckedSession(true)

    const checkExistingSession = async () => {
      // If not signed in after CDP init retries, wipe any stale JWT and show the phone step
      if (!isSignedIn || !currentUser) {
        clearToken()
        setIsCheckingSession(false)
        return
      }

      try {
        // Get wallet address from current user
        const smartAccountAddress =
          currentUser.evmSmartAccounts?.[0] || currentUser.evmAccounts?.[0]
        if (!smartAccountAddress) {
          clearToken()
          await signOut()
          setIsCheckingSession(false)
          return
        }

        setWalletAddress(smartAccountAddress)

        // Check backend status
        if (BACKEND_URL) {
          const accessToken = getFreshToken()
          if (!accessToken) {
            // Token expired during reload — clear session and restart onboarding
            clearToken()
            await signOut()
            setIsCheckingSession(false)
            return
          }

          // First ensure wallet is registered (this also triggers refuel)
          const cdpToken = await getCdpTokenWithRetry(getAccessToken)
          const registerResponse = await fetch(`${BACKEND_URL}/api/register-wallet`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              walletAddress: smartAccountAddress,
              ...(cdpToken && { cdpAccessToken: cdpToken }),
            }),
          })

          if (registerResponse.ok) {
            // Wallet registered/confirmed
          } else {
            const errText = await registerResponse.text()
            console.error('Wallet registration failed on recovery:', errText)
            setError(
              lang === 'es'
                ? 'Error registrando la billetera. Intenta de nuevo.'
                : lang === 'pt'
                  ? 'Erro ao registrar a carteira. Tente novamente.'
                  : 'Failed to register wallet. Please try again.'
            )
            setIsCheckingSession(false)
            return
          }

          // Check wallet status to determine which step to resume from
          const statusResponse = await fetch(`${BACKEND_URL}/api/wallet-status`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })

          if (statusResponse.ok) {
            const status = await statusResponse.json()

            if (status.hasPermission) {
              // Fully onboarded — go to settings, no need to show setup again
              router.replace('/settings')
              return
            } else if (status.tosAccepted) {
              // Attempt to register an existing on-chain permission before asking
              // the user to create a new one. Handles the case where a permission
              // was signed on-chain but registration was interrupted (tab close, network error).
              try {
                const regPermRes = await fetch(`${BACKEND_URL}/api/register-permission`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                  },
                  body: JSON.stringify({ dailyLimit: null }),
                })
                if (regPermRes.ok) {
                  console.log('Found and registered existing on-chain permission during recovery')
                  router.replace('/settings')
                  return
                } else {
                  // No existing permission found — resume at permission step
                  setStep('permission')
                }
              } catch (err) {
                console.error('Permission recovery check failed:', err)
                setStep('permission')
              }
            } else {
              // Wallet registered but ToS not accepted — resume at ToS step.
              // Email step is only shown in the initial fresh flow, not on recovery.
              setStep('tos')
            }
          } else {
            // wallet-status returned non-OK — resume at tos step (safe default).
            setStep('tos')
          }
        } else {
          // No backend, just go to tos step
          setStep('tos')
        }
      } catch (err) {
        console.error('Session recovery failed:', err)
        // On error, let user start fresh
        try {
          clearToken()
          await signOut()
        } catch (cleanupErr) {
          console.error('Session cleanup failed:', cleanupErr)
        }
      } finally {
        setIsCheckingSession(false)
      }
    }

    checkExistingSession()
  }, [isSignedIn, currentUser, hasCheckedSession, cdpInitAttempts]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ensure wallet has gas before allowing permission creation
  const ensureGasReady = async (): Promise<boolean> => {
    if (!BACKEND_URL) return true // No backend, assume ready

    setIsPreparingWallet(true)
    setError(null)

    try {
      const accessToken = getFreshToken()
      if (!accessToken) {
        setIsSessionExpired(true)
        throw new Error('Session expired. Please refresh and try again.')
      }

      const response = await fetch(`${BACKEND_URL}/api/ensure-gas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          ...(walletAddress && { smartAccountAddress: walletAddress }),
        }),
      })

      if (!response.ok) {
        throw new Error(`Gas check failed (HTTP ${response.status})`)
      }

      const result = await response.json()

      if (result.ready) {
        setGasReady(true)
        return true
      } else {
        throw new Error(result.error || 'Gas preparation failed')
      }
    } catch (err) {
      console.error('Failed to ensure gas:', err)
      const msg = err instanceof Error ? err.message : t('setup.errPrepare', lang)
      setError(msg)
      return false
    } finally {
      setIsPreparingWallet(false)
    }
  }

  // Step 1: Send OTP via SMS or WhatsApp
  const handleSendOtp = async (channelOverride?: OtpChannel) => {
    setIsLoading(true)
    setError(null)

    try {
      // PhoneInput already provides E.164 format; normalize just in case
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`
      setPhoneNumber(formattedPhone)

      if (isBlockedPrefix(formattedPhone)) {
        setError(
          lang === 'es'
            ? 'Este país no está disponible.'
            : lang === 'pt'
              ? 'Este país não está disponível.'
              : 'This country is not available.'
        )
        return
      }

      // Detect language from phone prefix before sending OTP so the UI switches immediately
      const phoneLang = detectLanguageFromPhone(formattedPhone)
      storeLanguage(phoneLang)
      setLang(phoneLang)

      // Determine channel: override (from "Send via WhatsApp" link) or default from phone
      const channel = channelOverride ?? getDefaultChannel(formattedPhone)
      setOtpChannel(channel)

      // Sign out first if an old CDP session is still active
      if (isSignedIn) await signOut()

      await sendOtp(formattedPhone, channel)
      setStep('otp')
    } catch (err) {
      console.error('Failed to send OTP:', err)
      setError(localizeError(err, 'otp-send', lang))
    } finally {
      setIsLoading(false)
    }
  }

  // Step 2: Verify OTP
  const handleVerifyOtp = async () => {
    setIsLoading(true)
    setError(null)
    let shouldKeepLoading = false

    try {
      // Verify OTP via Sippy backend, get JWT directly
      const sippyJwt = await verifyOtp(phoneNumber, otp)
      storeToken(sippyJwt)

      // Detect and store language immediately from phone, then update from API
      const phoneLang = detectLanguageFromPhone(phoneNumber)
      storeLanguage(phoneLang)
      setLang(phoneLang)
      fetchUserLanguage(sippyJwt, BACKEND_URL)
        .then(({ language }) => {
          storeLanguage(language)
          setLang(language)
        })
        .catch(() => {
          /* language fetch failed */
        })

      const { user } = await authenticateWithJWT()

      // Check if wallet is immediately available. CDP creates wallets
      // asynchronously — the user object may not have it yet.
      const smartAccountAddress = user?.evmSmartAccounts?.[0] || user?.evmAccounts?.[0]
      if (!smartAccountAddress) {
        // Wallet not populated yet — wait for currentUser to update
        // (same pattern as CDP-SMS path). The useEffect below will
        // pick it up, register the wallet, and advance to email step.
        setAwaitingCdpWallet(true)
        shouldKeepLoading = true
        return
      }

      setWalletAddress(smartAccountAddress)

      // Register wallet with backend
      if (BACKEND_URL) {
        try {
          const accessToken = getStoredToken()
          if (accessToken) {
            const cdpToken = await getCdpTokenWithRetry(getAccessToken)
            const response = await fetch(`${BACKEND_URL}/api/register-wallet`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                walletAddress: smartAccountAddress,
                ...(cdpToken && { cdpAccessToken: cdpToken }),
              }),
            })

            if (!response.ok) {
              const errText = await response.text()
              console.error('Wallet registration failed:', errText)
              setError(
                lang === 'es'
                  ? 'Error registrando la billetera. Intenta de nuevo.'
                  : lang === 'pt'
                    ? 'Erro ao registrar a carteira. Tente novamente.'
                    : 'Failed to register wallet. Please try again.'
              )
              return
            }
          }
        } catch (regErr) {
          console.error('Backend registration error:', regErr)
          setError(
            lang === 'es'
              ? 'Error registrando la billetera. Intenta de nuevo.'
              : lang === 'pt'
                ? 'Erro ao registrar a carteira. Tente novamente.'
                : 'Failed to register wallet. Please try again.'
          )
          return
        }
      }

      // Check if user is already onboarded — skip steps for returning users
      const token = getStoredToken()
      if (token) {
        await advanceToCorrectStep(token)
      } else {
        setStep('email')
      }
    } catch (err) {
      console.error('OTP verification failed:', err)
      setError(localizeError(err, 'otp-verify', lang))
    } finally {
      // Keep isLoading true only when awaiting wallet population via useEffect
      if (!shouldKeepLoading) {
        setIsLoading(false)
      }
    }
  }

  // Effect: After OTP verification, wait for currentUser to populate with a wallet.
  // authenticateWithJWT triggers an internal SDK state update; React re-renders with the new
  // currentUser in a subsequent render cycle. This effect fires on that re-render.
  useEffect(() => {
    if (!awaitingCdpWallet) return

    // Timeout: if the wallet never populates (SDK error, network issue), unblock the UI.
    const timeout = setTimeout(() => {
      setAwaitingCdpWallet(false)
      setIsLoading(false)
      setError(
        lang === 'es'
          ? 'La creación de la billetera expiró. Intenta de nuevo.'
          : lang === 'pt'
            ? 'A criação da carteira expirou. Tente novamente.'
            : 'Wallet creation timed out. Please try again.'
      )
    }, 30000)

    const smartAccountAddress = currentUser?.evmSmartAccounts?.[0] || currentUser?.evmAccounts?.[0]
    if (!smartAccountAddress) return () => clearTimeout(timeout) // Not yet populated, wait for next render

    // Wallet is available — clear timeout and continue the setup flow
    clearTimeout(timeout)
    setAwaitingCdpWallet(false)
    setWalletAddress(smartAccountAddress)

    const registerAndContinue = async () => {
      try {
        if (BACKEND_URL) {
          const accessToken = getStoredToken()
          if (accessToken) {
            const cdpToken = await getCdpTokenWithRetry(getAccessToken)
            const response = await fetch(`${BACKEND_URL}/api/register-wallet`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                walletAddress: smartAccountAddress,
                ...(cdpToken && { cdpAccessToken: cdpToken }),
              }),
            })

            if (!response.ok) {
              const errText = await response.text()
              console.error('Wallet registration failed:', errText)
              setError(
                lang === 'es'
                  ? 'Error registrando la billetera. Intenta de nuevo.'
                  : lang === 'pt'
                    ? 'Erro ao registrar a carteira. Tente novamente.'
                    : 'Failed to register wallet. Please try again.'
              )
              setIsLoading(false)
              return
            }
          }
        }

        // Check if user is already onboarded — skip steps for returning users
        const token = getStoredToken()
        if (token) {
          await advanceToCorrectStep(token)
        } else {
          setStep('email')
        }
      } catch (regErr) {
        console.error('Backend registration error:', regErr)
        setError(
          lang === 'es'
            ? 'Error registrando la billetera. Intenta de nuevo.'
            : lang === 'pt'
              ? 'Erro ao registrar a carteira. Tente novamente.'
              : 'Failed to register wallet. Please try again.'
        )
      } finally {
        setIsLoading(false)
      }
    }

    registerAndContinue()
  }, [awaitingCdpWallet, currentUser]) // eslint-disable-line react-hooks/exhaustive-deps

  // Step 3a: Send email verification code
  const handleSendEmailCode = async () => {
    if (!email) return
    setIsLoading(true)
    setError(null)
    try {
      const accessToken = getFreshToken()
      if (!accessToken) {
        setIsSessionExpired(true)
        setError(t('wallet.errSessionExpired', lang))
        return
      }
      const response = await fetch(`${BACKEND_URL}/api/auth/send-email-code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })
      if (response.ok) {
        setEmailSent(true)
      } else {
        setError(localizeError(response, 'email-send', lang))
      }
    } catch (err) {
      setError(localizeError(err, 'email-send', lang))
    } finally {
      setIsLoading(false)
    }
  }

  // Step 3b: Verify email code
  const handleVerifyEmailCode = async () => {
    if (!emailCode) return
    setIsLoading(true)
    setError(null)
    try {
      const accessToken = getFreshToken()
      if (!accessToken) {
        setIsSessionExpired(true)
        setError(t('wallet.errSessionExpired', lang))
        return
      }
      const response = await fetch(`${BACKEND_URL}/api/auth/verify-email-code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, code: emailCode }),
      })
      if (response.ok) {
        setEmailVerified(true)
        emailTimerRef.current = window.setTimeout(() => setStep('tos'), 1500)
      } else {
        setError(localizeError(response, 'email-verify', lang))
      }
    } catch (err) {
      setError(localizeError(err, 'email-verify', lang))
    } finally {
      setIsLoading(false)
    }
  }

  // Step 3c: Skip email
  const handleSkipEmail = () => {
    setStep('tos')
  }

  // Step 4a: Accept ToS
  const handleAcceptTos = async () => {
    if (!tosChecked) {
      setError(t('setup.tosRequired', lang))
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      if (BACKEND_URL) {
        const accessToken = getFreshToken()
        if (!accessToken) {
          setIsSessionExpired(true)
          throw new Error(
            lang === 'es'
              ? 'Sesión expirada. Recarga la página e intenta de nuevo.'
              : lang === 'pt'
                ? 'Sessão expirada. Recarregue a página e tente novamente.'
                : 'Session expired. Please refresh the page and try again.'
          )
        }
        const response = await fetch(`${BACKEND_URL}/api/accept-tos`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ version: TOS_VERSION }),
        })

        if (!response.ok) {
          throw new Error('Failed to record ToS acceptance')
        }
      }

      // Permission step is hidden — auto-create with max limit
      await handleApprovePermission()
    } catch (err) {
      console.error('ToS acceptance failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to accept Terms of Service')
      setIsLoading(false)
    }
  }

  // Step 4: Create Spend Permission
  const handleApprovePermission = async () => {
    setIsLoading(true)
    setError(null)

    try {
      if (!walletAddress) {
        throw new Error('No wallet address. Please restart the process.')
      }

      // we can work on a tier system
      // Set limit to user's tier max — no UI to change later
      const tierLimit = emailVerified ? '500' : '50'

      // Validate daily limit before creating on-chain permission — invalid values
      // would create a broken or expensive-to-undo permission on-chain
      const parsedLimit = Number(tierLimit)
      if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 10000) {
        setError(
          lang === 'es'
            ? 'El límite diario debe ser entre $1 y $10,000.'
            : lang === 'pt'
              ? 'O limite diário deve ser entre $1 e $10.000.'
              : 'Daily limit must be between $1 and $10,000.'
        )
        setIsLoading(false)
        return
      }

      if (!SIPPY_SPENDER_ADDRESS) {
        throw new Error('Sippy spender address not configured.')
      }

      // First ensure wallet has gas (this will wait for refuel if needed)
      const hasGas = await ensureGasReady()
      if (!hasGas) {
        // ensureGasReady already set the specific error in state — just bail
        setIsLoading(false)
        return
      }

      // Create spend permission using CDP SDK
      // This will prompt the user to sign the permission
      const result = await createSpendPermission({
        network: NETWORK as 'arbitrum',
        spender: SIPPY_SPENDER_ADDRESS as `0x${string}`,
        token: USDC_ADDRESS as `0x${string}`,
        allowance: parseUnits(tierLimit, 6), // USDC has 6 decimals
        periodInDays: 1, // Daily limit
      })

      // The userOpHash is NOT the permissionHash - we need to let the backend
      // fetch the actual permissionHash from CDP after the permission is created onchain

      // Register permission with backend - this MUST succeed for transfers to work
      // Backend will verify and fetch the actual permissionHash from CDP
      if (BACKEND_URL) {
        const accessToken = getFreshToken()
        if (!accessToken) {
          setIsSessionExpired(true)
          throw new Error(
            lang === 'es'
              ? 'Sesión expirada. Recarga la página e intenta de nuevo.'
              : lang === 'pt'
                ? 'Sessão expirada. Recarregue a página e tente novamente.'
                : 'Session expired. Please refresh the page and try again.'
          )
        }

        const response = await fetch(`${BACKEND_URL}/api/register-permission`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            dailyLimit: tierLimit,
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error('Failed to register permission with backend:', errorText)
          throw new Error(t('setup.errRegisterPermission', lang))
        }
      }

      setStep('done')
    } catch (err: unknown) {
      console.error('Permission creation failed:', err)

      // Extract error string from any shape (Error, nested .error.message, plain object)
      const rawMsg = (() => {
        if (err instanceof Error) return err.message
        if (typeof err === 'object' && err !== null) {
          const e = err as Record<string, unknown>
          if (typeof e.message === 'string') return e.message
          if (typeof e.error === 'object' && e.error !== null) {
            const inner = e.error as Record<string, unknown>
            if (typeof inner.message === 'string') return inner.message
          }
        }
        return String(err)
      })()
      const lower = rawMsg.toLowerCase()

      if (lower.includes('daily limit') || lower.includes('cooldown')) {
        setError(t('setup.errRefuelLimit', lang))
      } else if (
        lower.includes('insufficient') ||
        lower.includes('gas') ||
        lower.includes('funds')
      ) {
        setError(t('setup.errInsufficientEth', lang))
        // Trigger a re-registration to attempt refuel again
        if (BACKEND_URL && walletAddress) {
          try {
            const accessToken = getFreshToken()
            if (accessToken) {
              const cdpToken = await getCdpTokenWithRetry(getAccessToken)
              const regRes = await fetch(`${BACKEND_URL}/api/register-wallet`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                  walletAddress,
                  ...(cdpToken && { cdpAccessToken: cdpToken }),
                }),
              })
              if (!regRes.ok) {
                console.error('Wallet re-registration for refuel failed:', regRes.status)
              }
            }
          } catch (regErr) {
            console.error('Wallet re-registration failed:', regErr)
          }
        }
      } else {
        setError(t('setup.errCreatePermission', lang))
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Show loading while checking session
  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[var(--bg-primary)] panel-frame rounded-2xl p-8 text-center">
          <div className="animate-pulse">
            <div className="text-4xl mb-4">🔍</div>
            <p className="text-[var(--text-secondary)]">{t('setup.loading', lang)}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[var(--bg-primary)] panel-frame rounded-2xl p-8">
        {/* Progress indicator */}
        <div className="mb-8 text-sm text-[var(--text-secondary)] font-medium tracking-wide">
          {{ en: 'Step', es: 'Paso', pt: 'Passo' }[lang] || 'Step'} {STEPS.indexOf(step) + 1} of{' '}
          {STEPS.length}
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-4 p-3 bg-[var(--fill-danger-light)] border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
            {isSessionExpired && step !== 'phone' && step !== 'otp' && (
              <button
                onClick={() => window.location.reload()}
                className="block mt-2 text-red-800 underline font-semibold"
              >
                {lang === 'es'
                  ? 'Recargar página'
                  : lang === 'pt'
                    ? 'Recarregar página'
                    : 'Reload page'}
              </button>
            )}
          </div>
        )}

        {/* Configuration warning */}
        {!isCdpConfigured && (
          <div className="mb-4 p-3 bg-[var(--fill-warning-light)] border border-yellow-200 rounded-lg text-yellow-800 text-sm">
            <strong>{t('setup.configRequired', lang)}</strong> {t('setup.configInstruction', lang)}
          </div>
        )}

        {/* Step 1: Phone Number */}
        {step === 'phone' && (
          <div>
            <h1 className="font-display text-2xl font-bold uppercase mb-4 text-[var(--text-primary)]">
              {t('setup.title', lang)}
            </h1>
            <p className="text-[var(--text-secondary)] mb-6">{t('setup.subtitle', lang)}</p>
            <div className="mb-4">
              <SippyPhoneInput
                value={phoneNumber}
                onChange={setPhoneNumber}
                locked={isPhoneLocked}
              />
            </div>
            {isPhoneLocked && (
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                {t('setup.phoneFromWhatsapp', lang)}
              </p>
            )}
            <ChannelPicker
              canSwitch={canSwitchChannel(phoneNumber)}
              isLoading={isLoading}
              disabled={
                !phoneNumber || phoneNumber.replace(/\D/g, '').length < 7 || !isCdpConfigured
              }
              lang={lang}
              onSend={handleSendOtp}
            />
          </div>
        )}

        {/* Step 2: OTP Verification */}
        {step === 'otp' && (
          <div>
            <h1 className="font-display text-2xl font-bold uppercase mb-4 text-[var(--text-primary)]">
              {t('setup.enterCode', lang)}
            </h1>
            <p className="text-[var(--text-secondary)] mb-6">
              {otpChannel === 'whatsapp'
                ? lang === 'es'
                  ? `Enviamos un codigo a tu WhatsApp (${phoneNumber})`
                  : lang === 'pt'
                    ? `Enviamos um codigo para seu WhatsApp (${phoneNumber})`
                    : `We sent a code to your WhatsApp (${phoneNumber})`
                : `${t('setup.codeSentTo', lang)} ${phoneNumber}`}
            </p>
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder={t('setup.codePlaceholder', lang)}
              maxLength={6}
              className="w-full p-3 border rounded-lg mb-4 text-center text-2xl tracking-widest text-[var(--text-primary)]"
            />
            <button
              onClick={handleVerifyOtp}
              disabled={isLoading || otp.length !== 6}
              className="w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? t('setup.verifying', lang) : t('setup.verify', lang)}
            </button>
            <ResendButton
              channel={otpChannel}
              isLoading={isLoading}
              lang={lang}
              onResend={() => handleSendOtp(otpChannel)}
            />
            <button
              onClick={() => setStep('phone')}
              className="w-full mt-2 text-[var(--text-secondary)] py-2"
            >
              {t('setup.back', lang)}
            </button>
          </div>
        )}

        {/* Step 3: Email (optional) */}
        {step === 'email' && (
          <div>
            <h1 className="font-display text-2xl font-bold uppercase mb-4 text-[var(--text-primary)]">
              {t('setup.emailTitle', lang)}
            </h1>
            <p className="text-[var(--text-secondary)] mb-6">{t('setup.emailSubtitle', lang)}</p>

            {!emailSent && (
              <>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('setup.emailPlaceholder', lang)}
                  className="w-full p-3 border rounded-lg mb-4 text-[var(--text-primary)]"
                />
                <button
                  onClick={handleSendEmailCode}
                  disabled={isLoading || !email}
                  className="w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? t('setup.emailSending', lang) : t('setup.emailSendCode', lang)}
                </button>
              </>
            )}

            {emailSent && !emailVerified && (
              <>
                <p className="text-[var(--text-secondary)] mb-4">
                  {t('setup.emailCodeSentTo', lang)} {email}
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value)}
                  placeholder={t('setup.emailCodePlaceholder', lang)}
                  maxLength={6}
                  className="w-full p-3 border rounded-lg mb-4 text-center text-2xl tracking-widest text-[var(--text-primary)]"
                />
                <button
                  onClick={handleVerifyEmailCode}
                  disabled={isLoading || !emailCode}
                  className="w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? t('setup.emailVerifying', lang) : t('setup.emailVerify', lang)}
                </button>
              </>
            )}

            {emailVerified && (
              <div className="text-center py-4">
                <div className="text-4xl mb-2">✅</div>
                <p className="text-semantic-success font-semibold">
                  {t('setup.emailVerified', lang)}
                </p>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  {t('setup.continuingSetup', lang)}
                </p>
              </div>
            )}

            {!emailVerified && (
              <button
                onClick={handleSkipEmail}
                className="w-full mt-4 text-[var(--text-secondary)] py-2 text-sm"
              >
                {t('setup.skipEmail', lang)}
              </button>
            )}
          </div>
        )}

        {/* Step 4: Terms of Service */}
        {step === 'tos' && (
          <div>
            <h1 className="font-display text-2xl font-bold uppercase mb-4 text-[var(--text-primary)]">
              {t('setup.tosTitle', lang)}
            </h1>
            <p className="text-[var(--text-secondary)] mb-6">{t('setup.tosSubtitle', lang)}</p>

            <a
              href={TOS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full p-4 mb-4 bg-[var(--bg-secondary)] border border-brand-primary/20 rounded-lg text-brand-primary font-semibold hover:bg-brand-primary-light transition-smooth text-center"
            >
              {t('setup.tosLink', lang)} ↗
            </a>

            <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer mb-6 transition-colors border-brand-primary/20 hover:border-brand-primary">
              <input
                type="checkbox"
                checked={tosChecked}
                onChange={(e) => {
                  setTosChecked(e.target.checked)
                  setError(null)
                }}
                className="mt-0.5 w-5 h-5 rounded border-brand-primary/30 text-brand-primary focus:ring-brand-primary"
              />
              <span className="text-[var(--text-primary)] text-sm">
                {t('setup.tosCheckbox', lang)}
              </span>
            </label>

            <button
              onClick={handleAcceptTos}
              disabled={isLoading || !tosChecked}
              className="w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '...' : t('setup.tosContinue', lang)}
            </button>
          </div>
        )}

        {/* Permission auto-creation (hidden step) */}
        {step === 'permission' && (
          <div className="text-center py-8">
            <p className="text-[var(--text-secondary)] animate-pulse">
              {t('setup.preparingWallet', lang)}
            </p>
          </div>
        )}

        {/* Step 5: Done */}
        {step === 'done' && (
          <div className="text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h1 className="font-display text-2xl font-bold uppercase mb-4 text-[var(--text-primary)]">
              {t('setup.allSet', lang)}
            </h1>
            <p className="text-[var(--text-secondary)] mb-6">{t('setup.walletReady', lang)}</p>

            {walletAddress && (
              <div className="bg-[var(--bg-tertiary)] p-4 rounded-lg text-left text-sm mb-6">
                <p className="font-semibold mb-2 text-[var(--text-primary)]">
                  {t('setup.yourWallet', lang)}
                </p>
                <p className="font-mono text-xs text-[var(--text-secondary)] break-all">
                  {walletAddress}
                </p>
              </div>
            )}

            <div className="bg-[var(--bg-tertiary)] p-4 rounded-lg text-left text-sm">
              <p className="font-semibold mb-2 text-[var(--text-primary)]">
                {t('setup.tryCommands', lang)}
              </p>
              <ul className="space-y-1 font-mono text-[var(--text-secondary)]">
                <li>• {t('setup.cmdBalance', lang)}</li>
                <li>• {t('setup.cmdSend', lang)}</li>
                <li>• {t('setup.cmdHistory', lang)}</li>
              </ul>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-[var(--text-secondary)]">
          <p>{t('setup.poweredBy', lang)}</p>
          {SIPPY_SPENDER_ADDRESS && (
            <p className="mt-1 font-mono text-[10px] truncate">Spender: {SIPPY_SPENDER_ADDRESS}</p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Gate component for bare /setup (no phone in URL).
 * Renders a phone input first, then mounts the correct provider after submission.
 */
function PhoneEntryGate() {
  const [submittedPhone, setSubmittedPhone] = useState<string | null>(null)
  const router = useRouter()
  const [lang] = useState<Language>(() => getStoredLanguage() || 'en')

  // Redirect to settings if user already has a valid session
  useEffect(() => {
    if (getFreshToken()) {
      router.replace('/settings')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!submittedPhone) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[var(--bg-primary)] panel-frame rounded-2xl p-8">
          <h1 className="font-display text-2xl font-bold uppercase mb-4 text-[var(--text-primary)]">
            {t('setup.title', lang)}
          </h1>
          <p className="text-[var(--text-secondary)] mb-6">{t('setup.subtitle', lang)}</p>
          <PhoneEntryForm onSubmit={setSubmittedPhone} lang={lang} />
        </div>
      </div>
    )
  }

  return (
    <CDPProviderCustomAuth>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
            <div className="text-[var(--text-secondary)]">Loading...</div>
          </div>
        }
      >
        <SetupContent phoneFromUrl={submittedPhone} />
      </Suspense>
    </CDPProviderCustomAuth>
  )
}

/**
 * Inline phone entry form used inside PhoneEntryGate.
 */
function PhoneEntryForm({ onSubmit, lang }: { onSubmit: (phone: string) => void; lang: Language }) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = () => {
    const formatted = phone.startsWith('+') ? phone : `+${phone}`
    if (isBlockedPrefix(formatted)) {
      setError(
        lang === 'es'
          ? 'Este país no está disponible.'
          : lang === 'pt'
            ? 'Este país não está disponível.'
            : 'This country is not available.'
      )
      return
    }
    if (formatted.replace(/\D/g, '').length < 7) {
      setError(
        lang === 'es'
          ? 'Número inválido.'
          : lang === 'pt'
            ? 'Número inválido.'
            : 'Invalid phone number.'
      )
      return
    }
    onSubmit(formatted)
  }

  return (
    <>
      {error && (
        <div className="mb-4 p-3 bg-[var(--fill-danger-light)] border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}
      <div className="mb-4">
        <SippyPhoneInput value={phone} onChange={setPhone} locked={false} />
      </div>
      <button
        onClick={handleSubmit}
        disabled={!phone || phone.replace(/\D/g, '').length < 7}
        className="w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {t('setup.sendCode', lang)}
      </button>
    </>
  )
}

function SetupPageInner() {
  const searchParams = useSearchParams()

  // Phone number from WhatsApp link
  const rawPhone = (searchParams.get('phone') || '').replace(/[^\d]/g, '')
  const phoneFromUrl = rawPhone ? `+${rawPhone}` : ''

  // No phone from URL → show phone entry gate (provider chosen after phone is known)
  if (!phoneFromUrl) {
    return <PhoneEntryGate />
  }

  // Phone from URL → mount provider immediately
  return (
    <CDPProviderCustomAuth>
      <SetupContent phoneFromUrl={phoneFromUrl} />
    </CDPProviderCustomAuth>
  )
}

export default function SetupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
          <div className="text-[var(--text-secondary)]">Loading...</div>
        </div>
      }
    >
      <SetupPageInner />
    </Suspense>
  )
}
