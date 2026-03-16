import type { Metadata, Viewport } from 'next';
import { Chakra_Petch, Electrolize, Space_Mono } from 'next/font/google';
import { ThemeWrapper } from '@/components/ui/theme-wrapper';
import './globals.css';
import { Web3Provider } from './providers/Web3Provider';
import { BlockscoutProvider } from './providers/BlockscoutProvider';
import { CDPProvider } from './providers/cdp-provider';
import { PostHogProvider } from './providers/PostHogProvider';
import { getRequestLang } from '@/lib/i18n-server';

const chakraPetch = Chakra_Petch({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin', 'latin-ext'],
  variable: '--font-chakra-petch',
  display: 'swap',
});

const electrolize = Electrolize({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-electrolize',
  display: 'swap',
});

const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin', 'latin-ext'],
  variable: '--font-space-mono',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Sippy - Send Dollars via WhatsApp',
  description:
    'Transfer digital dollars using just a phone number. No app download, no fees, no complications. Instant transfers powered by Coinbase.',
  keywords:
    'WhatsApp payments, digital dollars, instant transfers, Coinbase, phone number payments, send money WhatsApp, Latin America payments',
  openGraph: {
    title: 'Sippy - Send Dollars via WhatsApp',
    description:
      'Transfer digital dollars using just WhatsApp. No app download. No fees. Instant transfers 24/7.',
    type: 'website',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const lang = await getRequestLang();

  return (
    <html lang={lang} suppressHydrationWarning className={`${chakraPetch.variable} ${electrolize.variable} ${spaceMono.variable}`}>
      <body className='min-h-screen bg-[var(--bg-primary)] antialiased font-sans text-[var(--text-primary)]'>
        <ThemeWrapper>
          <PostHogProvider>
            <BlockscoutProvider>
              <CDPProvider>
                <Web3Provider>
                  <script
                    type='application/ld+json'
                  dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                      '@context': 'https://schema.org',
                      '@type': 'Organization',
                      name: 'Sippy',
                      url: 'https://sippy.lat',
                    }),
                  }}
                />
                {children}
                </Web3Provider>
              </CDPProvider>
            </BlockscoutProvider>
          </PostHogProvider>
        </ThemeWrapper>
      </body>
    </html>
  );
}
