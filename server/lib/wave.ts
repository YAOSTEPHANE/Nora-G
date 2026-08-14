import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  platformPaymentCreds,
  type PaymentProviderCreds,
} from './orgPaymentCredentials.js'
import { buildWaveOpenUrl } from './waveCheckoutPage.js'

const WAVE_API_BASE = 'https://api.wave.com/v1'

export type WaveCheckoutSession = {
  id: string
  amount: string
  currency: string
  checkout_status: 'open' | 'complete' | 'expired'
  payment_status: 'processing' | 'cancelled' | 'succeeded' | null
  wave_launch_url: string
  transaction_id: string | null
  client_reference: string | null
}

export type WaveInitResult = {
  sessionId: string
  paymentUrl: string
  launchUrl: string | null
  demo: boolean
}

export type WaveCheckResult = {
  status: 'ACCEPTED' | 'REFUSED' | 'PENDING' | 'UNKNOWN'
  sessionId: string | null
  transactionId: string | null
  raw: unknown
}

export type WaveWebhookEvent = {
  id: string
  type: string
  data: WaveCheckoutSession
}

function defaultCreds(): PaymentProviderCreds {
  return platformPaymentCreds()
}

export function waveApiKeyConfigured(
  creds: PaymentProviderCreds = defaultCreds(),
): boolean {
  return Boolean(creds.waveApiKey)
}

export function waveDemoMode(
  creds: PaymentProviderCreds = defaultCreds(),
): boolean {
  return creds.waveDemoMode
}

export function waveEnabled(
  creds: PaymentProviderCreds = defaultCreds(),
): boolean {
  return waveApiKeyConfigured(creds) || waveDemoMode(creds)
}

export function waveWebhookSecretConfigured(
  creds: PaymentProviderCreds = defaultCreds(),
): boolean {
  return Boolean(creds.waveWebhookSecret)
}

function requireApiKey(creds: PaymentProviderCreds): string {
  const key = creds.waveApiKey
  if (!key) {
    throw new Error(
      'Clé Wave manquante. Configurez-la dans Intégrations (clés magasin) ou via les variables d’environnement plateforme.',
    )
  }
  return key
}

function buildWaveSignature(
  body: string,
  signingSecret: string | null,
): string | null {
  if (!signingSecret) return null
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = createHmac('sha256', signingSecret)
    .update(timestamp + body)
    .digest('hex')
  return `t=${timestamp},v1=${signature}`
}

