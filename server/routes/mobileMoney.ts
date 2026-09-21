import { Router, type Request, type Response } from 'express'
import {
  checkCinetpayPayment,
  cinetpayConfigured,
  cinetpayDemoMode,
  mobileMoneyEnabled,
  parseNotifyStatus,
} from '../lib/cinetpay.js'
import {
  parseWaveWebhookEvent,
  verifyWaveWebhookSignature,
  waveApiKeyConfigured,
  waveDemoMode,
  waveEnabled,
} from '../lib/wave.js'
import {
  MOBILE_MONEY_CHANNELS_CI,
  channelById,
} from '../lib/mobileMoneyChannels.js'
import { prisma } from '../lib/prisma.js'
import {
  asOrgPaymentFields,
  merchantPaymentCreds,
  platformPaymentCreds,
} from '../lib/orgPaymentCredentials.js'
import { ensurePaymentConfigReady } from '../lib/paymentProviderSettings.js'
import { calculateRenewalPeriodEnd } from '../lib/subscriptionActivation.js'
import {
  findStorefrontOrderByExternalId,
  markStorefrontOrderPaid,
  markStorefrontOrderPaymentRefused,
} from '../lib/storefrontWave.js'
import { SUBSCRIPTION_PLANS, type PlanId } from '../lib/subscriptionPlans.js'
import {
  publicAppUrl,
  subscriptionCancelUrl,
  subscriptionSuccessUrl,
} from '../lib/appUrls.js'
import {
  renderWaveCheckoutPage,
  waveOpenPath,
} from '../lib/waveCheckoutPage.js'

export const mobileMoneyRouter = Router()

function parsePlanId(value: string | undefined): PlanId {
  if (value === 'pro' || value === 'business') return value
  return 'starter'
}

async function markPaymentAccepted(paymentId: string, extra?: {
  operatorId?: string | null
  paymentMethod?: string | null
  notifyPayload?: unknown
}) {
  const billingProvider =
    extra?.paymentMethod?.startsWith('wave') ? 'wave' : 'mobile_money'
  return prisma.$transaction(async (tx) => {
    const currentPayment = await tx.mobileMoneyPayment.findUnique({
      where: { id: paymentId },
    })
    if (!currentPayment) throw new Error('Paiement introuvable.')
    if (currentPayment.status === 'accepted') return currentPayment

    const organization = await tx.organization.findUnique({
      where: { id: currentPayment.organizationId },
      select: { currentPeriodEnd: true, billingPhone: true },
    })
    if (!organization) throw new Error('Organisation introuvable.')

    const paidAt = new Date()
    await tx.organization.update({
      where: { id: currentPayment.organizationId },
      data: {
        planId: parsePlanId(currentPayment.planId),
        status: 'active',
        currentPeriodEnd: calculateRenewalPeriodEnd(
          organization.currentPeriodEnd,
          paidAt,
        ),
        billingProvider,
        trialEndsAt: null,
        billingPhone: organization.billingPhone ?? currentPayment.customerPhone,
      },
    })

    return tx.mobileMoneyPayment.update({
      where: { id: paymentId },
      data: {
        status: 'accepted',
        paidAt,
        operatorId: extra?.operatorId ?? undefined,
        paymentMethod: extra?.paymentMethod ?? undefined,
        notifyPayload: extra?.notifyPayload as object | undefined,
      },
    })
  })
}

type WaveCheckoutContext = {
  amountFcfa: number
  merchantLabel: string
  customerPhone?: string
  launchUrl: string | null
  demo: boolean
  acceptAction: string
  refuseAction: string
}

