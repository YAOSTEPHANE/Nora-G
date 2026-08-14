import { randomBytes } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import type { Organization } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import {
  SUBSCRIPTION_PLANS,
  TRIAL_DAYS,
  type PlanId,
  type SubscriptionStatus,
} from '../lib/subscriptionPlans.js'
import { MOBILE_MONEY_CHANNELS_CI } from '../lib/mobileMoneyChannels.js'
import { mobileMoneyEnabled } from '../lib/cinetpay.js'
import {
  asOrgPaymentFields,
  orgPaymentProvidersPublicStatus,
  updateOrganizationPaymentProviders,
  type OrgPaymentProvidersUpdateInput,
} from '../lib/orgPaymentCredentials.js'
import { ensurePaymentConfigReady } from '../lib/paymentProviderSettings.js'
import { waveEnabled } from '../lib/wave.js'
import {
  hashOwnerPassword,
  isGmailAddress,
  normalizeOwnerEmail,
  validateOwnerPassword,
  verifyOwnerPassword,
} from '../lib/ownerAuth.js'
import { resolveOrgFromRequest, readBearerToken } from '../lib/orgAuth.js'
import { createOrgSession, revokeOrgSession } from '../lib/sessionTokens.js'
import {
  allocateUniqueStoreSlug,
  ensureStorefrontIdentity,
  storefrontPublicKey,
} from '../lib/storeSlug.js'

export const billingRouter = Router()

function generateLicenseKey(): string {
  const chunk = () => randomBytes(3).toString('hex').toUpperCase()
  return `CC-${chunk()}-${chunk()}-${chunk()}`
}

async function generateStoreCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const suffix = randomBytes(2).toString('hex').toUpperCase()
    const code = `MAG-${suffix}`
    const exists = await prisma.organization.findUnique({ where: { storeCode: code } })
    if (!exists) return code
  }
  throw new Error('Impossible de générer un code magasin unique.')
}

export function normalizeStoreCode(input: string): string {
  const raw = input.trim().toUpperCase().replace(/\s/g, '')
  if (!raw) return ''
  if (raw.startsWith('MAG-')) return raw
  if (raw.startsWith('MAG')) return `MAG-${raw.slice(3).replace(/^-/, '')}`
  return `MAG-${raw}`
}

type OrgWithStoreCode = Organization & { storeCode: string; storeSlug: string }

async function ensureStoreCode(org: Organization): Promise<OrgWithStoreCode> {
  const identity = await ensureStorefrontIdentity(org)
  const fresh = await prisma.organization.findUniqueOrThrow({
    where: { id: org.id },
  })
  return {
    ...fresh,
    storeCode: identity.storeCode,
    storeSlug: identity.storeSlug,
  }
}

function parsePlanId(value: string | undefined): PlanId {
  if (value === 'pro' || value === 'business') return value
  return 'starter'
}

function parseStatus(value: string | undefined): SubscriptionStatus {
  if (
    value === 'active' ||
    value === 'trialing' ||
    value === 'past_due' ||
    value === 'canceled' ||
    value === 'expired'
  ) {
    return value
  }
  return 'expired'
}

function orgPayload(org: {
  id: string
  name: string
  email: string
  licenseKey: string
  storeCode?: string | null
  storeSlug?: string | null
  planId: string
  status: string
  trialEndsAt: Date | null
  currentPeriodEnd: Date | null
  billingPhone?: string | null
  smsRemindersEnabled?: boolean
}, sessionToken?: string) {
  const planId = parsePlanId(org.planId)
  const status = parseStatus(org.status)
  const usable = true
  const storeSlug = org.storeSlug?.trim() || null
  const storeCode = org.storeCode ?? null
  return {
    organizationId: org.id,
    name: org.name,
    email: org.email,
    licenseKey: org.licenseKey,
    sessionToken: sessionToken ?? undefined,
    storeCode,
    storeSlug,
    /** Clé d’URL boutique (nom d’entreprise) — préférer à storeCode côté client. */
    storefrontKey: storefrontPublicKey({ storeSlug, storeCode }),
    planId,
    plan: SUBSCRIPTION_PLANS[planId],
    status,
    usable,
    trialEndsAt: org.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: org.currentPeriodEnd?.toISOString() ?? null,
    stripeEnabled: false,
    mobileMoneyEnabled: mobileMoneyEnabled(),
    waveEnabled: waveEnabled(),
    billingPhone: org.billingPhone ?? null,
    smsRemindersEnabled: org.smsRemindersEnabled ?? true,
  }
}

async function orgPayloadWithSession(org: Parameters<typeof orgPayload>[0]) {
  const sessionToken = await createOrgSession(org.id)
  return orgPayload(org, sessionToken)
}

function channelLabel(channelId: string): string {
  return MOBILE_MONEY_CHANNELS_CI.find((c) => c.id === channelId)?.label ?? channelId
}

async function findOrgByLicense(licenseKey: string) {
  const org = await prisma.organization.findUnique({ where: { licenseKey } })
  if (!org) return null
  return ensureStoreCode(org)
}

