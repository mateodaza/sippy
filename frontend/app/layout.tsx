import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SIPPY - WhatsApp Digital Assistant',
  description: 'Connect, communicate, and manage your digital services through WhatsApp. Simple, secure, and available to everyone.',
  keywords: 'WhatsApp assistant, messaging service, digital services, WhatsApp automation, smart assistant',
  openGraph: {
    title: 'SIPPY - WhatsApp Digital Assistant',
    description: 'Connect and communicate through WhatsApp with our smart digital assistant.',
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
      <body>{children}</body>
    </html>
  );
}
