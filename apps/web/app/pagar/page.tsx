/**
 * /pagar — Cómo pagar con Sippy.
 *
 * Server entry: holds metadata + canonical, delegates rendering to the
 * client `PagarContent` which carries the ES/EN bilingual toggle.
 * Static metadata stays ES because (a) the site default is ES and
 * (b) Pizza Day Cartagena is a Spanish-speaking event; we accept the
 * tradeoff that an EN-toggled visitor sees a Spanish browser tab title.
 */

import { Suspense } from 'react'
import type { Metadata } from 'next'
import PagarContent from './PagarContent'

export const metadata: Metadata = {
  title: 'Pagar con Sippy: Guía para clientes',
  description: 'Cómo pagar a un comercio con Sippy. Tres pasos: escaneas, confirmas, listo.',
  alternates: { canonical: 'https://www.sippy.lat/pagar' },
  openGraph: {
    title: 'Pagar con Sippy: Guía para clientes',
    description: 'Escaneas, confirmas, listo. Tres pasos en WhatsApp.',
    type: 'article',
  },
}

export default function PagarPage() {
  // Suspense boundary required by Next 16 because PagarContent uses
  // `useSearchParams()`. Static prerender otherwise bails out at build.
  return (
    <Suspense fallback={null}>
      <PagarContent />
    </Suspense>
  )
}