async function waveFetch<T>(
  path: string,
  creds: PaymentProviderCreds,
  init: RequestInit & { body?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${requireApiKey(creds)}`,
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }

  const body = init.body
  if (body) {
    headers['Content-Type'] = 'application/json'
    const waveSignature = buildWaveSignature(body, creds.waveSigningSecret)
    if (waveSignature) headers['Wave-Signature'] = waveSignature
  } else if (init.method === 'GET') {
    const waveSignature = buildWaveSignature('', creds.waveSigningSecret)
    if (waveSignature) headers['Wave-Signature'] = waveSignature
  }

  const res = await fetch(`${WAVE_API_BASE}${path}`, { ...init, headers })
  const data = (await res.json()) as T & {
    error?: { code?: string; message?: string }
    message?: string
  }

  if (!res.ok) {
    const message =
      data.error?.message ??
      data.message ??
      `Requête Wave échouée (${res.status})`
    throw new Error(message)
  }

  return data
}

function mapWaveStatus(session: WaveCheckoutSession): WaveCheckResult['status'] {
  if (session.payment_status === 'succeeded' && session.checkout_status === 'complete') {
    return 'ACCEPTED'
  }
  if (session.payment_status === 'cancelled' || session.checkout_status === 'expired') {
    return 'REFUSED'
  }
  if (
    session.payment_status === 'processing' ||
    session.checkout_status === 'open'
  ) {
    return 'PENDING'
  }
  return 'UNKNOWN'
}

export async function initWaveCheckout(
  input: {
    transactionId: string
    amountFcfa: number
    successUrl: string
    errorUrl: string
    payerPhoneE164?: string
  },
  creds: PaymentProviderCreds = defaultCreds(),
): Promise<WaveInitResult> {
  if (waveDemoMode(creds) && !waveApiKeyConfigured(creds)) {
    const base = process.env.APP_URL?.trim() || 'http://localhost:4000'
    return {
      sessionId: `demo-${input.transactionId}`,
      paymentUrl: buildWaveOpenUrl(base, input.transactionId),
      launchUrl: null,
      demo: true,
    }
  }

  const payload: Record<string, string> = {
    amount: String(input.amountFcfa),
    currency: 'XOF',
    success_url: input.successUrl,
    error_url: input.errorUrl,
    client_reference: input.transactionId,
  }

  if (input.payerPhoneE164) {
    payload.restrict_payer_mobile = input.payerPhoneE164
  }

  const body = JSON.stringify(payload)
  const session = await waveFetch<WaveCheckoutSession>(
    '/checkout/sessions',
    creds,
    { method: 'POST', body },
  )

  if (!session.wave_launch_url || !session.id) {
    throw new Error('Réponse Wave invalide : session de paiement incomplète')
  }

  return {
    sessionId: session.id,
    paymentUrl: session.wave_launch_url,
    launchUrl: session.wave_launch_url,
    demo: false,
  }
}

export async function checkWaveCheckoutByReference(
  clientReference: string,
  creds: PaymentProviderCreds = defaultCreds(),
): Promise<WaveCheckResult> {
  if (waveDemoMode(creds) && !waveApiKeyConfigured(creds)) {
    return {
      status: 'PENDING',
      sessionId: null,
      transactionId: null,
      raw: { demo: true },
    }
  }

  const sessions = await waveFetch<{ result?: WaveCheckoutSession[] }>(
    `/checkout/sessions/search?client_reference=${encodeURIComponent(clientReference)}`,
    creds,
    { method: 'GET' },
  )

  const session = sessions.result?.[0]
  if (!session) {
    return {
      status: 'UNKNOWN',
      sessionId: null,
      transactionId: null,
      raw: sessions,
    }
  }

  return {
    status: mapWaveStatus(session),
    sessionId: session.id,
    transactionId: session.transaction_id,
    raw: session,
  }
}

export async function checkWaveCheckoutBySessionId(
  sessionId: string,
  creds: PaymentProviderCreds = defaultCreds(),
): Promise<WaveCheckResult> {
  if (waveDemoMode(creds) && !waveApiKeyConfigured(creds)) {
    return {
      status: 'PENDING',
      sessionId,
      transactionId: null,
      raw: { demo: true },
    }
  }

  const session = await waveFetch<WaveCheckoutSession>(
    `/checkout/sessions/${encodeURIComponent(sessionId)}`,
    creds,
    { method: 'GET' },
  )

  return {
    status: mapWaveStatus(session),
    sessionId: session.id,
    transactionId: session.transaction_id,
    raw: session,
  }
}

export function verifyWaveWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  webhookSecret: string | null = defaultCreds().waveWebhookSecret,
): boolean {
  if (!webhookSecret || !signatureHeader) return false

  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')
  const parts = signatureHeader.split(',')
  const timestampPart = parts.find((p) => p.startsWith('t='))
  if (!timestampPart) return false

  const timestamp = timestampPart.slice(2)
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false

  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > 300) return false

  const signatures = parts
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice(3))

  const expected = createHmac('sha256', webhookSecret)
    .update(timestamp + body)
    .digest('hex')

  return signatures.some((sig) => {
    try {
      const a = Buffer.from(sig, 'hex')
      const b = Buffer.from(expected, 'hex')
      return a.length === b.length && timingSafeEqual(a, b)
    } catch {
      return false
    }
  })
}

export function parseWaveWebhookEvent(rawBody: string): WaveWebhookEvent | null {
  try {
    const parsed = JSON.parse(rawBody) as WaveWebhookEvent
    if (!parsed?.type || !parsed?.data) return null
    return parsed
  } catch {
    return null
  }
}
