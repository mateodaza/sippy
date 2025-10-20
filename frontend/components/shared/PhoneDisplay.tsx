'use client';

import { FlagImage } from 'react-international-phone';
import { parsePhone, formatPhoneShort } from '@/lib/phone';

interface PhoneDisplayProps {
  phone: string;
  showFull?: boolean;
  flagSize?: string;
  className?: string;
}

/**
 * Display phone number with country flag
 */
export function PhoneDisplay({
  phone,
  showFull = false,
  flagSize = '20px',
  className = '',
}: PhoneDisplayProps) {
  const phoneInfo = parsePhone(phone);

  if (!phoneInfo) {
    // Fallback: show phone without flag
    return (
      <span className={className}>
        {showFull ? phone : formatPhoneShort(phone)}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <FlagImage iso2={phoneInfo.countryCode} size={flagSize} />
      <span>
        {showFull ? phoneInfo.formatted : formatPhoneShort(phoneInfo.formatted)}
      </span>
    </span>
  );
}
