import path from 'node:path'
import { fileURLToPath } from 'node:url'
import withPWA from 'next-pwa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '../..')
const apiOrigin = process.env.API_PROXY_TARGET ?? 'http://localhost:4000'

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: repoRoot,
  // Monorepo : Next tourne dans apps/web ; Vercel attend .next à la racine du service.
  distDir: '../../.next',
  allowedDevOrigins: ['127.0.0.1', 'localhost', '192.168.1.68'],
  // next-pwa injecte une config webpack → explicite pour Next 16
  turbopack: {},
  experimental: {
    externalDir: true,
    // Next 16.3 active InnerScrollHandlerNew (<Fragment ref={...}>) ; React 19.2
    // stable rejette encore ce ref → console "Invalid prop ref supplied to React.Fragment".
    // Opt-out jusqu’à un React avec FragmentInstance pleinement supporté.
    appNewScrollHandler: false,
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
      { source: '/health', destination: `${apiOrigin}/health` },
      { source: '/webhooks/:path*', destination: `${apiOrigin}/webhooks/:path*` },
      { source: '/uploads/:path*', destination: `${apiOrigin}/uploads/:path*` },
    ]
  },
  // Ne pas aliaser react/react-dom vers node_modules : le App Router Next 16
  // utilise son propre runtime React ; forcer l’alias provoque
  // « Invalid hook call » / useContext(null) dans SegmentTrieNode (devtools).
  // La junction apps/web/src → ../../src suffit pour une seule copie côté app.
}

const withPWACfg = withPWA({
  dest: 'public',
  register: true,
  disable: process.env.NODE_ENV === 'development',
  // Exclure les assets marketing lourds du precache.
  publicExcludes: ['marketing/**/*'],
  // App Router : `/` n’est pas dans le precache Workbox.
  // `navigateFallback: '/'` → Uncaught non-precached-url au démarrage du SW.
  fallbacks: false,
  runtimeCaching: [
    {
      // Ne jamais servir l’API depuis le cache (auth, billing, sync).
      urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
      handler: 'NetworkOnly',
    },
    {
      urlPattern: /\/marketing\/.+\.(?:png|jpg|jpeg|webp)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'marketing-images',
        expiration: {
          maxEntries: 12,
          maxAgeSeconds: 60 * 60 * 24 * 30,
        },
      },
    },
    {
      urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts-cdn-fallback',
        expiration: {
          maxEntries: 20,
          maxAgeSeconds: 60 * 60 * 24 * 365,
        },
      },
    },
  ],
})

export default withPWACfg(nextConfig)
