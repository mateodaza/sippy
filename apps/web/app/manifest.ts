import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sippy — Send Dollars via WhatsApp',
    short_name: 'Sippy',
    description:
      'Digital dollars on WhatsApp. No app, no fees, instant USDC transfers on Arbitrum for Latin America.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0A0A0F',
    theme_color: '#00AFD7',
    icons: [
      {
        src: '/icon',
        sizes: '32x32',
        type: 'image/png',
      },
    ],
  }
}
