import type { Metadata } from 'next';
import './globals.css';
import { Web3Provider } from './providers/Web3Provider';
import { BlockscoutProvider } from './providers/BlockscoutProvider';

export const metadata: Metadata = {
  title: 'Sippy - Send PYUSD via WhatsApp on Arbitrum',
  description:
    'Transfer PayPal USD stablecoin using just a phone number. No wallet app, no gas fees, no blockchain knowledge required. Powered by Coinbase CDP on Arbitrum.',
  keywords:
    'PYUSD, PayPal USD, WhatsApp payments, Arbitrum, Coinbase CDP, stablecoin transfers, gasless payments, phone number wallet',
  openGraph: {
    title: 'Sippy - Send PYUSD via WhatsApp',
    description:
      'Transfer PYUSD stablecoin using just WhatsApp. No wallet app. No gas fees. Instant transfers on Arbitrum.',
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
        <BlockscoutProvider>
          <Web3Provider>
            <script
              type='application/ld+json'
              dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                  '@context': 'https://schema.org',
                  '@type': 'Organization',
                  name: 'Sippy',
                  legalName: 'Mateo Jose Daza Benjumea',
                  url: 'https://sippy.app',
                }),
              }}
            />
            {children}
          </Web3Provider>
        </BlockscoutProvider>
      </body>
    </html>
  );
}
