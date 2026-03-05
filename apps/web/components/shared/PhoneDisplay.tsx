'use client';

import { FlagImage } from 'react-international-phone';
import {
  parsePhone,
  formatPhoneShort,
  getPhoneDisplayName,
  isPrivateNumber,
} from '@/lib/phone';

interface PhoneDisplayProps {
  phone: string;
  showFull?: boolean;
  flagSize?: string;
  className?: string;
}

/**
 * Display phone number with country flag (privacy-aware)
 */
export function PhoneDisplay({
  phone,
  showFull = false,
  flagSize = '20px',
  className = '',
}: PhoneDisplayProps) {
  const phoneInfo = parsePhone(phone);
  const isPrivate = isPrivateNumber(phone);

  if (!phoneInfo) {
    // Fallback: show phone without flag (or privacy name)
    return (
      <span className={className}>
        {isPrivate
          ? getPhoneDisplayName(phone)
          : showFull
            ? phone
            : formatPhoneShort(phone)}
      </span>
    );
  }

  // If it's a private number, show name only
  if (isPrivate) {
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`}>
        <FlagImage iso2={phoneInfo.countryCode} size={flagSize} />
        <span>{getPhoneDisplayName(phone)}</span>
      </span>
    );
  }

  // Otherwise show normal phone display
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <FlagImage iso2={phoneInfo.countryCode} size={flagSize} />
      <span>
        {showFull ? phoneInfo.formatted : formatPhoneShort(phoneInfo.formatted)}
      </span>
    </span>
  );
}