async function resolveWaveCheckoutContext(
  transactionId: string,
): Promise<WaveCheckoutContext | null> {
  const payment = await prisma.mobileMoneyPayment.findUnique({
    where: { transactionId },
    include: { organization: true },
  })

  if (payment) {
    const notify =
      typeof payment.notifyPayload === 'object' && payment.notifyPayload !== null
        ? (payment.notifyPayload as { waveLaunchUrl?: string })
        : {}
    const plan = SUBSCRIPTION_PLANS[parsePlanId(payment.planId)]
    return {
      amountFcfa: payment.amountFcfa,
      merchantLabel: `Wave — ${plan.name}`,
      customerPhone: payment.customerPhone,
      launchUrl: notify.waveLaunchUrl ?? null,
      demo: payment.paymentMethod === 'wave_demo' || waveDemoMode(),
      acceptAction: `/api/billing/wave/demo/${encodeURIComponent(transactionId)}/accept`,
      refuseAction: `/api/billing/wave/demo/${encodeURIComponent(transactionId)}/refuse`,
    }
  }

  const storefrontOrder = await findStorefrontOrderByExternalId(transactionId)
  if (!storefrontOrder) return null

  const payload =
    typeof storefrontOrder.payload === 'object' && storefrontOrder.payload !== null
      ? (storefrontOrder.payload as Record<string, unknown>)
      : {}
  const totalTTC = typeof payload.totalTTC === 'number' ? payload.totalTTC : 0
  const storeName =
    typeof payload.storeName === 'string' ? payload.storeName : 'Boutique'
  const customerPhone =
    typeof payload.customerPhone === 'string' ? payload.customerPhone : undefined
  const launchUrl =
    typeof payload.waveLaunchUrl === 'string' ? payload.waveLaunchUrl : null

  return {
    amountFcfa: totalTTC,
    merchantLabel: storeName,
    customerPhone,
    launchUrl,
    demo: launchUrl === null || waveDemoMode(),
    acceptAction: `/api/billing/wave/demo/${encodeURIComponent(transactionId)}/accept?kind=storefront`,
    refuseAction: `/api/billing/wave/demo/${encodeURIComponent(transactionId)}/refuse?kind=storefront`,
  }
}

mobileMoneyRouter.get('/billing/mobile-money/channels', async (_req, res) => {
  await ensurePaymentConfigReady()
  const cinetpayOn = cinetpayConfigured() || (cinetpayDemoMode() && !waveEnabled())
  res.json({
    channels: MOBILE_MONEY_CHANNELS_CI.map((channel) => ({
      ...channel,
      provider:
        channel.id === 'wave' && waveEnabled()
          ? 'wave'
          : cinetpayOn
            ? 'cinetpay'
            : null,
    })),
    enabled: mobileMoneyEnabled(),
    demo:
      (cinetpayDemoMode() && !cinetpayConfigured() && !waveApiKeyConfigured()) ||
      (waveDemoMode() && !waveApiKeyConfigured() && !cinetpayConfigured()),
    waveEnabled: waveEnabled(),
    waveDirect: waveEnabled(),
    cinetpayEnabled: cinetpayOn,
    country: 'CI',
  })
})

mobileMoneyRouter.post('/billing/mobile-money/checkout', (_req, res) => {
  res.status(410).json({ error: 'Les abonnements payants ont été retirés.' })
})

mobileMoneyRouter.get('/billing/mobile-money/verify/:transactionId', (_req, res) => {
  res.status(410).json({ error: 'Les abonnements payants ont été retirés.' })
})

export async function handleCinetpayNotify(req: Request, res: Response) {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const { transactionId, status } = parseNotifyStatus(body)
    if (!transactionId) {
      res.status(400).send('transaction_id manquant')
      return
    }

    const payment = await prisma.mobileMoneyPayment.findUnique({
      where: { transactionId },
    })
    if (!payment) {
      res.status(404).send('transaction inconnue')
      return
    }

    if (payment.status === 'accepted') {
      res.status(200).send('OK')
      return
    }

    if (status === 'ACCEPTED') {
      const check = await checkCinetpayPayment(transactionId)
      if (check.status === 'ACCEPTED') {
        await markPaymentAccepted(payment.id, {
          operatorId: check.operatorId,
          paymentMethod: check.paymentMethod,
          notifyPayload: { notify: body, check: check.raw },
        })
      }
    } else if (status === 'REFUSED') {
      await prisma.mobileMoneyPayment.update({
        where: { id: payment.id },
        data: { status: 'refused', notifyPayload: body as object },
      })
    }

    res.status(200).send('OK')
  } catch (err) {
    console.error('[cinetpay/notify]', err)
    res.status(500).send('ERR')
  }
}

