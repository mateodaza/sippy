import type { Metadata, Viewport } from 'next'
import { Chakra_Petch, Electrolize, Space_Mono } from 'next/font/google'
import { ThemeWrapper } from '@/components/ui/theme-wrapper'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import './globals.css'
import { Web3Provider } from './providers/Web3Provider'
import { BlockscoutProvider } from './providers/BlockscoutProvider'
import { PostHogProvider } from './providers/PostHogProvider'
import { getRequestLang } from '@/lib/i18n-server'

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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  title: 'Sippy — Send Dollars via WhatsApp',
  description:
    'Manda plata por texto. Digital dollars on WhatsApp — no app, no fees, instant transfers on Arbitrum. Non-custodial wallets linked to your phone number.',
  keywords:
    'WhatsApp payments, digital dollars, USDC, stablecoin, Arbitrum, send money WhatsApp, Latin America payments, remittances, non-custodial wallet, AI agent',
  metadataBase: new URL('https://sippy.lat'),
  openGraph: {
    title: 'Sippy — Send Dollars via WhatsApp',
    description: 'Manda plata por texto. No app, no fees, instant USDC transfers on Arbitrum.',
    url: 'https://sippy.lat',
    siteName: 'Sippy',
    locale: 'es_CO',
    alternateLocale: ['en_US', 'pt_BR'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sippy — Send Dollars via WhatsApp',
    description: 'Manda plata por texto. No app, no fees, instant USDC transfers on Arbitrum.',
    creator: '@sippylat',
  },
  other: {
    'telegram:channel': '@sippylat',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getRequestLang()

  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${chakraPetch.variable} ${electrolize.variable} ${spaceMono.variable}`}
    >
      <body className="min-h-screen bg-[var(--bg-primary)] antialiased font-sans text-[var(--text-primary)]">
        <ThemeWrapper>
          <PostHogProvider>
            <BlockscoutProvider>
              <Web3Provider>
                <script
                  type="application/ld+json"
                  dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                      '@context': 'https://schema.org',
                      '@type': 'Organization',
                      'name': 'Sippy',
                      'url': 'https://sippy.lat',
                    }),
                  }}
                />
                <ThemeToggle />
                {children}
              </Web3Provider>
            </BlockscoutProvider>
          </PostHogProvider>
        </ThemeWrapper>
      </body>
    </html>
  )
}
