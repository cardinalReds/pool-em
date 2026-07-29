import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/pool/create'],
        disallow: ['/api/', '/dashboard/', '/pool/'],
      },
    ],
    sitemap: 'https://pool-em.com/sitemap.xml',
  }
}
