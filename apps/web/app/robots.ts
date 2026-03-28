import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/setup/', '/settings/', '/profile/', '/wallet/'],
      },
    ],
    sitemap: 'https://sippy.lat/sitemap.xml',
  }
}
