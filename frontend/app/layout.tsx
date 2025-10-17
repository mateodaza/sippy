import type { Metadata } from 'next';
import './globals.css';
import { Web3Provider } from './providers/Web3Provider';

export const metadata: Metadata = {
  title: 'SIPPY - WhatsApp Digital Assistant',
  description:
    'Connect, communicate, and manage your digital services through WhatsApp. Simple, secure, and available to everyone.',
  keywords:
    'WhatsApp assistant, messaging service, digital services, WhatsApp automation, smart assistant',
  openGraph: {
    title: 'SIPPY - WhatsApp Digital Assistant',
    description:
      'Connect and communicate through WhatsApp with our smart digital assistant.',
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
      <body>
        <Web3Provider>
          <script
            type='application/ld+json'
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'Organization',
                name: 'SIPPY',
                legalName: 'Mateo Jose Daza Benjumea',
                url: 'https://sippy.app',
              }),
            }}
          />
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}
