'use client';

import {
  NormalizedTransaction,
  formatRelativeTime,
  formatAddress,
} from '@/lib/blockscout';
import { AddressOrPhone } from '@/components/shared/AddressOrPhone';
import { useRouter } from 'next/navigation';

interface ActivityListProps {
  transactions: NormalizedTransaction[];
}

export function ActivityList({ transactions }: ActivityListProps) {
  const router = useRouter();

  const handleRowClick = (txHash: string) => {
    // Navigate to receipt page for user-friendly transaction details
    router.push(`/receipt/${txHash}`);
  };

  if (transactions.length === 0) {
    return (
      <div className='bg-white rounded-2xl shadow-lg p-12 border border-gray-100 text-center'>
        <div className='text-gray-400 mb-2'>
          <svg
            className='w-16 h-16 mx-auto'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={1.5}
              d='M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'
            />
          </svg>
        </div>
        <p className='text-lg font-medium text-gray-600'>
          No recent activity yet
        </p>
        <p className='text-sm text-gray-400 mt-1'>
          Transactions will appear here
        </p>
      </div>
    );
  }

  return (
    <div className='bg-white/90 backdrop-blur-xl rounded-2xl sm:rounded-[32px] shadow-[0_20px_50px_rgba(15,23,42,0.12)] sm:shadow-[0_28px_70px_rgba(15,23,42,0.16)] border border-white/50 overflow-hidden animate-fade-in-up animation-delay-100'>
      <div className='px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100'>
        <h2 className='text-lg sm:text-xl font-bold text-[#0f172a]'>
          Recent Activity
        </h2>
        <p className='text-xs sm:text-sm text-gray-600 mt-1'>
          Last 10 transactions
        </p>
      </div>

      <div className='divide-y divide-gray-100'>
        {transactions.map((tx) => (
          <button
            key={tx.hash}
            onClick={() => handleRowClick(tx.hash)}
            className='w-full px-4 sm:px-6 py-3 sm:py-4 hover:bg-green-50 transition-all text-left flex items-center gap-2 sm:gap-4 group relative'
            title='Click to view receipt'
          >
            {/* Direction Icon */}
            <div
              className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center ${
                tx.direction === 'sent'
                  ? 'bg-red-100 text-red-600'
                  : tx.direction === 'received'
                  ? 'bg-green-100 text-green-600'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {tx.direction === 'sent' ? (
                <svg
                  className='w-4 h-4 sm:w-5 sm:h-5'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M5 10l7-7m0 0l7 7m-7-7v18'
                  />
                </svg>
              ) : tx.direction === 'received' ? (
                <svg
                  className='w-4 h-4 sm:w-5 sm:h-5'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M19 14l-7 7m0 0l-7-7m7 7V3'
                  />
                </svg>
              ) : (
                <svg
                  className='w-4 h-4 sm:w-5 sm:h-5'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z'
                  />
                </svg>
              )}
            </div>

            {/* Transaction Details */}
            <div className='flex-1 min-w-0'>
              <div className='flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap'>
                <span className='font-semibold text-sm sm:text-base text-gray-900 capitalize'>
                  {tx.direction || 'transaction'}
                </span>
                <span
                  className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-xs font-medium ${
                    tx.token === 'ETH'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-green-100 text-green-800'
                  }`}
                >
                  {tx.token}
                </span>
                {tx.status === 'pending' && (
                  <span className='inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800'>
                    Pending
                  </span>
                )}
                {tx.status === 'failed' && (
                  <span className='inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800'>
                    Failed
                  </span>
                )}
              </div>
              <div className='text-xs sm:text-sm text-gray-500 truncate'>
                {tx.direction === 'sent'
                  ? 'To: '
                  : tx.direction === 'received'
                  ? 'From: '
                  : 'Address: '}
                <AddressOrPhone address={tx.counterparty} flagSize='12px' />
              </div>
            </div>

            {/* Amount and Time */}
            <div className='text-right flex-shrink-0'>
              <div
                className={`font-semibold text-sm sm:text-base ${
                  tx.direction === 'sent'
                    ? 'text-red-600'
                    : tx.direction === 'received'
                    ? 'text-green-600'
                    : 'text-gray-900'
                }`}
              >
                {tx.direction === 'sent'
                  ? '-'
                  : tx.direction === 'received'
                  ? '+'
                  : ''}
                {parseFloat(tx.amount).toFixed(tx.token === 'ETH' ? 4 : 2)}{' '}
                <span className='hidden sm:inline'>{tx.token}</span>
              </div>
              <div className='text-xs text-gray-500 mt-1'>
                {formatRelativeTime(tx.timestamp)}
              </div>
            </div>

            {/* Receipt Icon - Hidden on mobile */}
            <div className='hidden sm:block flex-shrink-0 text-gray-400 group-hover:text-[#059669] transition-colors'>
              <svg
                className='w-5 h-5'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
                />
              </svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
