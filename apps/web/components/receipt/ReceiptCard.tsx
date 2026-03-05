'use client';

import {
  NormalizedTransaction,
  formatAddress,
  getExplorerTxUrl,
} from '@/lib/blockscout';
import { useState } from 'react';
import { AddressOrPhone } from '@/components/shared/AddressOrPhone';

interface ReceiptCardProps {
  transaction: NormalizedTransaction;
  fromAddress: string;
  toAddress: string;
  fromPhone?: string;
  toPhone?: string;
}

export function ReceiptCard({
  transaction,
  fromAddress,
  toAddress,
  fromPhone,
  toPhone,
}: ReceiptCardProps) {
  const [copied, setCopied] = useState(false);

  const statusConfig = {
    success: {
      bg: 'bg-gradient-to-br from-green-50 to-emerald-50',
      icon: '✓',
      text: 'Success',
      color: 'text-green-600',
    },
    pending: {
      bg: 'bg-gradient-to-br from-yellow-50 to-amber-50',
      icon: '⏳',
      text: 'Pending',
      color: 'text-yellow-600',
    },
    failed: {
      bg: 'bg-gradient-to-br from-red-50 to-rose-50',
      icon: '✗',
      text: 'Failed',
      color: 'text-red-600',
    },
  };

  const config = statusConfig[transaction.status];

  const copyLink = () => {
    const url = `${window.location.origin}/receipt/${transaction.hash}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className='max-w-md mx-auto animate-fade-in-up'>
      <div className='absolute -inset-4 rounded-[40px] bg-gradient-to-br from-[#dcfce7]/40 via-white/0 to-[#dbeafe]/30 blur-[40px]' />
      <div
        className={`relative rounded-2xl sm:rounded-[32px] shadow-[0_20px_50px_rgba(15,23,42,0.12)] sm:shadow-[0_28px_70px_rgba(15,23,42,0.16)] overflow-hidden border border-white/50 ${config.bg}`}
      >
        {/* Header */}
        <div className='px-5 sm:px-8 pt-6 sm:pt-8 pb-5 sm:pb-6 text-center'>
          <div className={`text-5xl sm:text-6xl mb-3 sm:mb-4 ${config.color}`}>
            {config.icon}
          </div>
          <h1 className='text-xl sm:text-2xl font-bold text-[#0f172a] mb-2'>
            Payment Details
          </h1>
          <div
            className={`inline-block px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${config.color} bg-white shadow-sm`}
          >
            {config.text}
          </div>
        </div>

        {/* Amount */}
        <div className='px-5 sm:px-8 py-5 sm:py-6 bg-white/90 backdrop-blur-sm'>
          <div className='text-center mb-5 sm:mb-6'>
            <div className='text-4xl sm:text-5xl font-bold text-[#0f172a] mb-2'>
              {parseFloat(transaction.amount).toFixed(
                transaction.token === 'ETH' ? 4 : 2
              )}
            </div>
            <div className='text-lg sm:text-xl text-gray-600 font-semibold'>
              {transaction.token}
            </div>
          </div>

          {/* Transaction Details */}
          <div className='space-y-3 sm:space-y-4'>
            {/* From */}
            <div className='flex justify-between items-start gap-2'>
              <span className='text-sm sm:text-base text-gray-600 font-semibold flex-shrink-0'>
                From:
              </span>
              <div className='text-right break-all'>
                <AddressOrPhone address={fromAddress} flagSize='14px' />
              </div>
            </div>

            {/* To */}
            <div className='flex justify-between items-start gap-2'>
              <span className='text-sm sm:text-base text-gray-600 font-semibold flex-shrink-0'>
                To:
              </span>
              <div className='text-right break-all'>
                <AddressOrPhone address={toAddress} flagSize='14px' />
              </div>
            </div>

            {/* Date */}
            <div className='flex justify-between items-start gap-2'>
              <span className='text-sm sm:text-base text-gray-600 font-semibold flex-shrink-0'>
                Date:
              </span>
              <span className='text-xs sm:text-sm text-[#0f172a] font-medium text-right'>
                {formatDate(transaction.timestamp)}
              </span>
            </div>

            {/* Network */}
            <div className='flex justify-between items-center gap-2'>
              <span className='text-sm sm:text-base text-gray-600 font-semibold flex-shrink-0'>
                Network:
              </span>
              <span className='text-xs sm:text-sm text-[#0f172a] font-medium'>
                Arbitrum One
              </span>
            </div>

            {/* Transaction Hash */}
            <div className='flex justify-between items-start gap-2'>
              <span className='text-sm sm:text-base text-gray-600 font-semibold flex-shrink-0'>
                Tx Hash:
              </span>
              <div className='text-right'>
                <div className='text-xs sm:text-sm text-gray-500 font-mono break-all'>
                  {formatAddress(transaction.hash)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className='px-5 sm:px-8 py-5 sm:py-6 bg-white/95 backdrop-blur-sm space-y-2.5 sm:space-y-3'>
          <a
            href={getExplorerTxUrl(transaction.hash)}
            target='_blank'
            rel='noopener noreferrer'
            className='block w-full px-4 sm:px-6 py-3 sm:py-3.5 bg-[#059669] hover:bg-[#047857] text-white text-sm sm:text-base font-semibold rounded-xl transition-all duration-200 text-center shadow-md hover:shadow-lg active:scale-[0.98]'
          >
            View on Blockscout
          </a>
          <button
            onClick={copyLink}
            className='block w-full px-4 sm:px-6 py-3 sm:py-3.5 bg-white hover:bg-gray-50 text-[#0f172a] text-sm sm:text-base font-semibold rounded-xl transition-all duration-200 border border-gray-200 hover:border-gray-300 hover:shadow-md active:scale-[0.98]'
          >
            {copied ? '✓ Link Copied!' : 'Copy Receipt Link'}
          </button>
        </div>

        {/* Footer */}
        <div className='px-5 sm:px-8 py-3 sm:py-4 bg-white/95 backdrop-blur-sm border-t border-gray-100 text-center'>
          <p className='text-xs text-gray-500'>
            Powered by{' '}
            <span className='font-semibold text-[#059669]'>Sippy</span> on
            Arbitrum One
          </p>
        </div>
      </div>
    </div>
  );
}
