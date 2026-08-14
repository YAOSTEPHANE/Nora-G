import 'dotenv/config'
import { initServerSentry } from './lib/sentry.js'

initServerSentry()

import cors from 'cors'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import morgan from 'morgan'
import { billingRouter, handleStripeWebhook } from './routes/billing.js'
import { storefrontRouter } from './routes/storefront.js'
import {
  handleCinetpayNotify,
  handleWaveWebhook,
  mobileMoneyRouter,
} from './routes/mobileMoney.js'
import { platformPublicRouter } from './routes/siteBranding.js'
import { uploadsRouter } from './routes/uploads.js'
import { syncRouter } from './routes/sync.js'
import { staffRouter } from './routes/staff.js'
import { orgRouter } from './routes/org.js'
import { fiscalRouter } from './routes/fiscal.js'
import { webhookRouter } from './routes/webhooks.js'

export const app = express()

app.set('trust proxy', 1)
app.use(helmet({ contentSecurityPolicy: false }))

const vercelOrigins = [
  process.env.VERCEL_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
].filter((value): value is string => Boolean(value))

const allowedOrigins = new Set(
  [
    process.env.APP_URL,
    process.env.NEXT_DEV_ORIGIN,
    ...vercelOrigins.map((host) => `https://${host}`),
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ].filter((value): value is string => Boolean(value)),
)

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true)
        return
      }
      callback(new Error('Origine CORS refusée'))
    },
  }),
)

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})
const syncLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

app.use('/api', apiLimiter)
app.use(
  [
    '/api/billing/register',
    '/api/billing/login',
    '/api/billing/attach',
    '/api/webhooks',
  ],
  sensitiveLimiter,
)
// Limiteur sync : chemins /api/nora/*.
app.use(['/api/nora/sync', '/api/nora/sync/pull'], syncLimiter)
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook,
)
app.post(
  '/api/billing/cinetpay/notify',
  express.urlencoded({ extended: true }),
  handleCinetpayNotify,
)
app.post('/api/billing/cinetpay/notify', express.json(), handleCinetpayNotify)
app.post(
  '/api/billing/wave/webhook',
  express.raw({ type: 'application/json' }),
  handleWaveWebhook,
)
// Logos / bannières en data URL (≤ 500 Ko fichier ≈ 0,7 Mo base64) + marge.
app.use(express.json({ limit: '4mb' }))
app.use(morgan('dev'))

import { prisma } from './lib/prisma.js'

const startedAt = Date.now()
const APP_VERSION = process.env.npm_package_version ?? '1.0.0'

async function healthHandler(
  _req: express.Request,
  res: express.Response,
): Promise<void> {
  let dbOk = false
  try {
    await prisma.organization.count({ take: 1 })
    dbOk = true
  } catch {
    dbOk = false
  }
  const ok = dbOk
  res.status(ok ? 200 : 503).json({
    ok,
    version: APP_VERSION,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    db: dbOk ? 'up' : 'down',
  })
}

app.get('/health', healthHandler)
/** Alias sous /api quand seul /api/* est routé vers Express (Vercel serverless). */
app.get('/api/health', healthHandler)

app.use('/api', syncRouter)
app.use('/api', staffRouter)
app.use('/api', orgRouter)
app.use('/api', fiscalRouter)
app.use('/api', webhookRouter)
app.use('/api', billingRouter)
app.use('/api', storefrontRouter)
app.use('/api', mobileMoneyRouter)
app.use('/api', platformPublicRouter)
app.use('/api', uploadsRouter)
