/**
 * Bilingual toggle for the operational docs pages (/pagar, /cobrar,
 * /pizza-day, /quest/[slug]). ES is the default — toggle promotes EN
 * for the slice of attendees who don't speak Spanish.
 *
 * Storage: `?lang=en` query param drives render; localStorage persists
 * the preference across navigations so a user who flipped EN on /pagar
 * also gets EN when they tap through to /cobrar. The hook hydrates
 * from localStorage on mount so SSR can default to ES safely without
 * a hydration flash for return visitors.
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'

export type DocsLang = 'es' | 'en'

const STORAGE_KEY = 'sippy.docs.lang'

function readUrlLang(searchParams: ReturnType<typeof useSearchParams>): DocsLang | null {
  const raw = searchParams.get('lang')
  return raw === 'en' || raw === 'es' ? raw : null
}

export function useDocsLang(): [DocsLang, (next: DocsLang) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [lang, setLangState] = useState<DocsLang>(() => readUrlLang(searchParams) ?? 'es')

  useEffect(() => {
    const fromUrl = readUrlLang(searchParams)
    if (fromUrl) {
      setLangState(fromUrl)
      try {
        window.localStorage.setItem(STORAGE_KEY, fromUrl)
      } catch {}
      return
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === 'en' || stored === 'es') setLangState(stored)
    } catch {}
  }, [searchParams])

  const setLang = useCallback(
    (next: DocsLang) => {
      setLangState(next)
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch {}
      const params = new URLSearchParams(searchParams.toString())
      if (next === 'es') params.delete('lang')
      else params.set('lang', next)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  return [lang, setLang]
}

export function DocsLanguageToggle({
  lang,
  onChange,
  className = '',
}: {
  lang: DocsLang
  onChange: (next: DocsLang) => void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex items-center gap-0 overflow-hidden rounded-md border-2 border-[var(--text-primary,#1A1A2E)] ${className}`}
    >
      <button
        type="button"
        aria-pressed={lang === 'es'}
        onClick={() => onChange('es')}
        className={`px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wider transition ${
          lang === 'es'
            ? 'bg-[var(--text-primary,#1A1A2E)] text-white'
            : 'bg-transparent text-[var(--text-primary,#1A1A2E)] hover:bg-[rgba(0,0,0,0.05)]'
        }`}
      >
        ES
      </button>
      <button
        type="button"
        aria-pressed={lang === 'en'}
        onClick={() => onChange('en')}
        className={`px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wider transition ${
          lang === 'en'
            ? 'bg-[var(--text-primary,#1A1A2E)] text-white'
            : 'bg-transparent text-[var(--text-primary,#1A1A2E)] hover:bg-[rgba(0,0,0,0.05)]'
        }`}
      >
        EN
      </button>
    </div>
  )
}
