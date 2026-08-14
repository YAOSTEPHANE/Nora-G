import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { sendSms } from '../lib/sms.js'
import { requireWebhookToken } from '../lib/webhookAuth.js'

export const webhookRouter = Router()

type NormalizedOrder = {
  externalOrderRef: string
  customerName: string
  customerPhone?: string
  customerAddress?: string
  totalTTC: number
  currency?: string
  fulfillmentMode: 'delivery' | 'pickup'
  sourcePlatform: string
  rawStatus?: string
}

function asObject(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input != null
    ? (input as Record<string, unknown>)
    : {}
}

function asString(input: unknown): string | undefined {
  return typeof input === 'string' && input.trim() ? input.trim() : undefined
}

function asNumber(input: unknown): number | undefined {
  if (typeof input === 'number' && Number.isFinite(input)) return input
  if (typeof input === 'string') {
    const n = Number(input.replace(',', '.'))
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function normalizePayload(
  sourcePlatform: string,
  payload: Record<string, unknown>,
): NormalizedOrder | null {
  const order = asObject(payload.order ?? payload.data ?? payload)
  const customer = asObject(order.customer)
  const shipping = asObject(order.shippingAddress ?? order.deliveryAddress)
  const total =
    asNumber(order.totalTTC) ??
    asNumber(order.total) ??
    asNumber(order.amount) ??
    0
  const externalOrderRef =
    asString(order.id) ??
    asString(order.orderId) ??
    asString(order.reference) ??
    asString(payload.id)
  const customerName =
    asString(customer.name) ??
    asString(order.customerName) ??
    asString(order.name) ??
    'Client web'
  const fulfillmentRaw =
    asString(order.fulfillmentMode) ?? asString(order.fulfillment)
  const fulfillmentMode =
    fulfillmentRaw === 'pickup' || fulfillmentRaw === 'retrait'
      ? 'pickup'
      : 'delivery'

  if (!externalOrderRef || total <= 0) return null

  return {
    externalOrderRef,
    customerName,
    customerPhone: asString(customer.phone) ?? asString(order.customerPhone),
    customerAddress: asString(shipping.address) ?? asString(order.customerAddress),
    totalTTC: Math.round(total),
    currency: asString(order.currency),
    fulfillmentMode,
    sourcePlatform,
    rawStatus: asString(order.status),
  }
}

async function storeWebhookEvent(reqBody: unknown, source: string): Promise<string> {
  const payload = asObject(reqBody)
  const eventType = asString(payload.type) ?? 'order.received'
  const externalId = asString(payload.id)
  const normalizedOrder = normalizePayload(source, payload)
  const eventPayload: Record<string, unknown> = {
    ...payload,
    normalizedOrder,
    receivedVia: 'webhook',
  }
  const event = await prisma.webhookEvent.create({
    data: {
      source,
      eventType,
      externalId: externalId ?? normalizedOrder?.externalOrderRef,
      payload: eventPayload as Prisma.InputJsonValue,
    },
  })
  return event.id
}

type SmsWebhookPayload = {
  to: string
  message: string
  orderId?: string
  storeId?: string
  customerName?: string
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

webhookRouter.post('/webhooks/sms', requireWebhookToken, async (req, res) => {
  try {
    const payload = asObject(req.body) as Partial<SmsWebhookPayload>
    const to = asString(payload.to)
    const message = asString(payload.message)
    if (!to || !message) {
      return res.status(400).json({
        ok: false,
        message: 'Payload invalide: "to" et "message" sont requis.',
      })
    }
    const normalizedTo = normalizePhone(to)
    if (normalizedTo.length < 8) {
      return res.status(400).json({
        ok: false,
        message: 'Numero de telephone invalide.',
      })
    }

    const result = await sendSms({
      to: normalizedTo,
      message,
      meta: {
        orderId: asString(payload.orderId),
        storeId: asString(payload.storeId),
        customerName: asString(payload.customerName),
      },
    })
    if ('error' in result) {
      return res.status(502).json({ ok: false, message: result.error })
    }
    return res.status(202).json({
      ok: true,
      mode: result.mode,
      message:
        result.mode === 'demo'
          ? 'SMS journalise en mode demo (provider non configure).'
          : 'SMS transmis au provider.',
    })
  } catch (error) {
    console.error('[webhook:sms] erreur', error)
    return res.status(500).json({
      ok: false,
      message: 'Erreur serveur lors de lenvoi SMS',
    })
  }
})

webhookRouter.post('/webhooks/orders', requireWebhookToken, async (req, res) => {
  try {
    const source =
      req.header('x-platform') ??
      req.query.source?.toString() ??
      'external-platform'
    const eventId = await storeWebhookEvent(req.body, source)
    return res.status(202).json({
      ok: true,
      webhookEventId: eventId,
    })
  } catch (error) {
    console.error('[webhook:orders] erreur', error)
    return res.status(500).json({
      ok: false,
      message: 'Erreur serveur lors de la réception webhook commandes',
    })
  }
})

// Webhook générique Nora.
webhookRouter.post('/webhooks/nora', requireWebhookToken, async (req, res) => {
  try {
    const eventId = await storeWebhookEvent(req.body, 'nora')
    return res.status(201).json({
      ok: true,
      webhookEventId: eventId,
    })
  } catch (error) {
    console.error('[webhook] erreur', error)
    return res.status(500).json({
      ok: false,
      message: 'Erreur serveur lors de la réception webhook',
    })
  }
})
