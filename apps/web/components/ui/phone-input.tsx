'use client'

import { useMemo } from 'react'
import { PhoneInput as BasePhoneInput, defaultCountries, parseCountry } from 'react-international-phone'
import 'react-international-phone/style.css'
import { BLOCKED_COUNTRY_ISO2 } from '@sippy/shared'

const PREFERRED_COUNTRIES = ['co', 'mx', 'br', 'ar', 'cl', 'pe', 've', 'ec', 'us'] as const

const blocked = new Set<string>(BLOCKED_COUNTRY_ISO2)

export function detectDefaultCountry(): string {
  if (typeof navigator === 'undefined') return 'co'
  const region = (navigator.language || '').split('-')[1]?.toLowerCase()
  const map: Record<string, string> = {
    co: 'co', us: 'us', ca: 'us', br: 'br', mx: 'mx',
    ar: 'ar', cl: 'cl', pe: 'pe', ve: 've', ec: 'ec',
  }
  return map[region || ''] || 'co'
}

const allowedCountries = defaultCountries.filter((c) => {
  const { iso2 } = parseCountry(c)
  return !blocked.has(iso2)
})

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
      countries={allowedCountries}
      value={value}
      onChange={(val) => !locked && onChange(val)}
      forceDialCode
      hideDropdown={locked}
      inputProps={{ readOnly: locked }}
    />
  )
}
