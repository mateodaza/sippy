import { i18n } from '@/lib/i18n'
import { defineI18nUI } from 'fumadocs-ui/i18n'
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'
export const i18nUI = defineI18nUI(i18n, {
  en: { displayName: 'English' },
  es: { displayName: 'Espanol' },
  pt: { displayName: 'Portugues' },
})

export function baseOptions(_locale: string): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Sippy" className="h-5 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dark.svg" alt="Sippy" className="h-5 w-auto hidden dark:block" />
        </>
      ),
    },
    links: [{ text: 'App', url: 'https://www.sippy.lat', external: true }],
  }
}
