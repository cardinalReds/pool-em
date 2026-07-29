import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://pool-em.com'
  const routes = ['', '/about', '/auth/login', '/auth/signup', '/pool/create', '/privacy', '/terms']
  return routes.map(route => ({
    url: `${base}${route}`,
    lastModified: new Date(),
  }))
}
