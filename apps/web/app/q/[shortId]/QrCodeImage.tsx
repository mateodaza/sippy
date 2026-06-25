'use client'

import { QRCodeSVG } from 'qrcode.react'

/**
 * Renders a scannable QR encoding `waUrl` on the desktop fallback of /q/[shortId].
 *
 * The /q page is a Server Component. qrcode.react needs a client runtime, so
 * this is a tiny client-component wrapper. The QR value is the wa.me URL so a
 * phone scanning it lands directly in WhatsApp — no extra /q round-trip.
 */
export function QrCodeImage({ waUrl }: { waUrl: string }) {
  // /q/* is forced-dark via ThemeWrapper, so the QR sits on a near-black
  // card. White-on-transparent matches the receive-money surface and stays
  // scannable; modern phone cameras handle inverted QR codes fine.
  return (
    <QRCodeSVG
      value={waUrl}
      size={200}
      level="H"
      fgColor="#FFFFFF"
      bgColor="transparent"
      includeMargin
    />
  )
}
