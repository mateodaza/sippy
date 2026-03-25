'use client'

import { useEffect, useState, Suspense } from 'react'
import { useParams } from 'next/navigation'
import { ProfileHeader } from '@/components/profile/ProfileHeader'
import { ActivityList } from '@/components/activity/ActivityList'
import {
  getBalances,
  getActivity,
  type Balance,
  type NormalizedTransaction,
} from '@/lib/blockscout'
import { useSessionGuard } from '@/lib/useSessionGuard'
import { getStoredToken } from '@/lib/auth'
import { Language, getStoredLanguage, t } from '@/lib/i18n'
import { SippyPhoneInput } from '@/components/ui/phone-input'
import { ChannelPicker, ResendButton } from '@/components/shared/ChannelPicker'
import { CDPProviderDefault } from '../../providers/cdp-provider'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''

/**
 * Extract phone from JWT sub claim (client-side only, not for security).
 */
function getPhoneFromToken(token: string): string | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4 !== 0) base64 += '='
    const payload = JSON.parse(atob(base64))
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

function normalizeDigits(phone: string): string {
  return phone.replace(/\D/g, '')
}

function ProfileContent() {
  const params = useParams()
  const rawPhone = decodeURIComponent(params.phone as string)
  const [lang] = useState<Language>(() => getStoredLanguage() || 'en')

  const {
    isAuthenticated,
    isCheckingSession,
    reAuthStep,
    reAuthPhone,
    reAuthOtp,
    reAuthError,
    reAuthLoading,
    setReAuthPhone,
    setReAuthOtp,
    handleReAuthSendOtp,
    handleReAuthVerifyOtp,
    reAuthChannel,
    reAuthCanSwitchChannel,
  } = useSessionGuard()

  const [ownershipChecked, setOwnershipChecked] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [profileAddress, setProfileAddress] = useState<string | null>(null)
  const [balances, setBalances] = useState<Balance | null>(null)
  const [activity, setActivity] = useState<NormalizedTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // After auth, check ownership via JWT phone
  useEffect(() => {
    if (!isAuthenticated) {
      setOwnershipChecked(false)
      setIsOwner(false)
      return
    }

    const token = getStoredToken()
    if (!token) {
      setOwnershipChecked(true)
      setIsOwner(false)
      return
    }

    const tokenPhone = getPhoneFromToken(token)
    if (!tokenPhone) {
      setOwnershipChecked(true)
      setIsOwner(false)
      return
    }

    const owns = normalizeDigits(tokenPhone) === normalizeDigits(rawPhone)
    setIsOwner(owns)
    setOwnershipChecked(true)
  }, [isAuthenticated, rawPhone])

  // Fetch profile data when authenticated + owner
  useEffect(() => {
    if (!isAuthenticated || !ownershipChecked || !isOwner) return

    const fetchData = async () => {
      setLoading(true)
      setFetchError(null)
      try {
        const token = getStoredToken()
        const response = await fetch(
          `${BACKEND_URL}/api/profile?phone=${encodeURIComponent(rawPhone)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        )

        if (!response.ok) {
          setFetchError('Failed to load profile')
          setLoading(false)
          return
        }

        const data = await response.json()
        if (!data.address) {
          setFetchError('Wallet not found')
          setLoading(false)
          return
        }

        setProfileAddress(data.address)

        const [bal, act] = await Promise.all([
          getBalances(data.address),
          getActivity(data.address, 10),
        ])
        setBalances(bal)
        setActivity(act)
      } catch {
        setFetchError('Failed to load profile')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [isAuthenticated, ownershipChecked, isOwner, rawPhone])

  // Checking session
  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[var(--bg-primary)] panel-frame rounded-2xl p-8 text-center">
          <div className="animate-pulse">
            <p className="text-[var(--text-secondary)]">{t('settings.loading', lang)}</p>
          </div>
        </div>
      </div>
    )
  }

  // Not authenticated — show inline auth (same as settings)
  if (!isAuthenticated && !isCheckingSession) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[var(--bg-primary)] panel-frame rounded-2xl p-8">
          <h1 className="text-2xl font-bold mb-2 text-[var(--text-primary)]">
            {t('settings.authTitle', lang)}
          </h1>
          <p className="text-[var(--text-secondary)] mb-6">{t('settings.authSubtitle', lang)}</p>

          {reAuthError && (
            <div className="mb-4 p-3 bg-[var(--fill-danger-light)] border border-red-200 rounded-lg text-red-700 text-sm">
              {reAuthError}
            </div>
          )}

          {reAuthStep === 'phone' && (
            <>
              <div className="mb-4">
                <SippyPhoneInput value={reAuthPhone} onChange={setReAuthPhone} />
              </div>
              <ChannelPicker
                canSwitch={reAuthCanSwitchChannel}
                isLoading={reAuthLoading}
                disabled={!reAuthPhone}
                lang={lang}
                onSend={handleReAuthSendOtp}
                brandColor="primary"
              />
            </>
          )}

          {reAuthStep === 'otp' && (
            <>
              <p className="text-[var(--text-secondary)] mb-4">
                {reAuthChannel === 'whatsapp'
                  ? lang === 'es'
                    ? `Enviamos un codigo a tu WhatsApp (${reAuthPhone})`
                    : lang === 'pt'
                      ? `Enviamos um codigo para seu WhatsApp (${reAuthPhone})`
                      : `We sent a code to your WhatsApp (${reAuthPhone})`
                  : `${t('settings.codeSentTo', lang)} ${reAuthPhone}`}
              </p>
              <input
                type="text"
                value={reAuthOtp}
                onChange={(e) => setReAuthOtp(e.target.value.replace(/\D/g, ''))}
                placeholder={t('settings.codePlaceholder', lang)}
                maxLength={6}
                className="w-full p-3 border rounded-lg mb-4 text-center text-2xl tracking-widest text-[var(--text-primary)]"
              />
              <button
                onClick={handleReAuthVerifyOtp}
                disabled={reAuthLoading || reAuthOtp.length !== 6}
                className="w-full bg-brand-crypto text-white py-3 rounded-lg font-semibold hover:bg-brand-crypto/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reAuthLoading ? t('settings.verifying', lang) : t('settings.verify', lang)}
              </button>
              <ResendButton
                channel={reAuthChannel}
                isLoading={reAuthLoading}
                lang={lang}
                onResend={() => handleReAuthSendOtp(reAuthChannel)}
              />
            </>
          )}
        </div>
      </div>
    )
  }

  // Authenticated but not owner
  if (ownershipChecked && !isOwner) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-2">
            {t('settings.authTitle', lang)}
          </h1>
          <p className="text-[var(--text-muted)] mb-6">
            {lang === 'es'
              ? 'Solo puedes ver tu propio perfil.'
              : lang === 'pt'
                ? 'Você só pode ver seu próprio perfil.'
                : 'You can only view your own profile.'}
          </p>
        </div>
      </div>
    )
  }

  // Loading profile data
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-[var(--text-secondary)] animate-pulse">
          {t('settings.loading', lang)}
        </div>
      </div>
    )
  }

  // Error
  if (fetchError || !profileAddress) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-2">
            {fetchError || 'Profile not found'}
          </h1>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative">
      <div className="relative z-10 pt-6 sm:pt-8 md:pt-12 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <ProfileHeader
            address={profileAddress}
            balances={balances ?? { eth: '0', usdc: '0' }}
            phoneNumber={rawPhone}
            phoneVisible={true}
          />

          <ActivityList transactions={activity} />
        </div>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  return (
    <CDPProviderDefault>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
            <div className="text-[var(--text-secondary)]">Loading...</div>
          </div>
        }
      >
        <ProfileContent />
      </Suspense>
    </CDPProviderDefault>
  )
}
