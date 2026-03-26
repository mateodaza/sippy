import { RootProvider } from 'fumadocs-ui/provider/next'
import { Chakra_Petch, Electrolize, Space_Mono } from 'next/font/google'
import { i18nUI } from '@/lib/layout.shared'
import type { ReactNode } from 'react'
import '@/global.css'

const chakraPetch = Chakra_Petch({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin', 'latin-ext'],
  variable: '--font-chakra-petch',
  display: 'swap',
})

const electrolize = Electrolize({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-electrolize',
  display: 'swap',
})

const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin', 'latin-ext'],
  variable: '--font-space-mono',
  display: 'swap',
})

export default async function RootLayout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>
  children: ReactNode
}) {
  const { lang } = await params

  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${chakraPetch.variable} ${electrolize.variable} ${spaceMono.variable}`}
    >
      <body className="flex flex-col min-h-screen">
        <RootProvider i18n={i18nUI.provider(lang)}>{children}</RootProvider>
      </body>
    </html>
  )
}