export async function handleWaveWebhook(req: Request, res: Response) {
  try {
    await ensurePaymentConfigReady()
    const rawBody =
      typeof req.body === 'string'
        ? req.body
        : Buffer.isBuffer(req.body)
          ? req.body.toString('utf8')
          : ''

    const event = parseWaveWebhookEvent(rawBody)
    if (!event) {
      res.status(400).send('Invalid payload')
      return
    }

    const clientReference = event.data.client_reference?.trim() ?? ''
    const payment = clientReference
      ? await prisma.mobileMoneyPayment.findUnique({
          where: { transactionId: clientReference },
          include: { organization: true },
        })
      : null
    const storefrontOrder = !payment && clientReference
      ? await findStorefrontOrderByExternalId(clientReference)
      : null

    let webhookSecret: string | null = null
    let allowDemoWithoutSecret = false

    if (payment?.organization) {
      // Paiement abonnement Nora → clés plateforme.
      const platform = platformPaymentCreds()
      webhookSecret = platform.waveWebhookSecret
      allowDemoWithoutSecret = waveDemoMode(platform)
    } else if (storefrontOrder) {
      const org = await prisma.organization.findUnique({
        where: { id: storefrontOrder.organizationId },
      })
      if (org) {
        const creds = merchantPaymentCreds(asOrgPaymentFields(org))
        webhookSecret = creds.waveWebhookSecret
        allowDemoWithoutSecret = waveDemoMode(creds)
      }
    } else {
      const platform = platformPaymentCreds()
      webhookSecret = platform.waveWebhookSecret
      allowDemoWithoutSecret = waveDemoMode(platform)
    }

    const signature = req.get('Wave-Signature') ?? req.get('wave-signature') ?? undefined
    if (!webhookSecret && !allowDemoWithoutSecret) {
      res.status(503).send('Wave webhook not configured')
      return
    }
    if (
      webhookSecret &&
      !verifyWaveWebhookSignature(rawBody, signature, webhookSecret)
    ) {
      res.status(401).send('Invalid signature')
      return
    }

    if (
      event.type !== 'checkout.session.completed' &&
      event.type !== 'checkout.session.payment_failed'
    ) {
      res.status(200).send('OK')
      return
    }

    if (!clientReference) {
      res.status(200).send('OK')
      return
    }

    const succeeded =
      event.type === 'checkout.session.completed' &&
      event.data.payment_status === 'succeeded' &&
      event.data.checkout_status === 'complete'

    if (payment) {
      if (payment.status === 'accepted') {
        res.status(200).send('OK')
        return
      }

      if (succeeded) {
        await markPaymentAccepted(payment.id, {
          operatorId: event.data.transaction_id,
          paymentMethod: 'wave',
          notifyPayload: { webhook: event },
        })
      } else if (event.type === 'checkout.session.payment_failed') {
        await prisma.mobileMoneyPayment.update({
          where: { id: payment.id },
          data: {
            status: 'refused',
            notifyPayload: { webhook: event } as object,
          },
        })
      }

      res.status(200).send('OK')
      return
    }

    if (storefrontOrder) {
      if (succeeded) {
        await markStorefrontOrderPaid(storefrontOrder.externalId, {
          waveSessionId: event.data.id,
          waveTransactionId: event.data.transaction_id,
          notifyPayload: { webhook: event },
        })
      } else if (event.type === 'checkout.session.payment_failed') {
        await markStorefrontOrderPaymentRefused(storefrontOrder.externalId, {
          webhook: event,
        })
      }
      res.status(200).send('OK')
      return
    }

    res.status(200).send('OK')
  } catch (err) {
    console.error('[wave/webhook]', err)
    res.status(500).send('ERR')
  }
}

