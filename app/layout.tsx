import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { DM_Sans } from 'next/font/google'
import 'leaflet/dist/leaflet.css'
import './globals.css'

const _dmSans = DM_Sans({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Spiagge Elba — Mappa, punteggi e meteo live',
  description:
    'Tutte le spiagge dell&apos;Isola d&apos;Elba su mappa con punteggi reali di accessibilità, bellezza, servizi e spiaggia libera. Meteo, UV e consigli in tempo reale. Dati da OpenStreetMap e Open-Meteo.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f7f5f0',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="it" className="light bg-background">
      <body className="antialiased font-sans">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
