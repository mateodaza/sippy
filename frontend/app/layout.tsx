import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SIPPY - WhatsApp Payments with PYUSD',
  description: 'Send money via WhatsApp using PYUSD on Arbitrum',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang='en'>
      <body>{children}</body>
    </html>
  );
}
