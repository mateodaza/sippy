import { cache } from 'react'
import { Metadata } from 'next'
import { ProfileHeader } from '@/components/profile/ProfileHeader'
import { ActivityList } from '@/components/activity/ActivityList'
import { getBalances, getActivity } from '@/lib/blockscout'
import Link from 'next/link'
import { BackButton } from '@/components/shared/BackButton'

interface ProfilePageProps {
  params: Promise<{
    phone: string
  }>
}

type ProfileResult =
  | { status: 'found'; address: string; phoneVisible: boolean }
  | { status: 'not_found' }
  | { status: 'error' }

// React cache() deduplicates calls within the same request lifecycle,
// so generateMetadata and the page component share a single backend fetch.
const fetchProfileData = cache(async (phone: string): Promise<ProfileResult> => {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/profile?phone=${encodeURIComponent(phone)}`, {
      cache: 'no-store',
    })

    if (response.status === 404) {
      return { status: 'not_found' }
    }

    if (!response.ok) {
      console.error(`Failed to fetch profile for ${phone}:`, response.status, await response.text())
      return { status: 'error' }
    }

    const data = await response.json()
    if (!data.address) return { status: 'not_found' }
    return {
      status: 'found',
      address: data.address,
      phoneVisible: data.phoneVisible ?? true,
    }
  } catch (error) {
    console.error('Failed to fetch profile data:', error)
    return { status: 'error' }
  }
})

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { phone } = await params
  const decodedPhone = decodeURIComponent(phone)
  const result = await fetchProfileData(decodedPhone)

  // On error (transient failures, 429, etc.) default to private metadata so
  // we never leak the phone number for an account that may have it hidden.
  if (result.status === 'error' || (result.status === 'found' && !result.phoneVisible)) {
    return {
      title: 'Private Profile | Sippy',
      description: "This account's phone number is private.",
    }
  }

  return {
    title: `Profile: ${decodedPhone} | Sippy`,
    description: `View wallet balance and transaction history for ${decodedPhone} on Arbitrum One`,
  }
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { phone } = await params
  const decodedPhone = decodeURIComponent(phone)

  const result = await fetchProfileData(decodedPhone)

  if (result.status !== 'found') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">📱</div>
          <h1 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-2">
            Phone Number Not Found
          </h1>
          <p className="text-[var(--text-muted)] mb-6">
            We couldn&apos;t find a wallet associated with {decodedPhone}. The user may not have set
            up their wallet yet.
          </p>
          <Link
            href="/"
            className="inline-flex items-center px-6 py-3 bg-brand-primary hover:bg-brand-primary-hover text-white font-medium rounded-lg transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
          >
            Go Home
          </Link>
        </div>
      </div>
    )
  }

  const { address, phoneVisible } = result

  // Fetch balances and activity in parallel
  const [balances, activity] = await Promise.all([getBalances(address), getActivity(address, 10)])

  return (
    <div className="min-h-screen relative">
      <div className="relative z-10 pt-6 sm:pt-8 md:pt-12 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <div className="mb-4 sm:mb-6">
            <BackButton />
          </div>

          {/* Profile Header with Balances */}
          <ProfileHeader
            address={address}
            balances={balances}
            phoneNumber={decodedPhone}
            phoneVisible={phoneVisible}
          />

          {/* Activity List */}
          <ActivityList transactions={activity} />
        </div>
      </div>
    </div>
  )
}
