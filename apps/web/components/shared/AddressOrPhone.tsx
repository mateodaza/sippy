'use client';

import { useState, useEffect } from 'react';
import { formatAddress } from '@/lib/blockscout';
import { PhoneDisplay } from './PhoneDisplay';

interface AddressOrPhoneProps {
  address: string;
  className?: string;
  flagSize?: string;
}

/**
 * Display address or phone number (with flag) if available
 * Fetches phone number from backend if not cached
 */
export function AddressOrPhone({
  address,
  className = '',
  flagSize = '16px',
}: AddressOrPhoneProps) {
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchPhone() {
      try {
        // Normalize address to lowercase for consistent caching and API calls
        const normalizedAddress = address.toLowerCase();

        // Check cache first
        const cacheKey = `phone_${normalizedAddress}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          if (!cancelled) {
            setPhone(cached === 'null' ? null : cached);
            setLoading(false);
          }
          return;
        }

        // Fetch from API with normalized address
        const response = await fetch(
          `/api/resolve-address?address=${encodeURIComponent(
            normalizedAddress
          )}`
        );
        if (!response.ok) {
          console.error(
            `Failed to resolve address ${normalizedAddress}: ${response.status}`
          );
          throw new Error('Failed to resolve address');
        }

        const data = await response.json();
        const phoneNumber = data.phone || null;

        // Cache the result (even if null)
        sessionStorage.setItem(cacheKey, phoneNumber || 'null');

        if (!cancelled) {
          setPhone(phoneNumber);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error fetching phone for address:', error);
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchPhone();

    return () => {
      cancelled = true;
    };
  }, [address]);

  if (loading) {
    return (
      <span className={`text-gray-400 ${className}`}>
        {formatAddress(address)}
      </span>
    );
  }

  if (phone) {
    return (
      <PhoneDisplay phone={phone} flagSize={flagSize} className={className} />
    );
  }

  // No phone number found, show address
  return (
    <span className={`font-mono ${className}`}>{formatAddress(address)}</span>
  );
}
