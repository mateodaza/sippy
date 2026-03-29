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
  title: {
    default: 'Sippy — Send Dollars via WhatsApp',
    template: '%s | Sippy',
  },
  description:
    'Send and receive digital dollars on WhatsApp. No app download, no bank account, zero fees. Non-custodial USDC wallets on Arbitrum, linked to your phone number. Built for Latin America.',
  keywords: [
    'WhatsApp payments',
    'send money WhatsApp',
    'digital dollars',
    'USDC',
    'stablecoin payments',
    'Arbitrum',
    'Latin America payments',
    'remittances Latin America',
    'enviar dolares WhatsApp',
    'mandar plata por WhatsApp',
    'pagos WhatsApp',
    'non-custodial wallet',
    'crypto payments',
    'mobile payments LATAM',
    'WhatsApp USDC',
    'transferencias internacionales',
    'remesas latinoamerica',
    'dolares digitales',
  ],
  metadataBase: new URL('https://sippy.lat'),
  alternates: {
    canonical: 'https://sippy.lat',
  },
  openGraph: {
    title: 'Sippy — Send Dollars via WhatsApp',
    description:
      'Send and receive digital dollars on WhatsApp. No app, no fees, instant USDC transfers on Arbitrum. Built for Latin America.',
    url: 'https://sippy.lat',
    siteName: 'Sippy',
    locale: 'es_CO',
    alternateLocale: ['en_US', 'pt_BR'],
    type: 'website',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Sippy — Send Dollars via WhatsApp',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sippy — Send Dollars via WhatsApp',
    description:
      'Send and receive digital dollars on WhatsApp. No app, no fees, instant USDC transfers on Arbitrum.',
    site: '@sippylat',
    creator: '@sippylat',
    images: [
      { url: '/twitter-image', width: 1200, height: 600, alt: 'Sippy — Send Dollars via WhatsApp' },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      'index': true,
      'follow': true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  category: 'finance',
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
      <head>
        <link rel="dns-prefetch" href="https://us.i.posthog.com" />
        <link rel="dns-prefetch" href="https://arbitrum.blockscout.com" />
        <link rel="dns-prefetch" href="https://docs.sippy.lat" />
        <link rel="preconnect" href="https://us.i.posthog.com" crossOrigin="anonymous" />
      </head>
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
                      '@graph': [
                        {
                          '@type': 'Organization',
                          '@id': 'https://sippy.lat/#organization',
                          'name': 'Sippy',
                          'url': 'https://sippy.lat',
                          'logo': {
                            '@type': 'ImageObject',
                            'url': 'https://sippy.lat/images/logos/sippy-s-mark-cheetah.svg',
                          },
                          'sameAs': ['https://x.com/sippylat'],
                          'contactPoint': {
                            '@type': 'ContactPoint',
                            'email': 'hello@sippy.lat',
                            'contactType': 'customer support',
                            'availableLanguage': ['English', 'Spanish', 'Portuguese'],
                          },
                        },
                        {
                          '@type': 'WebSite',
                          '@id': 'https://sippy.lat/#website',
                          'url': 'https://sippy.lat',
                          'name': 'Sippy',
                          'publisher': { '@id': 'https://sippy.lat/#organization' },
                          'inLanguage': ['en', 'es', 'pt'],
                        },
                        {
                          '@type': 'WebApplication',
                          '@id': 'https://sippy.lat/#app',
                          'name': 'Sippy',
                          'url': 'https://sippy.lat',
                          'applicationCategory': 'FinanceApplication',
                          'operatingSystem': 'WhatsApp',
                          'offers': {
                            '@type': 'Offer',
                            'price': '0',
                            'priceCurrency': 'USD',
                          },
                          'description':
                            'Send and receive digital dollars on WhatsApp. Non-custodial USDC wallets on Arbitrum for Latin America.',
                          'availableLanguage': ['English', 'Spanish', 'Portuguese'],
                          'provider': { '@id': 'https://sippy.lat/#organization' },
                        },
                        {
                          '@type': 'FAQPage',
                          'mainEntity': [
                            {
                              '@type': 'Question',
                              'name': 'How does Sippy work?',
                              'acceptedAnswer': {
                                '@type': 'Answer',
                                'text':
                                  'Message Sippy on WhatsApp, verify your phone number, and start sending and receiving USDC digital dollars instantly. No app download or bank account required.',
                              },
                            },
                            {
                              '@type': 'Question',
                              'name': 'Is Sippy free?',
                              'acceptedAnswer': {
                                '@type': 'Answer',
                                'text':
                                  'Yes. Sippy charges zero fees for sending and receiving USDC on Arbitrum.',
                              },
                            },
                            {
                              '@type': 'Question',
                              'name': 'Is my money safe with Sippy?',
                              'acceptedAnswer': {
                                '@type': 'Answer',
                                'text':
                                  'Sippy uses non-custodial wallets, meaning only you control your funds. Your wallet is linked to your phone number and secured on the Arbitrum blockchain.',
                              },
                            },
                            {
                              '@type': 'Question',
                              'name': 'What countries does Sippy support?',
                              'acceptedAnswer': {
                                '@type': 'Answer',
                                'text':
                                  'Sippy is built for Latin America. Anyone with a phone number and WhatsApp can create a wallet and send or receive USDC.',
                              },
                            },
                            {
                              '@type': 'Question',
                              'name': 'Do I need a bank account to use Sippy?',
                              'acceptedAnswer': {
                                '@type': 'Answer',
                                'text':
                                  'No. Sippy works entirely through WhatsApp. You do not need a bank account, a crypto exchange, or any other app to send and receive digital dollars.',
                              },
                            },
                            {
                              '@type': 'Question',
                              'name': 'What is USDC?',
                              'acceptedAnswer': {
                                '@type': 'Answer',
                                'text':
                                  'USDC is a digital dollar stablecoin issued by Circle. Each USDC is backed 1:1 by US dollars held in reserve. Sippy uses USDC on the Arbitrum network for fast, low-cost transfers.',
                              },
                            },
                            {
                              '@type': 'Question',
                              'name': 'How do I send money with Sippy?',
                              'acceptedAnswer': {
                                '@type': 'Answer',
                                'text':
                                  'Just message Sippy on WhatsApp with something like "send 10 to +57..." or "manda 5 a Maria". Sippy understands natural language in English, Spanish, and Portuguese.',
                              },
                            },
                          ],
                        },
                      ],
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
