'use client';

import { Balance } from '@/lib/blockscout';
import { formatAddress } from '@/lib/blockscout';
import { PhoneDisplay } from '@/components/shared/PhoneDisplay';
import { WHATSAPP_BOT_NUMBER } from '@/lib/constants';
import NumberTicker from '@/components/ui/number-ticker';
import { useState } from 'react';

interface ProfileHeaderProps {
  address: string;
  balances: Balance;
  phoneNumber?: string;
}

export function ProfileHeader({
  address,
  balances,
  phoneNumber,
}: ProfileHeaderProps) {
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className='mb-6 sm:mb-8 animate-fade-in-up'>
      {/* Main Balance Card */}
      <div className='relative bg-gradient-to-br from-[#059669] via-[#047857] to-[#065f46] rounded-3xl sm:rounded-[32px] shadow-[0_20px_60px_rgba(5,150,105,0.25)] sm:shadow-[0_28px_80px_rgba(5,150,105,0.3)] p-6 border border-[#059669]/20 overflow-hidden group hover:shadow-[0_32px_90px_rgba(5,150,105,0.35)] transition-all duration-500'>
        {/* Background Pattern */}
        <div className='absolute inset-0 opacity-10'>
          <div className='absolute top-0 right-0 w-64 h-64 bg-white rounded-full blur-3xl' />
          <div className='absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full blur-3xl' />
        </div>

        {/* Content */}
        <div className='relative z-10'>
          {/* Header with Phone/Address */}
          <div className='flex items-start justify-between mb-4 sm:mb-6'>
            <div className='flex-1 flex flex-col gap-2'>
              {phoneNumber ? (
                <div className='inline-flex items-center gap-2 px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-full border border-white/30 w-fit'>
                  <PhoneDisplay
                    phone={phoneNumber}
                    showFull
                    flagSize='18px'
                    className='text-white text-sm sm:text-base font-medium'
                  />
                </div>
              ) : (
                <div className='text-white/90 text-sm font-medium'>Wallet</div>
              )}
              <button
                onClick={copyAddress}
                className='inline-flex items-center gap-1.5 text-white/70 hover:text-white text-xs sm:text-sm transition-colors group/btn w-fit'
                title={copied ? 'Copied!' : 'Click to copy address'}
              >
                <span className='font-mono'>{formatAddress(address)}</span>
                {copied ? (
                  <svg
                    className='w-3.5 h-3.5'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M5 13l4 4L19 7'
                    />
                  </svg>
                ) : (
                  <svg
                    className='w-3.5 h-3.5 opacity-0 group-hover/btn:opacity-100 transition-opacity'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z'
                    />
                  </svg>
                )}
              </button>
            </div>

            {/* ETH Balance Badge */}
            <div className='flex flex-col items-end'>
              <div className='text-white/60 text-xs font-medium mb-1'>ETH</div>
              <div className='text-white text-lg sm:text-xl font-bold tracking-tight'>
                {parseFloat(balances.eth).toFixed(4)}
              </div>
            </div>
          </div>

          {/* Main PYUSD Balance */}
          <div className='sm:mt-[-60px] text-center pt-2 pb-4 sm:pt-4 sm:pb-6'>
            <div className='text-white/80 text-sm sm:text-base font-medium mb-3 tracking-wide uppercase'>
              Available Balance
            </div>
            <div className='flex items-center justify-center gap-3 mb-3'>
              <div className='text-5xl sm:text-6xl md:text-7xl font-black text-white tracking-tight'>
                $
                <NumberTicker
                  value={parseFloat(balances.pyusd)}
                  decimalPlaces={2}
                  className='text-white'
                />
              </div>
            </div>
            <div className='inline-flex items-center gap-2 px-4 py-1.5 bg-white/15 backdrop-blur-sm rounded-full border border-white/25'>
              <div className='w-2 h-2 rounded-full bg-[#4ade80] animate-pulse' />
              <span className='text-white/90 text-xs sm:text-sm font-semibold'>
                PYUSD
              </span>
              <span className='text-white/60 text-xs'>•</span>
              <span className='text-white/70 text-xs'>Arbitrum One</span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className='flex justify-center mt-8'>
            <button
              onClick={() =>
                window.open(`https://wa.me/${WHATSAPP_BOT_NUMBER}`, '_blank')
              }
              className='w-full max-w-xs py-3.5 bg-white hover:bg-gray-50 text-[#059669] font-semibold rounded-xl transition-all duration-200 text-sm sm:text-base shadow-md hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-2'
            >
              <svg className='w-5 h-5' fill='currentColor' viewBox='0 0 24 24'>
                <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z' />
              </svg>
              Chat with Sippy Bot
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
