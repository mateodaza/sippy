import type { Metadata } from 'next';
import './globals.css';
import { Web3Provider } from './providers/Web3Provider';
import { BlockscoutProvider } from './providers/BlockscoutProvider';

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
