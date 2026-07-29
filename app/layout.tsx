import type { Metadata } from 'next'
import './globals.css'
import { Analytics } from '@vercel/analytics/next'

const description = "Your group chat's prediction pool. World Cup, Premier League, F1, MMA, NFL and more."

export const metadata: Metadata = {
  metadataBase: new URL('https://pool-em.com'),
  title: {
    default: "pool'em",
    template: "%s · pool'em",
  },
  description,
  alternates: { canonical: '/' },
  applicationName: "pool'em",
  keywords: ["pool'em", 'poolem', 'prediction pool', 'sports pool', 'World Cup pool', 'Premier League pool', 'F1 pool', 'UFC pool', 'NFL pool', 'friends pool'],
  icons: { icon: '/logo-badge.svg' },
  openGraph: {
    title: "pool'em",
    description,
    url: 'https://pool-em.com',
    siteName: "pool'em",
    type: 'website',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: "pool'em" }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "pool'em",
    description,
    images: ['/opengraph-image'],
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: "pool'em",
  alternateName: ['poolem', 'pool em', 'pool-em', 'pool.em', 'pool them'],
  url: 'https://pool-em.com',
  description,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
