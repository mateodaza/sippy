import React from 'react';

interface BetaAccessBannerProps {
  variant?: 'full' | 'compact';
}

// Set to false to hide the banner (e.g., during demos)
const SHOW_BETA_BANNER = false;

export default function BetaAccessBanner({
  variant = 'full',
}: BetaAccessBannerProps) {
  // Hide banner if disabled
  if (!SHOW_BETA_BANNER) {
    return null;
  }

  const emailLink =
    'mailto:hello@sippy.lat?subject=Sippy Beta Access Request&body=Hi! I would like beta access to Sippy.%0D%0A%0D%0AMy WhatsApp number: ';

  if (variant === 'compact') {
    return (
      <div className='relative group'>
        <div className='absolute -inset-0.5 bg-gradient-to-r from-[#059669] via-[#10b981] to-[#059669] rounded-xl blur opacity-20 group-hover:opacity-30 transition duration-300' />
        <div className='relative bg-gradient-to-br from-[#059669] to-[#047857] rounded-lg p-4 shadow-lg border border-[#10b981]/30'>
          <div className='flex items-center justify-between gap-4'>
            <div className='flex items-center gap-3'>
              <div className='flex-shrink-0 w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center'>
                <svg
                  className='w-5 h-5 text-white'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
                  />
                </svg>
              </div>
              <div>
                <h3 className='text-white font-bold text-base'>
                  Get Beta Access
                </h3>
                <p className='text-white/90 text-xs'>
                  Email your WhatsApp number to get started
                </p>
              </div>
            </div>
            <a
              href={emailLink}
              className='flex-shrink-0 px-5 py-2 bg-white text-[#059669] rounded-lg font-semibold text-sm shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200'
            >
              Join Waitlist
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Full variant (for Fund page)
  return (
    <div className='relative group'>
      <div className='absolute -inset-1 bg-gradient-to-r from-[#059669] via-[#10b981] to-[#059669] rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-500' />
      <div className='relative bg-gradient-to-br from-[#059669] to-[#047857] rounded-xl p-6 shadow-xl border border-[#10b981]/30'>
        <div className='flex flex-col md:flex-row items-center gap-4 text-center md:text-left'>
          <div className='flex-shrink-0 w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center'>
            <svg
              className='w-6 h-6 text-white'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
              />
            </svg>
          </div>
          <div className='flex-1'>
            <h3 className='text-white font-bold text-lg mb-1'>
              Get Beta Access
            </h3>
            <p className='text-white/90 text-sm leading-relaxed'>
              Send your WhatsApp number to{' '}
              <a
                href={emailLink}
                className='font-semibold underline hover:text-white transition-colors'
              >
                hello@sippy.lat
              </a>{' '}
              to join the waitlist and start using Sippy!
            </p>
          </div>
          <a
            href={emailLink}
            className='flex-shrink-0 px-6 py-2.5 bg-white text-[#059669] rounded-lg font-semibold text-sm shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200'
          >
            Request Access
          </a>
        </div>
      </div>
    </div>
  );
}