async function findOrgByStoreCode(storeCode: string) {
  const normalized = normalizeStoreCode(storeCode)
  if (!normalized) return null
  const org = await prisma.organization.findUnique({ where: { storeCode: normalized } })
  if (!org) return null
  return ensureStoreCode(org)
}

async function requireBillingOrg(req: Request, res: Response) {
  const org = await resolveOrgFromRequest(req)
  if (!org) {
    res.status(401).json({ error: 'Authentification requise.' })
    return null
  }
  return org
}

billingRouter.get('/billing/plans', (_req, res) => {
  res.json({
    plans: Object.values(SUBSCRIPTION_PLANS),
    trialDays: TRIAL_DAYS,
    stripeEnabled: false,
    mobileMoneyEnabled: mobileMoneyEnabled(),
    waveEnabled: waveEnabled(),
  })
})

billingRouter.post('/billing/register', async (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    const email = normalizeOwnerEmail(
      typeof req.body?.email === 'string' ? req.body.email : '',
    )
    const password = typeof req.body?.password === 'string' ? req.body.password : ''

    if (!name || name.length < 2) {
      res.status(400).json({ error: 'Nom d’entreprise requis.' })
      return
    }
    if (!isGmailAddress(email)) {
      res.status(400).json({
        error: 'Utilisez une adresse Gmail (@gmail.com) pour créer votre compte.',
      })
      return
    }
    const passwordError = validateOwnerPassword(password)
    if (passwordError) {
      res.status(400).json({ error: passwordError })
      return
    }

    const existing = await prisma.organization.findUnique({ where: { email } })
    if (existing) {
      res.status(409).json({
        error: 'Un compte existe déjà avec cette adresse Gmail. Connectez-vous.',
      })
      return
    }

    const storeCode = await generateStoreCode()
    const storeSlug = await allocateUniqueStoreSlug(name, { storeCode })

    const org = await prisma.organization.create({
      data: {
        name,
        email,
        passwordHash: hashOwnerPassword(password),
        licenseKey: generateLicenseKey(),
        storeCode,
        storeSlug,
        planId: 'business',
        status: 'active',
        trialEndsAt: null,
        currentPeriodEnd: null,
      },
    })

    const { ensureOwnerStaffMember } = await import('../lib/ensureOwnerStaff.js')
    await ensureOwnerStaffMember(org, { ownerPassword: password })

    res.status(201).json(await orgPayloadWithSession(org))
  } catch (err) {
    console.error('[billing/register]', err)
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      res.status(409).json({
        error: 'Un compte existe déjà avec cette adresse Gmail. Connectez-vous.',
      })
      return
    }
    res.status(500).json({ error: 'Impossible de créer le compte.' })
  }
})

billingRouter.post('/billing/login', async (req, res) => {
  try {
    const email = normalizeOwnerEmail(
      typeof req.body?.email === 'string' ? req.body.email : '',
    )
    const password = typeof req.body?.password === 'string' ? req.body.password : ''

    if (!isGmailAddress(email)) {
      res.status(400).json({ error: 'Adresse Gmail invalide.' })
      return
    }
    if (!password) {
      res.status(400).json({ error: 'Mot de passe requis.' })
      return
    }

    const org = await prisma.organization.findUnique({ where: { email } })
    if (!org || !org.passwordHash) {
      res.status(401).json({ error: 'E-mail ou mot de passe incorrect.' })
      return
    }
    if (!verifyOwnerPassword(password, org.passwordHash)) {
      res.status(401).json({ error: 'E-mail ou mot de passe incorrect.' })
      return
    }

    const withCode = await ensureStoreCode(org)
    res.json(await orgPayloadWithSession(withCode))
  } catch (err) {
    console.error('[billing/login]', err)
    res.status(500).json({ error: 'Connexion impossible.' })
  }
})

billingRouter.post('/billing/attach', async (req, res) => {
  try {
    const storeCode =
      typeof req.body?.storeCode === 'string' ? req.body.storeCode.trim() : ''
    const licenseKey =
      typeof req.body?.licenseKey === 'string' ? req.body.licenseKey.trim() : ''
    const password = typeof req.body?.password === 'string' ? req.body.password : ''

    if (!password) {
      res.status(400).json({ error: 'Mot de passe gérant requis.' })
      return
    }

    let org = null
    if (storeCode) {
      org = await findOrgByStoreCode(storeCode)
      if (!org) {
        res.status(401).json({ error: 'Code magasin ou mot de passe incorrect.' })
        return
      }
    } else if (licenseKey) {
      org = await findOrgByLicense(licenseKey)
      if (!org) {
        res.status(401).json({ error: 'Licence ou mot de passe incorrect.' })
        return
      }
    } else {
      res.status(400).json({ error: 'Code magasin ou clé de licence requis.' })
      return
    }

    if (!org.passwordHash || !verifyOwnerPassword(password, org.passwordHash)) {
      res.status(401).json({ error: 'Code magasin ou mot de passe incorrect.' })
      return
    }

    res.json(await orgPayloadWithSession(org))
  } catch (err) {
    console.error('[billing/attach]', err)
    res.status(500).json({ error: 'Impossible de valider la licence.' })
  }
})

