'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ProfileHeader } from '@/components/profile/ProfileHeader'
import { ActivityList } from '@/components/activity/ActivityList'
import {
  getBalances,
  getActivity,
  type Balance,
  type NormalizedTransaction,
} from '@/lib/blockscout'
import Link from 'next/link'
import { getFreshToken } from '@/lib/auth'

type ProfileStatus = 'loading' | 'unauthorized' | 'not_found' | 'error' | 'found'

interface ProfileData {
  address: string
}

export default function ProfilePage() {
  const params = useParams()
  const rawPhone = decodeURIComponent(params.phone as string)

  const [status, setStatus] = useState<ProfileStatus>('loading')
  const [profileData, setProfileData] = useState<ProfileData | null>(null)
  const [balances, setBalances] = useState<Balance | null>(null)
  const [activity, setActivity] = useState<NormalizedTransaction[]>([])

  useEffect(() => {
    const fetchProfile = async () => {
      const token = getFreshToken()
      if (!token) {
        setStatus('unauthorized')
        return
      }

      try {
        const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
        const response = await fetch(
          `${BACKEND_URL}/api/profile?phone=${encodeURIComponent(rawPhone)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        )

        if (response.status === 401 || response.status === 403) {
          setStatus('unauthorized')
          return
        }

        if (response.status === 404) {
          setStatus('not_found')
          return
        }

        if (!response.ok) {
          setStatus('error')
          return
        }

        const data = await response.json()
        if (!data.address) {
          setStatus('not_found')
          return
        }

        setProfileData({ address: data.address })
        setStatus('found')

        // Fetch balances and activity in parallel
        const [bal, act] = await Promise.all([
          getBalances(data.address),
          getActivity(data.address, 10),
        ])
        setBalances(bal)
        setActivity(act)
      } catch {
        setStatus('error')
      }
    }

    fetchProfile()
  }, [rawPhone])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--text-secondary)] animate-pulse">Loading...</div>
      </div>
    )
  }

  if (status === 'unauthorized') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-2">
            Sign In Required
          </h1>
          <p className="text-[var(--text-muted)] mb-6">You need to sign in to view this profile.</p>
          <Link
            href="/setup"
            className="inline-flex items-center px-6 py-3 bg-brand-primary hover:bg-brand-primary-hover text-white font-medium rounded-lg transition-smooth"
          >
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  if (status === 'not_found') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-2">
            Phone Number Not Found
          </h1>
          <p className="text-[var(--text-muted)] mb-6">
            We couldn&apos;t find a wallet associated with {rawPhone}.
          </p>
          <Link
            href="/"
            className="inline-flex items-center px-6 py-3 bg-brand-primary hover:bg-brand-primary-hover text-white font-medium rounded-lg transition-smooth"
          >
            Go Home
          </Link>
        </div>
      </div>
    )
  }

  if (status === 'error' || !profileData) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-2">
            Something went wrong
          </h1>
          <p className="text-[var(--text-muted)] mb-6">Please try again later.</p>
          <Link
            href="/"
            className="inline-flex items-center px-6 py-3 bg-brand-primary hover:bg-brand-primary-hover text-white font-medium rounded-lg transition-smooth"
          >
            Go Home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative">
      <div className="relative z-10 pt-6 sm:pt-8 md:pt-12 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <ProfileHeader
            address={profileData.address}
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
