import type { Metadata, Viewport } from 'next'

import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'

import '../src/index.css'

import Providers from './providers'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: 'Nora',
  description:
    'Nora — point de vente offline-first pour la Côte d’Ivoire. FCFA, espèces, carte, Wave, Orange Money, MTN MoMo, Moov Money.',
  openGraph: {
    title: 'Nora',
    description:
      'Vendez hors ligne, encaissez en mobile money, gérez vos équipes.',
    type: 'website',
    images: ['/branding/nora-logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/branding/nora-logo.png'],
  },
  icons: {
    icon: [{ url: '/branding/nora-logo.png', type: 'image/png' }],
    apple: [{ url: '/branding/nora-logo.png', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#0033AA',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
