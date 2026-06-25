/**
 * /cobrar — Cómo recibir pagos con Sippy.
 *
 * Server entry: holds metadata + canonical, delegates rendering to the
 * client `CobrarContent` which carries the ES/EN bilingual toggle.
 * Static metadata stays ES because the Cartagena audience is
 * Spanish-speaking; EN-toggled visitors get the bilingual body inside.
 */

import { Suspense } from 'react'
import type { Metadata } from 'next'
import CobrarContent from './CobrarContent'

export const metadata: Metadata = {
  title: 'Cobrar con Sippy: Cómo recibir pagos',
  description:
    'Cómo recibir pagos en USDC con Sippy. Funciona para comercios, eventos o entre amigos. Tres pasos, sin instalar nada.',
  alternates: { canonical: 'https://www.sippy.lat/cobrar' },
  openGraph: {
    title: 'Cobrar con Sippy: Cómo recibir pagos',
    description: 'Comercios, eventos o entre amigos. Recibe USDC en tres pasos. Sin instalar nada.',
    type: 'article',
  },
}

export default function CobrarPage() {
  // Suspense boundary required by Next 16 because CobrarContent uses
  // `useSearchParams()`. Static prerender otherwise bails out at build.
  return (
    <Suspense fallback={null}>
      <CobrarContent />
    </Suspense>
  )
}
