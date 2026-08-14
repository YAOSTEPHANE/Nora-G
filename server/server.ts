import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from './app.js'
import { prisma } from './lib/prisma.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const publicBrandingPath = path.join(
  projectRoot,
  'apps',
  'web',
  'public',
  'branding',
)

const port = Number(process.env.PORT ?? 4000)
app.use('/branding', express.static(publicBrandingPath))

const server = app.listen(port, () => {
  console.log(`Nora API en écoute sur http://localhost:${port}`)
  void import('./lib/storeSlug.js')
    .then(({ backfillMissingStoreSlugs }) => backfillMissingStoreSlugs())
    .then((n) => {
      if (n > 0) console.log(`[store-slug] ${n} boutique(s) mises à jour (nom d’entreprise).`)
    })
    .catch((err) => {
      console.warn('[store-slug] Backfill :', err instanceof Error ? err.message : err)
    })
  void import('./lib/paymentProviderSettings.js')
    .then(({ refreshPaymentProviderSettings }) => refreshPaymentProviderSettings())
    .then((cfg) => {
      const wave = cfg.waveApiKey ? 'Wave OK' : cfg.waveDemoMode ? 'Wave démo' : 'Wave off'
      const orange =
        cfg.cinetpayApiKey && cfg.cinetpaySiteId
          ? 'Orange/CinetPay OK'
          : cfg.cinetpayDemoMode
            ? 'Orange/CinetPay démo'
            : 'Orange/CinetPay off'
      console.log(`Paiements MM : ${wave} · ${orange}`)
    })
    .catch((err) => {
      console.warn(
        '[payment-providers] Init :',
        err instanceof Error ? err.message : err,
      )
    })
})

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[api] Port ${port} déjà utilisé — un autre process API tourne encore. Arrêtez-le puis relancez.`,
    )
    process.exit(1)
  }
  console.error('[api] Erreur serveur HTTP :', err)
  process.exit(1)
})

const shutdown = async () => {
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
