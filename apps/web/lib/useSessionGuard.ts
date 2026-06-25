'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  useAuthenticateWithJWT,
  useIsSignedIn,
  useCurrentUser,
  useSignOut,
} from '@coinbase/cdp-hooks'
import {
  getStoredToken,
  storeToken,
  clearToken,
  getFreshToken,
  isTokenExpired,
  getTokenSecondsRemaining,
  sendOtp,
  verifyOtp,
  type OtpChannel,
} from './auth'
import { isBlockedPrefix } from '@sippy/shared'
import { getDefaultChannel, canSwitchChannel } from './auth-mode'

type ReAuthStep = 'phone' | 'otp'

type CDPCurrentUser = ReturnType<typeof useCurrentUser>['currentUser']
type CDPSignOut = ReturnType<typeof useSignOut>['signOut']

// CDP's auth subsystem can still be initializing when the guard mounts
// ("SDK not initialized"). That's transient, so retry the JWT restore a few
// times before clearing — otherwise an unlucky init race silently logs out a
// user holding a perfectly valid token. Mirrors the setup page's cdpInitAttempts.
const MAX_AUTH_ATTEMPTS = 4
const AUTH_RETRY_DELAY_MS = 800

export interface SessionGuardResult {
  // Core return values
  isAuthenticated: boolean
  token: string | null
  requireReauth: () => void

  // Session check state
  isCheckingSession: boolean

  // Expiry warning (< 3 min)
  expiryWarning: boolean

  // Re-auth UI state
  reAuthVisible: boolean
  reAuthStep: ReAuthStep
  reAuthPhone: string
  reAuthOtp: string
  reAuthError: string | null
  reAuthLoading: boolean
  reAuthChannel: OtpChannel
  reAuthCanSwitchChannel: boolean

  // Re-auth UI handlers
  setReAuthPhone: (v: string) => void
  setReAuthOtp: (v: string) => void
  handleReAuthSendOtp: (channelOverride?: OtpChannel) => Promise<void>
  handleReAuthVerifyOtp: () => Promise<void>
  dismissReAuth: () => void

  // Re-exported CDP state
  currentUser: CDPCurrentUser
  signOut: CDPSignOut
}

