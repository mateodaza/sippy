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
  sendEmailLogin,
  verifyEmailLogin,
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
import {
  linkEvent,
  markPoapClaimed,
  readAndPersistEventSlug,
  readAndPersistEventSource,
  clearEventSlug,
  setPoapClaimIntent,
  getPoapClaimIntent,
  clearPoapClaimIntent,
  type LinkEventResponse,
  type PoapClaimStatus,
} from '../../lib/events'

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

type Step =
  | 'phone'
  | 'otp'
  | 'email'
  | 'tos'
  | 'permission'
  | 'done'
  | 'event-tagged'
  | 'email-login'
  | 'email-login-otp'
// Onboarding flow: phone → otp → tos → done. Recovery email is intentionally
// NOT collected here — users verify email later in Settings to lift their daily
// limit. The 'email' / 'email-login' steps/components are kept in this file:
// 'email-login' is the returning-user login path; 'email' is legacy and unused
// in onboarding.
// 'permission' is hidden — auto-created after ToS acceptance.
const STEPS: Step[] = ['phone', 'otp', 'tos', 'done']

// New users haven't verified email yet, so they onboard at the unverified daily
// tier. Asking CDP for the $500/day verified limit would create an on-chain
// permission the backend correctly rejects for unverified users, which strands
// onboarding. Email verification in Settings lifts the limit afterward.
const UNVERIFIED_DAILY_LIMIT_USDC = '50'

const TOS_VERSION = '1.0'
const TOS_URL = 'https://www.sippy.lat/terms'

/**
 * Reusable card shown on success screens to confirm the user is tagged to an
 * event. Renders the POAP claim CTA when a URL is configured and reflects
 * already-claimed state.
 */
function EventCard({
  linkedEvent,
  lang,
  onPoapClaim,
}: {
  linkedEvent: Extract<LinkEventResponse, { linked: true }>
  lang: Language
  onPoapClaim: () => void
}) {
  return (
    <div className="bg-[var(--bg-tertiary)] p-4 rounded-lg text-left text-sm mb-6 border border-brand-primary/20">
      <div className="text-3xl mb-2">🎟️</div>
      <p className="text-[var(--text-secondary)] mb-1">{t('setup.eventCheckedIn', lang)}</p>
      <p className="font-display text-lg font-bold mb-3 text-[var(--text-primary)]">
        {linkedEvent.event.name}
      </p>
      {linkedEvent.poapClaimUrl &&
        (linkedEvent.poapClaimed ? (
          <span className="inline-block bg-[var(--bg-secondary)] text-[var(--text-secondary)] px-4 py-2 rounded-lg font-semibold">
            ✓ {t('setup.poapAlreadyClaimed', lang)}
          </span>
        ) : (
          <a
            href={linkedEvent.poapClaimUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onPoapClaim}
            className="inline-block bg-brand-primary text-white px-4 py-2 rounded-lg font-semibold hover:bg-brand-primary-hover"
          >
            {t('setup.claimPoap', lang)} →
          </a>
        ))}
    </div>
  )
}

/**
 * Event linking call sites — ALL THREE are guarded by `linkEventFiredRef` so
 * exactly one network call goes out per mount. Order matters: if you add a
 * 4th site, decide where in this priority list it sits before reusing the
 * ref, or add a dedicated ref.
 *
 *   1. Retroactive recovery (already-onboarded user scans event QR)
 *      └─ advanceToCorrectStep:  status.hasPermission && eventSlug
 *         → linkEvent(slug, 'returning', source); renders 'event-tagged'
 *
 *   2. Done-step tagging (user finishes onboarding here)
 *      └─ useEffect [step, eventSlug]:  step === 'done' && eventSlug
 *         → linkEvent(slug, 'done', source); fire-and-forget
 *
 *   3. Mount-time recovery (session exists but we didn't hit (1) above)
 *      └─ session-recovery effect ~line 511:  existing session + eventSlug
 *         → linkEvent(slug, 'returning', source)
 *
 * Each site sets `linkEventFiredRef.current = true` BEFORE awaiting the
 * promise so a re-render mid-flight can't double-fire. The ref is never
 * reset within a mount.
 */