billingRouter.post('/billing/logout', async (req, res) => {
  const token = readBearerToken(req)
  if (token) {
    await revokeOrgSession(token)
  }
  res.json({ ok: true })
})

billingRouter.get('/billing/status', async (req, res) => {
  try {
    await ensurePaymentConfigReady()
    const org = await resolveOrgFromRequest(req)
    if (!org) {
      res.status(401).json({ error: 'Authentification requise.' })
      return
    }

    const updated = await ensureStoreCode(org)
    res.json(orgPayload(updated))
  } catch (err) {
    console.error('[billing/status]', err)
    res.status(500).json({ error: 'Impossible de lire le statut.' })
  }
})

billingRouter.patch('/billing/settings', async (req, res) => {
  try {
    const org = await requireBillingOrg(req, res)
    if (!org) return

    const data: { billingPhone?: string | null; smsRemindersEnabled?: boolean } = {}

    if (req.body?.billingPhone !== undefined) {
      const raw =
        typeof req.body.billingPhone === 'string' ? req.body.billingPhone.trim() : ''
      data.billingPhone = raw || null
    }
    if (typeof req.body?.smsRemindersEnabled === 'boolean') {
      data.smsRemindersEnabled = req.body.smsRemindersEnabled
    }

    const updated = await prisma.organization.update({
      where: { id: org.id },
      data,
    })

    res.json(orgPayload(updated))
  } catch (err) {
    console.error('[billing/settings]', err)
    res.status(500).json({ error: 'Impossible de mettre à jour les paramètres.' })
  }
})

billingRouter.get('/billing/payments/history', async (req, res) => {
  try {
    const org = await requireBillingOrg(req, res)
    if (!org) return

    const payments = await prisma.mobileMoneyPayment.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    res.json({
      payments: payments.map((p) => ({
        id: p.id,
        transactionId: p.transactionId,
        planId: parsePlanId(p.planId),
        planName: SUBSCRIPTION_PLANS[parsePlanId(p.planId)].name,
        channel: p.channel,
        channelLabel: channelLabel(p.channel),
        amountFcfa: p.amountFcfa,
        customerPhone: p.customerPhone,
        status: p.status,
        paymentMethod: p.paymentMethod,
        paidAt: p.paidAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[billing/payments/history]', err)
    res.status(500).json({ error: 'Historique indisponible.' })
  }
})

billingRouter.post('/billing/checkout', (_req, res) => {
  res.status(410).json({ error: 'Les abonnements payants ont été retirés.' })
})

billingRouter.get('/billing/payment-providers', async (req, res) => {
  try {
    const org = await requireBillingOrg(req, res)
    if (!org) return
    res.json(orgPaymentProvidersPublicStatus(asOrgPaymentFields(org)))
  } catch (err) {
    console.error('[billing/payment-providers GET]', err)
    res.status(500).json({ error: 'Impossible de charger la config paiement.' })
  }
})

billingRouter.put('/billing/payment-providers', async (req, res) => {
  try {
    const org = await requireBillingOrg(req, res)
    if (!org) return

    const body = (req.body ?? {}) as Record<string, unknown>
    const input: OrgPaymentProvidersUpdateInput = {}
    const readSecret = (raw: unknown): string | null | undefined => {
      if (raw === undefined) return undefined
      if (raw === null) return null
      if (typeof raw === 'string') return raw
      return undefined
    }
    const waveApiKey = readSecret(body.waveApiKey)
    if (waveApiKey !== undefined) input.waveApiKey = waveApiKey
    const waveWebhookSecret = readSecret(body.waveWebhookSecret)
    if (waveWebhookSecret !== undefined) input.waveWebhookSecret = waveWebhookSecret
    const waveSigningSecret = readSecret(body.waveSigningSecret)
    if (waveSigningSecret !== undefined) input.waveSigningSecret = waveSigningSecret
    const cinetpayApiKey = readSecret(body.cinetpayApiKey)
    if (cinetpayApiKey !== undefined) input.cinetpayApiKey = cinetpayApiKey
    const cinetpaySiteId = readSecret(body.cinetpaySiteId)
    if (cinetpaySiteId !== undefined) input.cinetpaySiteId = cinetpaySiteId
    if (typeof body.waveDemoMode === 'boolean') input.waveDemoMode = body.waveDemoMode
    if (typeof body.cinetpayDemoMode === 'boolean') {
      input.cinetpayDemoMode = body.cinetpayDemoMode
    }

    const status = await updateOrganizationPaymentProviders(org.id, input)
    res.json(status)
  } catch (err) {
    console.error('[billing/payment-providers PUT]', err)
    const message =
      err instanceof Error ? err.message : 'Enregistrement impossible.'
    res.status(400).json({ error: message })
  }
})

billingRouter.post('/billing/portal', (_req, res) => {
  res.status(410).json({ error: 'Les abonnements payants ont été retirés.' })
})

export async function handleStripeWebhook(_req: Request, res: Response) {
  res.status(410).json({ error: 'Webhooks Stripe abonnement désactivés.' })
}
