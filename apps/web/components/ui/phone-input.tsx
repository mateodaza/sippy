'use client'

import { PhoneInput as BasePhoneInput } from 'react-international-phone'
import 'react-international-phone/style.css'

const PREFERRED_COUNTRIES = ['co', 'mx', 'br', 'ar', 'cl', 'pe', 've', 'ec', 'us'] as const

export function detectDefaultCountry(): string {
  if (typeof navigator === 'undefined') return 'co'
  const region = (navigator.language || '').split('-')[1]?.toLowerCase()
  const map: Record<string, string> = {
    co: 'co', us: 'us', ca: 'us', br: 'br', mx: 'mx',
    ar: 'ar', cl: 'cl', pe: 'pe', ve: 've', ec: 'ec',
  }
  return map[region || ''] || 'co'
}

interface SippyPhoneInputProps {
  value: string
  onChange: (value: string) => void
  locked?: boolean
}

export function SippyPhoneInput({ value, onChange, locked }: SippyPhoneInputProps) {
  return (
    <BasePhoneInput
      defaultCountry={detectDefaultCountry()}
      preferredCountries={[...PREFERRED_COUNTRIES]}
      value={value}
      onChange={(val) => !locked && onChange(val)}
      forceDialCode
      hideDropdown={locked}
      inputProps={{ readOnly: locked }}
    />
  )
}