mobileMoneyRouter.get('/billing/wave/open/:transactionId', async (req, res) => {
  const transactionId = req.params.transactionId?.trim()
  if (!transactionId) {
    res.status(400).send('transactionId manquant')
    return
  }

  const ctx = await resolveWaveCheckoutContext(transactionId)
  if (!ctx) {
    res.status(404).send('Transaction introuvable')
    return
  }

  if (ctx.launchUrl && !ctx.demo) {
    res.redirect(302, ctx.launchUrl)
    return
  }

  try {
    const html = await renderWaveCheckoutPage({
      amountFcfa: ctx.amountFcfa,
      merchantLabel: ctx.merchantLabel,
      customerPhone: ctx.customerPhone,
      launchUrl: ctx.launchUrl,
      demo: ctx.demo,
      transactionId,
      acceptAction: ctx.acceptAction,
      refuseAction: ctx.refuseAction,
    })
    res.type('html').send(html)
  } catch (err) {
    console.error('[wave/open]', err)
    res.status(500).send('Impossible d’ouvrir le paiement Wave.')
  }
})

mobileMoneyRouter.get('/billing/wave/demo', async (req, res) => {
  if (!waveDemoMode()) {
    res.status(404).send('Mode démo Wave désactivé')
    return
  }

  const transactionId =
    typeof req.query.transactionId === 'string' ? req.query.transactionId : ''
  if (!transactionId) {
    res.status(400).send('transactionId manquant')
    return
  }

  res.redirect(
    302,
    `${publicAppUrl(req)}${waveOpenPath(transactionId)}`,
  )
})

mobileMoneyRouter.post('/billing/wave/demo/:transactionId/accept', async (req, res) => {
  if (!waveDemoMode()) {
    res.status(404).send('Mode démo Wave désactivé')
    return
  }
  const transactionId = req.params.transactionId
  const kind = typeof req.query.kind === 'string' ? req.query.kind : ''

  if (kind === 'storefront') {
    const order = await findStorefrontOrderByExternalId(transactionId)
    if (!order) {
      res.status(404).send('Commande introuvable')
      return
    }
    await markStorefrontOrderPaid(transactionId, {
      notifyPayload: { demo: true, action: 'accept', provider: 'wave' },
    })
    const payload =
      typeof order.payload === 'object' && order.payload !== null
        ? (order.payload as Record<string, unknown>)
        : {}
    const storeCode =
      typeof payload.storeCode === 'string' ? payload.storeCode : order.storeCode
    const storeSlug =
      typeof payload.storeSlug === 'string' ? payload.storeSlug.trim() : ''
    const boutiqueKey = storeSlug || storeCode
    const returnUrl = `${publicAppUrl(req)}/boutique/${encodeURIComponent(boutiqueKey)}?order=${encodeURIComponent(transactionId)}&payment=success`
    res.redirect(returnUrl)
    return
  }

  const payment = await prisma.mobileMoneyPayment.findUnique({
    where: { transactionId },
  })
  if (!payment) {
    res.status(404).send('Transaction introuvable')
    return
  }
  await markPaymentAccepted(payment.id, {
    paymentMethod: 'wave_demo',
    notifyPayload: { demo: true, action: 'accept', provider: 'wave' },
  })
  const returnUrl = subscriptionSuccessUrl(publicAppUrl(req), transactionId)
  res.redirect(returnUrl)
})

mobileMoneyRouter.post('/billing/wave/demo/:transactionId/refuse', async (req, res) => {
  if (!waveDemoMode()) {
    res.status(404).send('Mode démo Wave désactivé')
    return
  }
  const transactionId = req.params.transactionId
  const kind = typeof req.query.kind === 'string' ? req.query.kind : ''

  if (kind === 'storefront') {
    const order = await findStorefrontOrderByExternalId(transactionId)
    if (!order) {
      res.status(404).send('Commande introuvable')
      return
    }
    await markStorefrontOrderPaymentRefused(transactionId, {
      demo: true,
      action: 'refuse',
      provider: 'wave',
    })
    const payload =
      typeof order.payload === 'object' && order.payload !== null
        ? (order.payload as Record<string, unknown>)
        : {}
    const storeCode =
      typeof payload.storeCode === 'string' ? payload.storeCode : order.storeCode
    const storeSlug =
      typeof payload.storeSlug === 'string' ? payload.storeSlug.trim() : ''
    const boutiqueKey = storeSlug || storeCode
    res.redirect(
      `${publicAppUrl(req)}/boutique/${encodeURIComponent(boutiqueKey)}?order=${encodeURIComponent(transactionId)}&payment=cancel`,
    )
    return
  }

  await prisma.mobileMoneyPayment.updateMany({
    where: { transactionId },
    data: {
      status: 'refused',
      notifyPayload: { demo: true, action: 'refuse', provider: 'wave' },
    },
  })
  res.redirect(subscriptionCancelUrl(publicAppUrl(req)))
})