function SetupContent({
  phoneFromUrl: phoneFromUrlProp,
  eventSlugFromUrl,
  eventSourceFromUrl,
}: {
  phoneFromUrl: string
  eventSlugFromUrl: string | null
  eventSourceFromUrl: string | null
}) {
  const router = useRouter()

  const phoneFromUrl = phoneFromUrlProp

  // Event slug + optional source hydrated from URL or sessionStorage, persisted
  // across refreshes. Resolved on mount; server validates and silently drops
  // unknown slugs / invalid sources.
  const [eventSlug, setEventSlug] = useState<string | null>(null)
  const [eventSource, setEventSource] = useState<string | null>(null)
  const linkEventFiredRef = useRef(false)
  const [linkedEvent, setLinkedEvent] = useState<LinkEventResponse | null>(null)

  useEffect(() => {
    setEventSlug(readAndPersistEventSlug(eventSlugFromUrl))
    setEventSource(readAndPersistEventSource(eventSourceFromUrl))
  }, [eventSlugFromUrl, eventSourceFromUrl])

  // Redirect to settings if user already has a valid (non-expired) session.
  // Exception: if there's an event slug to process retroactively, stay mounted
  // so the recovery effect can fire linkEvent('returning') and render the
  // event-tagged screen instead of bouncing.
  useEffect(() => {
    if (!phoneFromUrl && getFreshToken() && !eventSlugFromUrl) {
      router.replace('/settings')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [step, setStep] = useState<Step>('phone')
  const [phoneNumber, setPhoneNumber] = useState(phoneFromUrl)
  const [otp, setOtp] = useState('')
  // dailyLimit is fixed to the unverified tier while email verification is skipped.
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
  const [loginEmail, setLoginEmail] = useState('')
  const [loginEmailCode, setLoginEmailCode] = useState('')
  const [loginEmailSent, setLoginEmailSent] = useState(false)
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
   * Check wallet-status to advance to the correct step.
   * Used after wallet registration to skip steps for returning users.
   *
   * Decision tree:
   *   hasPermission   → redirect to /settings (fully onboarded)
   *   tosAccepted     → permission step (resume: ToS done, permission missing)
   *   otherwise       → tos step (fresh user must accept ToS)
   */
  const advanceToCorrectStep = async (accessToken: string): Promise<boolean> => {
    if (!BACKEND_URL) {
      setStep('tos')
      return true
    }
    try {
      const headers = { Authorization: `Bearer ${accessToken}` }

      const statusResponse = await fetch(`${BACKEND_URL}/api/wallet-status`, { headers })
      if (!statusResponse.ok) {
        setStep('tos')
        return true
      }
      const status = await statusResponse.json()

      if (status.hasPermission) {
        // Retroactive event tag — already-onboarded user scanning the event QR.
        // Fires linkEvent with step='returning' so we can distinguish them from
        // users who actually onboarded at the event. Then we render the
        // event-tagged screen instead of redirecting.
        if (eventSlug && !linkEventFiredRef.current) {
          linkEventFiredRef.current = true
          try {
            const result = await linkEvent(eventSlug, accessToken, 'returning', eventSource)
            setLinkedEvent(result)
            clearEventSlug()
            if (result.linked) {
              setStep('event-tagged')
              return true
            }
          } catch (err) {
            console.warn('[event] retroactive link failed (non-blocking):', err)
            clearEventSlug()
          }
        }
        router.replace('/settings')
        return true
      }
      if (status.tosAccepted) {
        // ToS already accepted but no spend permission yet — resume at the
        // hidden permission step (auto-creates the permission).
        setStep('permission')
        return true
      }
    } catch (err) {
      console.error('advanceToCorrectStep failed:', err)
    }
    // Fresh user: collect ToS acceptance. Recovery email is intentionally not
    // collected during onboarding — Settings exposes it afterward to lift the
    // daily limit.
    setStep('tos')
    return true
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

  // Reconcile the UI with a markPoapClaimed server response. Pulled out so
  // both the click handler and the retry-on-remount effect can share it.
  //
  // - 'claimed' / 'already-claimed': server confirmed → drop the intent flag
  // - 'not-linked':                  no link row will ever exist → revert
  //                                  the optimistic UI flip and drop intent
  // - 'error':                       transient (often venue Wi-Fi) → leave
  //                                  the intent flag in place so the next
  //                                  mount retries
  const reconcilePoapClaim = (status: PoapClaimStatus) => {
    if (status === 'claimed' || status === 'already-claimed') {
      clearPoapClaimIntent()
      return
    }
    if (status === 'not-linked') {
      console.warn('[event] poap-claim: user not linked to event — reverting UI')
      clearPoapClaimIntent()
      setLinkedEvent((prev) => (prev && prev.linked ? { ...prev, poapClaimed: false } : prev))
      return
    }
    // 'error' — keep the intent flag for the retry effect to pick up later.
  }

  // Fired when the user clicks "Claim your POAP". Best-effort — fires the
  // markPoapClaimed endpoint and reflects the recorded state locally.
  //
  // Race we're guarding: the `<a target="_blank">` opens the POAP page
  // immediately, while our fetch races in parallel on flaky venue Wi-Fi. If
  // our fetch drops, the user gets the POAP but our DB never records the
  // click, the next visit still shows "Claim your POAP", and analytics
  // under-count claims.
  //
  // Mitigation:
  //  1. Flip the UI to claimed optimistically (best UX bet — claim almost
  //     always succeeds).
  //  2. Persist a localStorage intent flag so a subsequent mount can retry
  //     the server call if it dropped.
  //  3. Only revert on a definitive 'not-linked' response.
  const handlePoapClaim = () => {
    if (!linkedEvent?.linked) return
    const slug = linkedEvent.event.slug
    const token = getFreshToken()
    if (!token) return

    setPoapClaimIntent(slug)
    setLinkedEvent((prev) => (prev && prev.linked ? { ...prev, poapClaimed: true } : prev))

    void markPoapClaimed(slug, token).then(reconcilePoapClaim)
  }

  // Retry-on-remount for dropped POAP claims. If a prior click left a
  // localStorage intent flag but our state still shows poapClaimed=false
  // (i.e. the fetch dropped before we could record it), fire markPoapClaimed
  // again and reconcile. Slug mismatch means stale intent from a different
  // event — just clear it.
  const poapRetryFiredRef = useRef(false)
  useEffect(() => {
    if (poapRetryFiredRef.current) return
    if (!linkedEvent?.linked) return
    const intentSlug = getPoapClaimIntent()
    if (!intentSlug) return

    if (intentSlug !== linkedEvent.event.slug) {
      clearPoapClaimIntent()
      return
    }
    if (linkedEvent.poapClaimed) {
      // Server already confirmed via the link payload — no retry needed.
      clearPoapClaimIntent()
      return
    }

    const token = getFreshToken()
    if (!token) return

    poapRetryFiredRef.current = true
    // Optimistically reflect the prior click so the UI doesn't briefly say
    // "Claim your POAP" while we retry.
    setLinkedEvent((prev) => (prev && prev.linked ? { ...prev, poapClaimed: true } : prev))
    void markPoapClaimed(linkedEvent.event.slug, token).then(reconcilePoapClaim)
  }, [linkedEvent]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tag the user to their event once setup is complete. Fire-and-forget —
  // failure is non-blocking. The server silently rejects unknown/inactive slugs.
  useEffect(() => {
    if (step !== 'done') return
    if (linkEventFiredRef.current) return
    if (!eventSlug) return
    const token = getFreshToken()
    if (!token) return
    linkEventFiredRef.current = true
    linkEvent(eventSlug, token, 'done', eventSource)
      .then((result) => {
        setLinkedEvent(result)
        if (result.linked) {
          console.log('[event] linked to', result.event.slug)
        }
      })
      .catch((err) => {
        console.warn('[event] link failed (non-blocking):', err)
      })
      .finally(() => {
        // Clear the slug from sessionStorage once we've attempted to link.
        // Prevents a subsequent /setup in the same tab from inheriting it
        // and tagging the next user to the prior event.
        clearEventSlug()
      })
  }, [step, eventSlug])

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
              // Fully onboarded — usually go straight to settings, but if the
              // user is here via a retroactive event QR, run linkEvent first
              // and render the event-tagged screen.
              //
              // Read slug/source fresh from URL-or-sessionStorage rather than
              // the `eventSlug`/`eventSource` state, because this effect's
              // closure was created on first render when both states are still
              // null (the hydration effect at line 204 runs in parallel and
              // its update isn't visible to this closure). The pure readers
              // are idempotent — safe to call twice.
              const slugForLink = readAndPersistEventSlug(eventSlugFromUrl)
              const sourceForLink = readAndPersistEventSource(eventSourceFromUrl)
              if (slugForLink && !linkEventFiredRef.current) {
                linkEventFiredRef.current = true
                try {
                  const result = await linkEvent(
                    slugForLink,
                    accessToken,
                    'returning',
                    sourceForLink
                  )
                  setLinkedEvent(result)
                  clearEventSlug()
                  if (result.linked) {
                    setStep('event-tagged')
                    setIsCheckingSession(false)
                    return
                  }
                } catch (err) {
                  console.warn('[event] retroactive link failed (non-blocking):', err)
                  clearEventSlug()
                }
              }
              router.replace('/settings')
              return
            } else if (!status.tosAccepted) {
              // ToS not yet accepted — it must be accepted before any spend
              // permission can be created or registered. Resume at the ToS step.
              // Mirrors the server-side gate on /api/register-permission so a
              // mid-onboarding reload can't bypass ToS.
              setStep('tos')
            } else {
              // ToS accepted but no permission registered yet. Attempt to register
              // an existing on-chain permission before asking the user to create a
              // new one — handles the case where a permission was signed on-chain
              // but registration was interrupted (tab close, network error).
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
                }
              } catch (err) {
                console.error('Permission recovery check failed:', err)
              }
              setStep('permission')
            }
          } else {
            // wallet-status returned non-OK — can't confirm ToS, so resume at the
            // ToS step (safe default; the backend gate would reject a permission
            // anyway if ToS isn't accepted).
            setStep('tos')
          }
        } else {
          // No backend — resume at the ToS step (ToS is the first onboarding gate).
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
        setStep('tos')
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
          setStep('tos')
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

  // Email login: send code
  const handleSendEmailLogin = async () => {
    setIsLoading(true)
    setError(null)
    try {
      await sendEmailLogin(loginEmail)
      setLoginEmailSent(true)
      setStep('email-login-otp')
    } catch {
      // Endpoint always returns 200, so this only fires on network errors
      setError(t('setup.errEmailLogin', lang))
    } finally {
      setIsLoading(false)
    }
  }

  // Email login: verify code and authenticate
  const handleVerifyEmailLogin = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const token = await verifyEmailLogin(loginEmail, loginEmailCode)
      storeToken(token)

      const { user } = await authenticateWithJWT()
      const smartAccountAddress = user?.evmSmartAccounts?.[0] || user?.evmAccounts?.[0]
      if (smartAccountAddress) {
        setWalletAddress(smartAccountAddress)
      }

      await advanceToCorrectStep(token)
    } catch {
      setError(t('setup.errEmailLogin', lang))
    } finally {
      setIsLoading(false)
    }
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

      // Permission step is hidden — show the spinner and let its effect
      // auto-create the spend permission at the unverified daily limit.
      setStep('permission')
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

      const tierLimit = UNVERIFIED_DAILY_LIMIT_USDC

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
        {/* Progress indicator — hidden on terminal screens not in the linear flow */}
        {step !== 'event-tagged' && step !== 'permission' && (
          <div className="mb-8 text-sm text-[var(--text-secondary)] font-medium tracking-wide">
            {{ en: 'Step', es: 'Paso', pt: 'Passo' }[lang] || 'Step'} {STEPS.indexOf(step) + 1} of{' '}
            {STEPS.length}
          </div>
        )}

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
            <div className="mt-6 text-center">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-[var(--text-secondary)]/20" />
                <span className="text-xs text-[var(--text-secondary)]">
                  {lang === 'es' ? 'o' : lang === 'pt' ? 'ou' : 'or'}
                </span>
                <div className="flex-1 h-px bg-[var(--text-secondary)]/20" />
              </div>
              <button
                onClick={() => {
                  setError(null)
                  setLoginEmail('')
                  setLoginEmailCode('')
                  setLoginEmailSent(false)
                  setStep('email-login')
                }}
                className="text-sm text-brand-primary hover:underline"
              >
                {t('setup.emailLoginLink', lang)} &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Email Login: enter email */}
        {step === 'email-login' && (
          <div>
            <h1 className="font-display text-2xl font-bold uppercase mb-4 text-[var(--text-primary)]">
              {t('setup.emailLoginTitle', lang)}
            </h1>
            <p className="text-[var(--text-secondary)] mb-6">
              {t('setup.emailLoginSubtitle', lang)}
            </p>
            <input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full p-3 border rounded-lg mb-4 text-[var(--text-primary)]"
            />
            <button
              onClick={handleSendEmailLogin}
              disabled={isLoading || !loginEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)}
              className="w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? t('setup.emailLoginSending', lang) : t('setup.emailLoginSendCode', lang)}
            </button>
            <button
              onClick={() => {
                setError(null)
                setStep('phone')
              }}
              className="w-full mt-2 text-[var(--text-secondary)] py-2 text-sm"
            >
              {t('setup.emailLoginBack', lang)}
            </button>
          </div>
        )}

        {/* Email Login: enter OTP */}
        {step === 'email-login-otp' && (
          <div>
            <h1 className="font-display text-2xl font-bold uppercase mb-4 text-[var(--text-primary)]">
              {t('setup.emailLoginTitle', lang)}
            </h1>
            <p className="text-[var(--text-secondary)] mb-6">
              {t('setup.emailLoginCodeSent', lang)}
            </p>
            <input
              type="text"
              inputMode="numeric"
              value={loginEmailCode}
              onChange={(e) => setLoginEmailCode(e.target.value.replace(/\D/g, ''))}
              placeholder={t('setup.codePlaceholder', lang)}
              maxLength={6}
              className="w-full p-3 border rounded-lg mb-4 text-center text-2xl tracking-widest text-[var(--text-primary)]"
            />
            <button
              onClick={handleVerifyEmailLogin}
              disabled={isLoading || loginEmailCode.length !== 6}
              className="w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? t('setup.emailLoginVerifying', lang) : t('setup.emailLoginVerify', lang)}
            </button>
            <button
              onClick={() => {
                setError(null)
                setLoginEmailCode('')
                setStep('email-login')
              }}
              className="w-full mt-2 text-[var(--text-secondary)] py-2 text-sm"
            >
              {t('setup.back', lang)}
            </button>
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

            {linkedEvent?.linked && (
              <EventCard linkedEvent={linkedEvent} lang={lang} onPoapClaim={handlePoapClaim} />
            )}

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

        {/* Retroactive event tag — user was already onboarded when they scanned */}
        {step === 'event-tagged' && (
          <div className="text-center">
            <div className="text-6xl mb-4">🎟️</div>
            <h1 className="font-display text-2xl font-bold uppercase mb-4 text-[var(--text-primary)]">
              {t('setup.eventTaggedTitle', lang)}
            </h1>
            <p className="text-[var(--text-secondary)] mb-6">{t('setup.eventTaggedBody', lang)}</p>

            {linkedEvent?.linked && (
              <EventCard linkedEvent={linkedEvent} lang={lang} onPoapClaim={handlePoapClaim} />
            )}

            <button
              onClick={() => router.replace('/settings')}
              className="w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover"
            >
              {t('setup.continueToWallet', lang)}
            </button>
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
function PhoneEntryGate({
  eventSlugFromUrl,
  eventSourceFromUrl,
}: {
  eventSlugFromUrl: string | null
  eventSourceFromUrl: string | null
}) {
  const [submittedPhone, setSubmittedPhone] = useState<string | null>(null)
  const router = useRouter()
  const [lang] = useState<Language>(() => getStoredLanguage() || 'en')

  // Already-onboarded user with an event slug: mount SetupContent so the
  // recovery effect can fire linkEvent('returning') and render the
  // event-tagged screen. Without a slug, just go straight to /settings.
  const hasFreshToken = typeof window !== 'undefined' ? !!getFreshToken() : false
  const shouldMountForRetroactive = hasFreshToken && !!eventSlugFromUrl

  useEffect(() => {
    if (hasFreshToken && !eventSlugFromUrl) {
      router.replace('/settings')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (shouldMountForRetroactive) {
    return (
      <CDPProviderCustomAuth>
        <Suspense
          fallback={
            <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
              <div className="text-[var(--text-secondary)]">Loading...</div>
            </div>
          }
        >
          <SetupContent
            phoneFromUrl=""
            eventSlugFromUrl={eventSlugFromUrl}
            eventSourceFromUrl={eventSourceFromUrl}
          />
        </Suspense>
      </CDPProviderCustomAuth>
    )
  }

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
        <SetupContent
          phoneFromUrl={submittedPhone}
          eventSlugFromUrl={eventSlugFromUrl}
          eventSourceFromUrl={eventSourceFromUrl}
        />
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

  // Event slug from share link (e.g. ?event=pizza-day-ctg-2026). Optional and
  // independent of phone — server-validated; unknown slugs are silently dropped.
  const eventSlugFromUrl = (searchParams.get('event') || '').trim() || null

  // Optional channel attribution. Validated server-side; junk silently dropped.
  const eventSourceFromUrl = (searchParams.get('source') || '').trim() || null

  // No phone from URL → show phone entry gate (provider chosen after phone is known)
  if (!phoneFromUrl) {
    return (
      <PhoneEntryGate eventSlugFromUrl={eventSlugFromUrl} eventSourceFromUrl={eventSourceFromUrl} />
    )
  }

  // Phone from URL → mount provider immediately
  return (
    <CDPProviderCustomAuth>
      <SetupContent
        phoneFromUrl={phoneFromUrl}
        eventSlugFromUrl={eventSlugFromUrl}
        eventSourceFromUrl={eventSourceFromUrl}
      />
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
