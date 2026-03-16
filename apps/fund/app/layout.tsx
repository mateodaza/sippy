import type { Metadata, Viewport } from 'next';
import { Chakra_Petch, Electrolize, Space_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import './globals.css';
import { Web3Provider } from './providers/Web3Provider';

const chakraPetch = Chakra_Petch({
  weight: ['400', '500', '600', '700'],
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
  title: 'Fund a Sippy Account',
  description:
    'Send USDC from any chain to a Sippy phone number account on Arbitrum.',
  openGraph: {
    title: 'Fund a Sippy Account',
    description: 'Send USDC from any chain to a Sippy account.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang='en' suppressHydrationWarning className={`${chakraPetch.variable} ${electrolize.variable} ${spaceMono.variable}`}>
      <body className='min-h-screen bg-[var(--bg-primary)] antialiased font-sans text-[var(--text-primary)]'>
        <ThemeProvider attribute='class' defaultTheme='system' storageKey='sippy_fund_theme'>
          <Web3Provider>{children}</Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
