import type { Metadata } from 'next';
import './globals.css';
import { Web3Provider } from './providers/Web3Provider';

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
    <html lang='en'>
      <body className='min-h-screen bg-gradient-to-br from-white via-[#eefaf4] to-[#f8fbff] antialiased'>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
