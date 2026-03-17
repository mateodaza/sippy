'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  useAuthenticateWithJWT,
  useIsSignedIn,
  useCurrentUser,
  useSignOut,
  useSignInWithSms,
  useVerifySmsOTP,
  useGetAccessToken,
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
} from './auth'
import { isBlockedPrefix, isNANP } from '@sippy/shared'

type ReAuthStep = 'phone' | 'otp'

type CDPCurrentUser = ReturnType<typeof useCurrentUser>['currentUser']
type CDPSignOut = ReturnType<typeof useSignOut>['signOut']

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

  // Re-auth UI handlers
  setReAuthPhone: (v: string) => void
  setReAuthOtp: (v: string) => void
  handleReAuthSendOtp: () => Promise<void>
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
  const [reAuthFlowId, setReAuthFlowId] = useState<string | null>(null)

  const prevIsSignedInRef = useRef<boolean | undefined>(undefined)

  const { authenticateWithJWT } = useAuthenticateWithJWT()
  const { isSignedIn } = useIsSignedIn()
  const { currentUser } = useCurrentUser()
  const { signOut } = useSignOut()
  const { signInWithSms } = useSignInWithSms()
  const { verifySmsOTP } = useVerifySmsOTP()
  const { getAccessToken } = useGetAccessToken()

  // Session check on mount — mirrors existing wallet/settings logic
  useEffect(() => {
    const checkExistingSession = async () => {
      if (hasCheckedSession) return
      if (isSignedIn === undefined) return
      if (isSignedIn && !currentUser) return

      if (!isSignedIn) {
        // CDP hooks may not have settled yet (e.g. navigating from setup).
        // If we have a valid JWT, re-authenticate with CDP before giving up.
        const storedJwt = getStoredToken()
        if (storedJwt && !isTokenExpired(storedJwt)) {
          try {
            await authenticateWithJWT()
            // authenticateWithJWT will cause isSignedIn to flip true,
            // triggering this effect again. Don't set hasCheckedSession yet
            // so the next run can proceed to the token-validation path.
            return
          } catch (err) {
            // JWT auth failed — clear stale token and fall through
            console.warn('Session recovery: JWT auth failed, clearing token', err)
            clearToken()
          }
        }
        setHasCheckedSession(true)
        setIsCheckingSession(false)
        return
      }

      setHasCheckedSession(true)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const addr = (currentUser as any)?.evmSmartAccounts?.[0] || (currentUser as any)?.evmAccounts?.[0]
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
  }, [isSignedIn, currentUser, hasCheckedSession, authenticateWithJWT])

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

  const handleReAuthSendOtp = useCallback(async () => {
    setReAuthLoading(true)
    setReAuthError(null)
    try {
      const phone = reAuthPhone.startsWith('+') ? reAuthPhone : `+${reAuthPhone}`
      if (isBlockedPrefix(phone)) {
        setReAuthError('This country is not available.')
        return
      }

      if (isNANP(phone)) {
        const result = await signInWithSms({ phoneNumber: phone })
        setReAuthFlowId(result.flowId)
      } else {
        await sendOtp(reAuthPhone)
      }
      setReAuthStep('otp')
    } catch (err) {
      setReAuthError(err instanceof Error ? err.message : 'Failed to send OTP')
    } finally {
      setReAuthLoading(false)
    }
  }, [reAuthPhone, signInWithSms])

  const handleReAuthVerifyOtp = useCallback(async () => {
    setReAuthLoading(true)
    setReAuthError(null)
    try {
      const phone = reAuthPhone.startsWith('+') ? reAuthPhone : `+${reAuthPhone}`
      let newToken: string

      if (isNANP(phone) && reAuthFlowId) {
        await verifySmsOTP({ flowId: reAuthFlowId, otp: reAuthOtp })
        const cdpToken = await getAccessToken()
        if (!cdpToken) {
          // CDP session is now inconsistent (verifySmsOTP succeeded but no token).
          // Clean up CDP state before surfacing the error.
          await signOut()
          throw new Error('Failed to get CDP access token. Please try again.')
        }

        const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
        const res = await fetch(`${BACKEND_URL}/api/auth/exchange-cdp-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cdpAccessToken: cdpToken }),
        })
        if (!res.ok) throw new Error('Failed to exchange CDP token')
        const data = await res.json()
        newToken = data.token
      } else {
        newToken = await verifyOtp(reAuthPhone, reAuthOtp)
      }

      storeToken(newToken)
      await authenticateWithJWT()
      setToken(newToken)
      setIsAuthenticated(true)
      setExpiryWarning(false)
      setReAuthVisible(false)
      setReAuthStep('phone')
      setReAuthPhone('')
      setReAuthOtp('')
      setReAuthFlowId(null)
    } catch (err) {
      setReAuthError(err instanceof Error ? err.message : 'Failed to verify OTP')
    } finally {
      setReAuthLoading(false)
    }
  }, [reAuthPhone, reAuthOtp, reAuthFlowId, authenticateWithJWT, verifySmsOTP, getAccessToken])

  const dismissReAuth = useCallback(() => {
    setReAuthVisible(false)
  }, [])

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
    setReAuthPhone,
    setReAuthOtp,
    handleReAuthSendOtp,
    handleReAuthVerifyOtp,
    dismissReAuth,
    currentUser,
    signOut,
  }
}