mobileMoneyRouter.get('/billing/mobile-money/demo', async (req, res) => {
  if (!cinetpayDemoMode()) {
    res.status(404).send('Mode démo désactivé')
    return
  }

  const transactionId =
    typeof req.query.transactionId === 'string' ? req.query.transactionId : ''
  if (!transactionId) {
    res.status(400).send('transactionId manquant')
    return
  }

  const payment = await prisma.mobileMoneyPayment.findUnique({
    where: { transactionId },
    include: { organization: true },
  })
  if (!payment) {
    res.status(404).send('Transaction introuvable')
    return
  }

  const plan = SUBSCRIPTION_PLANS[parsePlanId(payment.planId)]
  const channel = channelById(payment.channel)

  res.type('html').send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Nora — Démo mobile money</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 420px; margin: 3rem auto; padding: 0 1rem; color: #18181b; }
    .card { border: 1px solid #e4e4e7; border-radius: 16px; padding: 1.5rem; }
    h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
    p { color: #52525b; font-size: .95rem; line-height: 1.5; }
    .amount { font-size: 1.5rem; font-weight: 700; margin: 1rem 0; }
    button { width: 100%; padding: .85rem 1rem; border: 0; border-radius: 10px; font-weight: 600; cursor: pointer; margin-top: .5rem; }
    .ok { background: #059669; color: white; }
    .ko { background: #f4f4f5; color: #18181b; }
    .badge { display: inline-block; background: #fff7ed; color: #9a3412; padding: .2rem .5rem; border-radius: 999px; font-size: .75rem; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Mode démo CinetPay</span>
    <h1>${channel?.label ?? 'Mobile Money'} — ${plan.name}</h1>
    <p>${payment.organization.name}<br />${payment.customerPhone}</p>
    <div class="amount">${plan.priceFcfa.toLocaleString('fr-CI')} F CFA</div>
    <p>Simulez la confirmation USSM / push sur le téléphone du client.</p>
    <form method="post" action="/api/billing/mobile-money/demo/${encodeURIComponent(transactionId)}/accept">
      <button class="ok" type="submit">Confirmer le paiement</button>
    </form>
    <form method="post" action="/api/billing/mobile-money/demo/${encodeURIComponent(transactionId)}/refuse">
      <button class="ko" type="submit">Refuser</button>
    </form>
  </div>
</body>
</html>`)
})

mobileMoneyRouter.post(
  '/billing/mobile-money/demo/:transactionId/accept',
  async (req, res) => {
    if (!cinetpayDemoMode()) {
      res.status(404).send('Mode démo désactivé')
      return
    }
    const transactionId = req.params.transactionId
    const payment = await prisma.mobileMoneyPayment.findUnique({
      where: { transactionId },
    })
    if (!payment) {
      res.status(404).send('Transaction introuvable')
      return
    }
    await markPaymentAccepted(payment.id, {
      paymentMethod: 'demo',
      notifyPayload: { demo: true, action: 'accept' },
    })
    const returnUrl = subscriptionSuccessUrl(publicAppUrl(req), transactionId)
    res.redirect(returnUrl)
  },
)

mobileMoneyRouter.post(
  '/billing/mobile-money/demo/:transactionId/refuse',
  async (req, res) => {
    if (!cinetpayDemoMode()) {
      res.status(404).send('Mode démo désactivé')
      return
    }
    const transactionId = req.params.transactionId
    await prisma.mobileMoneyPayment.updateMany({
      where: { transactionId },
      data: { status: 'refused', notifyPayload: { demo: true, action: 'refuse' } },
    })
    res.redirect(subscriptionCancelUrl(publicAppUrl(req)))
  },
)
