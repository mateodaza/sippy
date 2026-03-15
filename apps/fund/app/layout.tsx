import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk, Space_Mono } from 'next/font/google';
import './globals.css';
import { Web3Provider } from './providers/Web3Provider';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-space-grotesk',
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
    <html lang='en' className={`${inter.variable} ${spaceGrotesk.variable} ${spaceMono.variable}`}>
      <body className='min-h-screen bg-white antialiased font-sans text-brand-dark'>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
