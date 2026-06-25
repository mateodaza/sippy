/**
 * Pizza Day Cartagena 2026 hub.
 *
 * Server entry: holds metadata + canonical, delegates rendering to the
 * client `PizzaDayContent` which carries the ES/EN bilingual toggle and
 * the routing cards to /pagar and /cobrar. Linked from QR scan welcome
 * messages + admin shares.
 */

import { Suspense } from 'react'
import type { Metadata } from 'next'
import PizzaDayContent from './PizzaDayContent'

export const metadata: Metadata = {
  title: 'Pizza Day Cartagena 2026 · Sippy',
  description:
    'Cómo usar Sippy en Pizza Day Cartagena 2026: conseguir USDC, enviar a otros asistentes, pagar pizza, ganar premios del Quest, reclamar tu POAP.',
  alternates: { canonical: 'https://www.sippy.lat/pizza-day' },
  openGraph: {
    title: 'Pizza Day Cartagena 2026 · Sippy',
    description: 'Guía rápida para el evento. Sippy en WhatsApp.',
    type: 'article',
  },
}

export default function PizzaDayPage() {
  // Suspense boundary required by Next 16 because PizzaDayContent uses
  // `useSearchParams()`. Static prerender otherwise bails out at build.
  return (
    <Suspense fallback={null}>
      <PizzaDayContent />
    </Suspense>
  )
}