export function useSessionGuard(): SessionGuardResult {
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== 'undefined' ? getStoredToken() : null
  )
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [hasCheckedSession, setHasCheckedSession] = useState(false)
  const [expiryWarning, setExpiryWarning] = useState(false)
  const [reAuthVisible, setReAuthVisible] = useState(false)
  const [reAuthStep, setReAuthStep] = useState<ReAuthStep>('phone')
  const [reAuthPhone, setReAuthPhone] = useState('')
  const [reAuthOtp, setReAuthOtp] = useState('')
  const [reAuthError, setReAuthError] = useState<string | null>(null)
  const [reAuthLoading, setReAuthLoading] = useState(false)
  const [reAuthChannel, setReAuthChannel] = useState<OtpChannel>('sms')

  const prevIsSignedInRef = useRef<boolean | undefined>(undefined)
  const authAttemptsRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [authRetryTick, setAuthRetryTick] = useState(0)

  const { authenticateWithJWT } = useAuthenticateWithJWT()
  const { isSignedIn } = useIsSignedIn()
  const { currentUser } = useCurrentUser()
  const { signOut } = useSignOut()

  // Session check on mount — mirrors existing wallet/settings logic
  useEffect(() => {
    let cancelled = false
    const checkExistingSession = async () => {
      if (hasCheckedSession) return
      if (isSignedIn === undefined) return
      if (isSignedIn && !currentUser) return

      if (!isSignedIn) {
        const storedJwt = getStoredToken()
        if (storedJwt && !isTokenExpired(storedJwt)) {
          // Restore CDP session via JWT. A throw here is almost always the CDP
          // SDK still initializing ("SDK not initialized"), not a bad token —
          // expiry is already ruled out above. Retry before clearing so the
          // init race can't nuke a valid token (silent logout); only give up
          // and clear once the attempts are exhausted.
          try {
            await authenticateWithJWT()
            authAttemptsRef.current = 0
            return
          } catch (err) {
            if (cancelled) return
            authAttemptsRef.current += 1
            if (authAttemptsRef.current < MAX_AUTH_ATTEMPTS) {
              retryTimerRef.current = setTimeout(
                () => setAuthRetryTick((n) => n + 1),
                AUTH_RETRY_DELAY_MS
              )
              return
            }
            console.warn('Session recovery: JWT auth failed after retries, clearing token', err)
            clearToken()
          }
        }
        setHasCheckedSession(true)
        setIsCheckingSession(false)
        return
      }

      setHasCheckedSession(true)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const addr =
        (currentUser as any)?.evmSmartAccounts?.[0] || (currentUser as any)?.evmAccounts?.[0]
      if (!addr) {
        await signOut()
        setIsCheckingSession(false)
        return
      }

      const freshToken = getFreshToken()
      if (!freshToken) {
        clearToken()
        await signOut()
        setIsCheckingSession(false)
        return
      }

      const secondsRemaining = getTokenSecondsRemaining(freshToken)
      if (secondsRemaining > 0 && secondsRemaining <= 180) {
        setExpiryWarning(true)
      }

      setToken(freshToken)
      setIsAuthenticated(true)
      setIsCheckingSession(false)
    }

    checkExistingSession()
    return () => {
      cancelled = true
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }
  }, [isSignedIn, currentUser, hasCheckedSession, authenticateWithJWT, authRetryTick])

  // Detect CDP sign-out (isSignedIn transitions true → false) and update auth state
  useEffect(() => {
    if (prevIsSignedInRef.current === true && isSignedIn === false && isAuthenticated) {
      setIsAuthenticated(false)
      setToken(null)
    }
    prevIsSignedInRef.current = isSignedIn
  }, [isSignedIn, isAuthenticated])

  // Expiry polling every 30s
  useEffect(() => {
    if (!isAuthenticated) return

    const interval = setInterval(() => {
      const storedToken = getStoredToken()
      if (!storedToken || isTokenExpired(storedToken)) {
        setIsAuthenticated(false)
        setToken(null)
        setReAuthVisible(true)
        setReAuthStep('phone')
        setReAuthError(null)
        return
      }

      const secondsRemaining = getTokenSecondsRemaining(storedToken)
      setExpiryWarning(secondsRemaining > 0 && secondsRemaining <= 180)
    }, 30000)

    return () => clearInterval(interval)
  }, [isAuthenticated])

  const requireReauth = useCallback(() => {
    setReAuthVisible(true)
    setReAuthStep('phone')
    setReAuthError(null)
  }, [])

  const handleReAuthSendOtp = useCallback(
    async (channelOverride?: OtpChannel) => {
      setReAuthLoading(true)
      setReAuthError(null)
      try {
        const phone = reAuthPhone.startsWith('+') ? reAuthPhone : `+${reAuthPhone}`
        if (isBlockedPrefix(phone)) {
          setReAuthError('This country is not available.')
          return
        }

        const channel = channelOverride ?? getDefaultChannel(phone)
        setReAuthChannel(channel)

        if (isSignedIn) await signOut()
        await sendOtp(phone, channel)
        setReAuthStep('otp')
      } catch (err) {
        setReAuthError(err instanceof Error ? err.message : 'Failed to send OTP')
      } finally {
        setReAuthLoading(false)
      }
    },
    [reAuthPhone, isSignedIn, signOut]
  )

  const handleReAuthVerifyOtp = useCallback(async () => {
    setReAuthLoading(true)
    setReAuthError(null)
    try {
      const newToken = await verifyOtp(reAuthPhone, reAuthOtp)
      storeToken(newToken)
      await authenticateWithJWT()
      setToken(newToken)
      setIsAuthenticated(true)
      setExpiryWarning(false)
      setReAuthVisible(false)
      setReAuthStep('phone')
      setReAuthPhone('')
      setReAuthOtp('')
    } catch (err) {
      setReAuthError(err instanceof Error ? err.message : 'Failed to verify OTP')
    } finally {
      setReAuthLoading(false)
    }
  }, [reAuthPhone, reAuthOtp, authenticateWithJWT])

  const dismissReAuth = useCallback(() => {
    setReAuthVisible(false)
  }, [])

  const phone = reAuthPhone.startsWith('+') ? reAuthPhone : `+${reAuthPhone}`

  return {
    isAuthenticated,
    token,
    requireReauth,
    isCheckingSession,
    expiryWarning,
    reAuthVisible,
    reAuthStep,
    reAuthPhone,
    reAuthOtp,
    reAuthError,
    reAuthLoading,
    reAuthChannel,
    reAuthCanSwitchChannel: reAuthPhone ? canSwitchChannel(phone) : false,
    setReAuthPhone,
    setReAuthOtp,
    handleReAuthSendOtp,
    handleReAuthVerifyOtp,
    dismissReAuth,
    currentUser,
    signOut,
  }
}
