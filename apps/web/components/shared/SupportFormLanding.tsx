'use client'

import { SupportForm } from './SupportForm'
import type { Language } from '@/lib/i18n'

export function SupportFormLanding({ lang }: { lang: Language }) {
  return <SupportForm lang={lang} />
}
