import { Metadata } from 'next';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ActivityList } from '@/components/activity/ActivityList';
import { getBalances, getActivity } from '@/lib/blockscout';
import Link from 'next/link';

interface ProfilePageProps {
  params: Promise<{
    phone: string;
  }>;
}

export async function generateMetadata({
  params,
}: ProfilePageProps): Promise<Metadata> {
  const { phone } = await params;
  const decodedPhone = decodeURIComponent(phone);
  return {
    title: `Profile: ${decodedPhone} | Sippy`,
    description: `View wallet balance and transaction history for ${decodedPhone} on Arbitrum One`,
  };
}

async function resolvePhoneToAddress(phone: string): Promise<string | null> {
  try {
    // Call backend directly from server component
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const response = await fetch(
      `${backendUrl}/resolve-phone?phone=${encodeURIComponent(phone)}`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Failed to resolve phone ${phone}:`,
        response.status,
        errorText
      );
      return null;
    }

    const data = await response.json();
    return data.address || null;
  } catch (error) {
    console.error('Failed to resolve phone to address:', error);
    return null;
  }
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { phone } = await params;
  const decodedPhone = decodeURIComponent(phone);

  const address = await resolvePhoneToAddress(decodedPhone);

  if (!address) {
    return (
      <div className='min-h-screen flex items-center justify-center px-4'>
        <div className='text-center max-w-md'>
          <div className='text-6xl mb-4'>📱</div>
          <h1 className='text-2xl font-bold text-gray-900 mb-2'>
            Phone Number Not Found
          </h1>
          <p className='text-gray-600 mb-6'>
            We couldn't find a wallet associated with {decodedPhone}. The user
            may not have set up their wallet yet.
          </p>
          <Link
            href='/'
            className='inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors'
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  // Fetch balances and activity in parallel
  const [balances, activity] = await Promise.all([
    getBalances(address),
    getActivity(address, 10),
  ]);

  return (
    <div className='min-h-screen relative'>
      <div className='relative z-10 pt-6 sm:pt-8 md:pt-12 pb-8 px-4 sm:px-6 lg:px-8'>
        <div className='max-w-4xl mx-auto'>
          {/* Back Button */}
          <Link
            href='/'
            className='inline-flex items-center text-sm sm:text-base text-gray-600 hover:text-[#059669] mb-4 sm:mb-6 transition-colors font-medium'
          >
            <svg
              className='w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M15 19l-7-7 7-7'
              />
            </svg>
            Back to Home
          </Link>

          {/* Profile Header with Balances */}
          <ProfileHeader
            address={address}
            balances={balances}
            phoneNumber={decodedPhone}
          />

          {/* Activity List */}
          <ActivityList transactions={activity} />
        </div>
      </div>
    </div>
  );
}
