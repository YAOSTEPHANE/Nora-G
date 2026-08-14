import { randomUUID } from 'node:crypto'
import { Router, type Request } from 'express'
import { z } from 'zod'
import { normalizeCiPhone } from '../lib/mobileMoneyChannels.js'
import {
  asOrgPaymentFields,
  merchantPaymentCreds,
  waveCredsEnabled,
} from '../lib/orgPaymentCredentials.js'
import { ensurePaymentConfigReady } from '../lib/paymentProviderSettings.js'
import { prisma } from '../lib/prisma.js'
import { requireActiveOrg } from '../lib/orgAuth.js'
import { publicAppUrl } from '../lib/appUrls.js'
import {
  markStorefrontOrderPaid,
  markStorefrontOrderPaymentRefused,
} from '../lib/storefrontWave.js'
import {
  checkWaveCheckoutByReference,
  initWaveCheckout,
} from '../lib/wave.js'
import {
  isSubscriptionUsable,
  type PlanId,
  type SubscriptionStatus,
} from '../lib/subscriptionPlans.js'
import { normalizeStoreCode } from './billing.js'
import {
  ensureStorefrontIdentity,
  normalizeStoreSlug,
  storefrontPublicKey,
} from '../lib/storeSlug.js'
import {
  computeDeliveryFeeTTC,
  findStorefrontDeliveryZone,
  MAX_STOREFRONT_DELIVERY_FEE_TTC,
  MAX_STOREFRONT_DELIVERY_ZONES,
  MAX_STOREFRONT_FREE_DELIVERY_THRESHOLD_TTC,
  normalizeNonNegativeInt,
  normalizeStorefrontDeliveryZones,
  resolveStorefrontDeliveryFeeTTC,
  resolveStorefrontDeliveryZones,
  resolveStorefrontFreeDeliveryThresholdTTC,
  type StorefrontDeliveryZone,
} from '../lib/storefrontDelivery.js'

export const storefrontRouter = Router()

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

const publishedProductSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  priceTTC: z.number().nonnegative(),
  category: z.string().min(1),
  vatRatePct: z.number().nonnegative(),
  imageDataUrl: z.string().optional(),
  imageUrl: z.string().url().optional(),
  stock: z.number().nonnegative(),
  barcode: z.string().optional(),
  lowStockThreshold: z.number().nonnegative().optional(),
  description: z.string().trim().max(1_000).optional(),
  highlights: z
    .array(z.string().trim().min(1).max(80))
    .max(5)
    .optional(),
})

const publishedPromotionSchema = z.object({
  id: z.string().min(1).max(120),
  code: z.string().trim().min(1).max(40),
  label: z.string().min(1).max(160),
  discountPct: z.number().positive().max(80),
  active: z.boolean(),
  startAt: z.number().int().nonnegative().optional(),
  endAt: z.number().int().nonnegative().optional(),
  minCartTTC: z.number().nonnegative().optional(),
  maxUsage: z.number().int().positive().optional(),
  usageCount: z.number().int().nonnegative(),
  storeId: z.string().max(120).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

const publishMenuSchema = z.object({
  storeId: z.string().min(1).max(120),
  storeName: z.string().min(1).max(160),
  products: z.array(publishedProductSchema).max(5_000),
  promotions: z.array(publishedPromotionSchema).max(200).default([]),
  categories: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
})

// data:image base64 (logo/bannière ≤ 500 Ko) ≈ 700k chars ; https reste court.
const optionalHttpsOrDataUrl = z
  .string()
  .max(1_500_000)
  .refine(
    (value) =>
      value === '' ||
      value.startsWith('data:image/') ||
      /^https?:\/\//i.test(value) ||
      value.startsWith('/uploads/'),
    { message: 'URL image invalide' },
  )
  .optional()

const storefrontBrandingSchema = z.object({
  shopName: z.string().trim().max(120).optional(),
  logoUrl: optionalHttpsOrDataUrl,
  primaryColor: z
    .string()
    .trim()
    .transform((value) => {
      const raw = value.trim()
      if (!raw) return ''
      const withHash = raw.startsWith('#') ? raw : `#${raw}`
      return withHash.toUpperCase()
    })
    .refine((value) => value === '' || /^#[0-9A-F]{6}$/.test(value), {
      message: 'Couleur hex invalide',
    })
    .optional(),
  bannerUrl: optionalHttpsOrDataUrl,
  welcomeMessage: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(40).optional(),
  whatsapp: z.string().trim().max(40).optional(),
  email: z.string().trim().max(160).optional(),
  address: z.string().trim().max(300).optional(),
  mapsUrl: z
    .string()
    .trim()
    .max(500)
    .refine(
      (value) => value === '' || /^https?:\/\//i.test(value),
      { message: 'URL Maps invalide' },
    )
    .optional(),
  openingHours: z.string().trim().max(1_000).optional(),
  footerTagline: z.string().trim().max(200).optional(),
  legalMentions: z.string().trim().max(1_000).optional(),
  deliveryFeeTTC: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_STOREFRONT_DELIVERY_FEE_TTC)
    .nullable()
    .optional(),
  freeDeliveryThresholdTTC: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_STOREFRONT_FREE_DELIVERY_THRESHOLD_TTC)
    .nullable()
    .optional(),
  deliveryZones: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80),
        name: z.string().trim().min(1).max(80),
        feeTTC: z
          .number()
          .int()
          .nonnegative()
          .max(MAX_STOREFRONT_DELIVERY_FEE_TTC),
      }),
    )
    .max(MAX_STOREFRONT_DELIVERY_ZONES)
    .nullable()
    .optional(),
})

const BRANDING_STRING_KEYS = [
  'shopName',
  'logoUrl',
  'primaryColor',
  'bannerUrl',
  'welcomeMessage',
  'phone',
  'whatsapp',
  'email',
  'address',
  'mapsUrl',
  'openingHours',
  'footerTagline',
  'legalMentions',
] as const

const BRANDING_NUMBER_KEYS = [
  'deliveryFeeTTC',
  'freeDeliveryThresholdTTC',
] as const

type StoredBranding = {
  [key: string]: string | number | StorefrontDeliveryZone[] | undefined
}

function readExistingBranding(menu: unknown): StoredBranding | undefined {
  if (!menu || typeof menu !== 'object') return undefined
  const branding = (menu as { branding?: unknown }).branding
  if (!branding || typeof branding !== 'object') return undefined
  const raw = branding as Record<string, unknown>
  const next: StoredBranding = {}
  for (const key of BRANDING_STRING_KEYS) {
    if (typeof raw[key] === 'string' && raw[key].trim()) {
      next[key] = raw[key].trim()
    }
  }
  for (const key of BRANDING_NUMBER_KEYS) {
    const max =
      key === 'deliveryFeeTTC'
        ? MAX_STOREFRONT_DELIVERY_FEE_TTC
        : MAX_STOREFRONT_FREE_DELIVERY_THRESHOLD_TTC
    const n = normalizeNonNegativeInt(raw[key], max)
    if (n != null) next[key] = n
  }
  const zones = normalizeStorefrontDeliveryZones(raw.deliveryZones)
  if (zones) next.deliveryZones = zones
  return Object.keys(next).length > 0 ? next : undefined
}

function mergeBrandingPatch(
  current: StoredBranding | undefined,
  patch: z.infer<typeof storefrontBrandingSchema>,
): StoredBranding | undefined {
  const next: StoredBranding = { ...(current ?? {}) }
  for (const key of BRANDING_STRING_KEYS) {
    if (!(key in patch)) continue
    const value = patch[key]
    if (value == null || value.trim() === '') {
      delete next[key]
    } else {
      next[key] = value.trim()
    }
  }
  for (const key of BRANDING_NUMBER_KEYS) {
    if (!(key in patch)) continue
    const value = patch[key]
    if (value == null) {
      delete next[key]
    } else {
      next[key] = value
    }
  }
  if ('deliveryZones' in patch) {
    const zones = normalizeStorefrontDeliveryZones(patch.deliveryZones)
    if (zones) next.deliveryZones = zones
    else delete next.deliveryZones
  }
  return Object.keys(next).length > 0 ? next : undefined
}

const orderLineSchema = z.object({
  productId: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  unitPriceTTC: z.number().nonnegative(),
  qty: z.number().int().positive().max(1_000),
  vatRatePct: z.number().nonnegative().max(100),
})

const submitOrderSchema = z.object({
  customerName: z.string().trim().min(1).max(160),
  customerPhone: z.string().max(40).optional(),
  customerAddress: z.string().max(500).optional(),
  customerNote: z.string().max(1_000).optional(),
  desiredTimeSlot: z.string().max(120).optional(),
  paymentMethod: z.enum(['cash', 'card', 'mobile', 'mixed', 'wave']),
  fulfillmentMode: z.enum(['pickup', 'delivery']),
  lines: z.array(orderLineSchema).min(1).max(200),
  subtotalHT: z.number().nonnegative(),
  tva: z.number().nonnegative(),
  totalTTC: z.number().nonnegative(),
  netProductsTTC: z.number().nonnegative(),
  discountPct: z.number().nonnegative().max(80).optional(),
  promoCode: z.string().trim().max(40).optional(),
  deliveryFeeTTC: z.number().nonnegative().max(1_000_000).optional(),
  deliveryZoneId: z.string().trim().max(80).optional(),
})

function storefrontPath(key: string): string {
  return `/boutique/${encodeURIComponent(key)}`
}

function publicStorefrontUrl(
  req: Request,
  org: { storeSlug?: string | null; storeCode: string },
): string {
  const key = storefrontPublicKey(org) ?? org.storeCode
  return `${publicAppUrl(req)}${storefrontPath(key)}`
}

async function findOrgByStoreCodeParam(raw: string) {
  const trimmed = decodeURIComponent(String(raw ?? '')).trim()
  if (!trimmed) return null

  const slug = normalizeStoreSlug(trimmed)
  if (slug) {
    const bySlug = await prisma.organization.findFirst({
      where: { storeSlug: slug },
    })
    if (bySlug) {
      await ensureStorefrontIdentity(bySlug)
      return prisma.organization.findUniqueOrThrow({ where: { id: bySlug.id } })
    }
  }

  const normalized = normalizeStoreCode(trimmed)
  if (!normalized) return null
  const byCode = await prisma.organization.findUnique({
    where: { storeCode: normalized },
  })
  if (!byCode) return null
  await ensureStorefrontIdentity(byCode)
  return prisma.organization.findUniqueOrThrow({ where: { id: byCode.id } })
}

storefrontRouter.get('/billing/storefront/branding', async (req, res) => {
  try {
    const org = await requireActiveOrg(req, res)
    if (!org || !org.storeCode) return
    const menu =
      org.storefrontMenu && typeof org.storefrontMenu === 'object'
        ? (org.storefrontMenu as { storeName?: string })
        : null
    res.json({
      branding: readExistingBranding(org.storefrontMenu) ?? {},
      storeName: typeof menu?.storeName === 'string' ? menu.storeName : org.name,
      menuPublished: Boolean(org.storefrontMenu),
      publishedAt: org.storefrontPublishedAt?.toISOString() ?? null,
      storefrontUrl: publicStorefrontUrl(req, org),
      storeCode: org.storeCode,
      storeSlug: org.storeSlug ?? null,
    })
  } catch (err) {
    console.error('[storefront/branding-get]', err)
    res.status(500).json({ error: 'Impossible de charger l’apparence boutique.' })
  }
})

storefrontRouter.patch('/billing/storefront/branding', async (req, res) => {
  try {
    const org = await requireActiveOrg(req, res)
    if (!org || !org.storeCode) return
    const patch = storefrontBrandingSchema.parse(req.body ?? {})
    const existingMenu =
      org.storefrontMenu && typeof org.storefrontMenu === 'object'
        ? (org.storefrontMenu as Record<string, unknown>)
        : null
    const branding = mergeBrandingPatch(
      readExistingBranding(org.storefrontMenu),
      patch,
    )
    const publishedAt = new Date()
    const nextMenu = {
      storeId:
        typeof existingMenu?.storeId === 'string' && existingMenu.storeId
          ? existingMenu.storeId
          : 'store-main',
      storeName:
        typeof existingMenu?.storeName === 'string' && existingMenu.storeName
          ? existingMenu.storeName
          : org.name,
      products: Array.isArray(existingMenu?.products) ? existingMenu.products : [],
      promotions: Array.isArray(existingMenu?.promotions)
        ? existingMenu.promotions
        : [],
      publishedAt: publishedAt.toISOString(),
      ...(branding ? { branding } : {}),
    }
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        storefrontMenu: nextMenu,
        ...(existingMenu ? { storefrontPublishedAt: publishedAt } : {}),
      },
    })
    res.json({
      ok: true,
      branding: branding ?? {},
      publishedAt: existingMenu ? publishedAt.toISOString() : null,
      storefrontUrl: publicStorefrontUrl(req, {
        storeSlug: org.storeSlug,
        storeCode: org.storeCode ?? '',
      }),
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      const detail = err.issues[0]?.message
      res.status(400).json({
        error: detail
          ? `Apparence boutique invalide (${detail}).`
          : 'Apparence boutique invalide.',
      })
      return
    }
    console.error('[storefront/branding-patch]', err)
    res.status(500).json({ error: 'Enregistrement impossible.' })
  }
})

storefrontRouter.get('/billing/storefront/:storeCode', async (req, res) => {
  try {
    const org = await findOrgByStoreCodeParam(req.params.storeCode)
    if (!org || !org.storeCode) {
      res.status(404).json({ error: 'Boutique introuvable.' })
      return
    }
    const status = parseStatus(org.status)
    const usable = isSubscriptionUsable(
      status,
      org.currentPeriodEnd,
      org.trialEndsAt,
    )
    await ensurePaymentConfigReady()
    const merchantCreds = merchantPaymentCreds(asOrgPaymentFields(org))
    const branding = readExistingBranding(org.storefrontMenu)
    res.json({
      organizationId: org.id,
      name: org.name,
      storeCode: org.storeCode,
      storeSlug: org.storeSlug ?? null,
      usable,
      planId: parsePlanId(org.planId),
      storefrontUrl: publicStorefrontUrl(req, {
        storeSlug: org.storeSlug,
        storeCode: org.storeCode ?? '',
      }),
      menuPublished: Boolean(org.storefrontMenu),
      publishedAt: org.storefrontPublishedAt?.toISOString() ?? null,
      waveEnabled: waveCredsEnabled(merchantCreds),
      ...(branding ? { branding } : {}),
    })
  } catch (err) {
    console.error('[storefront/info]', err)
    res.status(500).json({ error: 'Impossible de charger la boutique.' })
  }
})

storefrontRouter.get('/billing/storefront/:storeCode/menu', async (req, res) => {
  try {
    const org = await findOrgByStoreCodeParam(req.params.storeCode)
    if (!org || !org.storeCode) {
      res.status(404).json({ error: 'Boutique introuvable.' })
      return
    }
    if (!org.storefrontMenu) {
      res.status(404).json({ error: 'Menu non publié. Le commerçant doit publier son catalogue.' })
      return
    }
    res.json({
      organizationId: org.id,
      name: org.name,
      storeCode: org.storeCode,
      publishedAt: org.storefrontPublishedAt?.toISOString() ?? null,
      menu: org.storefrontMenu,
    })
  } catch (err) {
    console.error('[storefront/menu]', err)
    res.status(500).json({ error: 'Impossible de charger le menu.' })
  }
})

storefrontRouter.post('/billing/storefront/:storeCode/orders', async (req, res) => {
  try {
    const org = await findOrgByStoreCodeParam(req.params.storeCode)
    if (!org || !org.storeCode) {
      res.status(404).json({ error: 'Boutique introuvable.' })
      return
    }
    const status = parseStatus(org.status)
    if (
      !isSubscriptionUsable(
        status,
        org.currentPeriodEnd,
        org.trialEndsAt,
      )
    ) {
      res.status(403).json({ error: 'Cette boutique n’accepte pas de commandes pour le moment.' })
      return
    }
    const body = submitOrderSchema.parse(req.body)
    const menuResult = publishMenuSchema.safeParse(org.storefrontMenu)
    if (!menuResult.success) {
      res.status(409).json({ error: 'Catalogue publié invalide. Republiez la boutique.' })
      return
    }

    const productsById = new Map(
      menuResult.data.products.map((product) => [product.id, product]),
    )
    const canonicalLines = body.lines.map((line) => {
      const product = productsById.get(line.productId)
      if (!product || product.stock < line.qty) {
        throw new Error(`Article indisponible : ${line.productId}`)
      }
      return {
        productId: product.id,
        name: product.name,
        unitPriceTTC: product.priceTTC,
        qty: line.qty,
        vatRatePct: product.vatRatePct,
      }
    })

    const grossProductsTTC = canonicalLines.reduce(
      (sum, line) => sum + line.unitPriceTTC * line.qty,
      0,
    )
    const promoCode = body.promoCode?.trim().toUpperCase()
    const now = Date.now()
    const promotion = promoCode
      ? menuResult.data.promotions.find(
          (candidate) =>
            candidate.code.toUpperCase() === promoCode &&
            candidate.active &&
            (candidate.startAt == null || candidate.startAt <= now) &&
            (candidate.endAt == null || candidate.endAt >= now) &&
            (candidate.minCartTTC == null ||
              grossProductsTTC >= candidate.minCartTTC) &&
            (candidate.maxUsage == null ||
              candidate.usageCount < candidate.maxUsage),
        )
      : undefined
    if (promoCode && !promotion) {
      res.status(400).json({ error: 'Code promotionnel invalide ou expiré.' })
      return
    }

    const discountPct = promotion?.discountPct ?? 0
    const discountFactor = 1 - discountPct / 100
    const netProductsTTC = grossProductsTTC * discountFactor
    const subtotalHT = canonicalLines.reduce((sum, line) => {
      const lineTTC = line.unitPriceTTC * line.qty * discountFactor
      return sum + lineTTC / (1 + line.vatRatePct / 100)
    }, 0)
    const tva = netProductsTTC - subtotalHT
    const branding = readExistingBranding(org.storefrontMenu)
    const deliveryZones = resolveStorefrontDeliveryZones(branding)
    let deliveryZoneId: string | undefined
    let deliveryZoneName: string | undefined
    if (body.fulfillmentMode === 'delivery' && deliveryZones.length > 0) {
      const zone = findStorefrontDeliveryZone(branding, body.deliveryZoneId)
      if (!zone) {
        res.status(400).json({
          error: 'Choisissez une zone de livraison valide.',
        })
        return
      }
      deliveryZoneId = zone.id
      deliveryZoneName = zone.name
    }
    const deliveryFeeTTC = computeDeliveryFeeTTC({
      fulfillmentMode: body.fulfillmentMode,
      cartTTC: netProductsTTC,
      feeTTC: resolveStorefrontDeliveryFeeTTC(branding, deliveryZoneId),
      freeThresholdTTC: resolveStorefrontFreeDeliveryThresholdTTC(branding),
    })
    const verifiedOrder = {
      ...body,
      lines: canonicalLines,
      subtotalHT,
      tva,
      totalTTC: netProductsTTC + deliveryFeeTTC,
      netProductsTTC,
      discountPct: discountPct || undefined,
      promoCode: promotion ? promoCode : undefined,
      deliveryFeeTTC: deliveryFeeTTC || undefined,
      deliveryZoneId,
      deliveryZoneName,
    }
    const externalId = randomUUID()
    const createdAt = Date.now()
    const amountFcfa = Math.round(verifiedOrder.totalTTC)
    if (amountFcfa <= 0) {
      res.status(400).json({ error: 'Montant de commande invalide.' })
      return
    }

    const isWavePayment = verifiedOrder.paymentMethod === 'wave'
    const merchantCreds = merchantPaymentCreds(asOrgPaymentFields(org))
    if (isWavePayment) {
      await ensurePaymentConfigReady()
    }
    if (isWavePayment && !waveCredsEnabled(merchantCreds)) {
      res.status(503).json({
        error:
          'Paiement Wave indisponible : le commerçant doit configurer ses clés Wave (Intégrations).',
      })
      return
    }

    const phoneE164 = verifiedOrder.customerPhone
      ? normalizeCiPhone(verifiedOrder.customerPhone)
      : null
    if (isWavePayment && !phoneE164) {
      res.status(400).json({
        error: 'Numéro Wave requis (ex. 07 XX XX XX XX).',
      })
      return
    }

    const initialStatus = isWavePayment ? 'awaiting_payment' : 'pending'
    const payload = {
      ...verifiedOrder,
      id: externalId,
      createdAt,
      storeId: typeof (org.storefrontMenu as { storeId?: string } | null)?.storeId === 'string'
        ? (org.storefrontMenu as { storeId: string }).storeId
        : 'store-main',
      storeName: typeof (org.storefrontMenu as { storeName?: string } | null)?.storeName === 'string'
        ? (org.storefrontMenu as { storeName: string }).storeName
        : org.name,
      storeCode: org.storeCode,
      storeSlug: org.storeSlug ?? null,
      source: 'public_storefront',
      status: initialStatus,
      paymentStatus: isWavePayment ? 'awaiting' : 'not_required',
      paymentProvider: isWavePayment ? 'wave' : null,
    }

    await prisma.storefrontOrder.create({
      data: {
        organizationId: org.id,
        storeCode: org.storeCode!,
        externalId,
        status: initialStatus,
        payload,
      },
    })

    if (!isWavePayment) {
      res.status(201).json({
        orderId: externalId,
        reference: externalId.slice(0, 8).toUpperCase(),
        requiresPayment: false,
      })
      return
    }

    const baseUrl = publicAppUrl(req)
    const boutiqueKey =
      storefrontPublicKey({
        storeSlug: org.storeSlug,
        storeCode: org.storeCode,
      }) ?? org.storeCode ?? ''
    const boutiquePath = storefrontPath(boutiqueKey)
    const successUrl = `${baseUrl}${boutiquePath}?order=${encodeURIComponent(externalId)}&payment=success`
    const errorUrl = `${baseUrl}${boutiquePath}?order=${encodeURIComponent(externalId)}&payment=cancel`

    const waveInit = await initWaveCheckout(
      {
        transactionId: externalId,
        amountFcfa,
        successUrl,
        errorUrl,
        payerPhoneE164: phoneE164 ?? undefined,
      },
      merchantCreds,
    )

    await prisma.storefrontOrder.update({
      where: { externalId },
      data: {
        payload: {
          ...payload,
          waveSessionId: waveInit.sessionId,
          waveLaunchUrl: waveInit.launchUrl,
          customerPhone: phoneE164,
        },
      },
    })

    res.status(201).json({
      orderId: externalId,
      reference: externalId.slice(0, 8).toUpperCase(),
      requiresPayment: true,
      paymentUrl: waveInit.paymentUrl,
      demo: waveInit.demo,
      provider: 'wave',
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Commande invalide.' })
      return
    }
    if (err instanceof Error && err.message.startsWith('Article indisponible')) {
      res.status(409).json({ error: err.message })
      return
    }
    console.error('[storefront/orders]', err)
    res.status(500).json({ error: 'Impossible d’enregistrer la commande.' })
  }
})

storefrontRouter.get(
  '/billing/storefront/:storeCode/orders/:externalId/payment-status',
  async (req, res) => {
    try {
      const org = await findOrgByStoreCodeParam(req.params.storeCode)
      if (!org || !org.storeCode) {
        res.status(404).json({ error: 'Boutique introuvable.' })
        return
      }

      const externalId = req.params.externalId?.trim()
      if (!externalId) {
        res.status(400).json({ error: 'Commande introuvable.' })
        return
      }

      const row = await prisma.storefrontOrder.findFirst({
        where: { externalId, organizationId: org.id },
      })
      if (!row) {
        res.status(404).json({ error: 'Commande introuvable.' })
        return
      }

      if (row.status === 'pending') {
        res.json({ status: 'paid', orderId: externalId })
        return
      }

      if (row.status !== 'awaiting_payment') {
        res.json({
          status: row.status === 'payment_failed' ? 'failed' : 'unknown',
          orderId: externalId,
        })
        return
      }

      const check = await checkWaveCheckoutByReference(
        externalId,
        merchantPaymentCreds(asOrgPaymentFields(org)),
      )
      if (check.status === 'ACCEPTED') {
        await markStorefrontOrderPaid(externalId, {
          waveSessionId: check.sessionId,
          waveTransactionId: check.transactionId,
          notifyPayload: check.raw,
        })
        res.json({ status: 'paid', orderId: externalId })
        return
      }

      if (check.status === 'REFUSED') {
        await markStorefrontOrderPaymentRefused(externalId, check.raw)
        res.json({ status: 'failed', orderId: externalId })
        return
      }

      res.json({ status: 'pending', orderId: externalId })
    } catch (err) {
      console.error('[storefront/payment-status]', err)
      res.status(500).json({ error: 'Vérification du paiement impossible.' })
    }
  },
)

storefrontRouter.post('/billing/storefront/publish', async (req, res) => {
  try {
    const org = await requireActiveOrg(req, res)
    if (!org || !org.storeCode) return
    const menu = publishMenuSchema.parse(req.body)
    const publishedAt = new Date()
    const branding = readExistingBranding(org.storefrontMenu)
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        storefrontMenu: {
          ...menu,
          publishedAt: publishedAt.toISOString(),
          ...(branding ? { branding } : {}),
        },
        storefrontPublishedAt: publishedAt,
      },
    })
    res.json({
      ok: true,
      publishedAt: publishedAt.toISOString(),
      storefrontUrl: publicStorefrontUrl(req, {
        storeSlug: org.storeSlug,
        storeCode: org.storeCode ?? '',
      }),
      productCount: menu.products.length,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Catalogue invalide.' })
      return
    }
    console.error('[storefront/publish]', err)
    res.status(500).json({ error: 'Publication impossible.' })
  }
})

storefrontRouter.get('/billing/storefront/orders/inbox', async (req, res) => {
  try {
    const org = await requireActiveOrg(req, res)
    if (!org) return
    const status =
      typeof req.query.status === 'string' && req.query.status.trim()
        ? req.query.status.trim()
        : 'pending'
    const rows = await prisma.storefrontOrder.findMany({
      where: { organizationId: org.id, status },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    res.json({
      orders: rows.map((row) => ({
        id: row.externalId,
        serverId: row.id,
        createdAt: row.createdAt.getTime(),
        status: row.status,
        ...(typeof row.payload === 'object' && row.payload !== null ? row.payload : {}),
      })),
    })
  } catch (err) {
    console.error('[storefront/inbox]', err)
    res.status(500).json({ error: 'Impossible de charger les commandes web.' })
  }
})

storefrontRouter.patch('/billing/storefront/orders/:externalId', async (req, res) => {
  try {
    const org = await requireActiveOrg(req, res)
    if (!org) return
    const nextStatus =
      typeof req.body?.status === 'string' ? req.body.status.trim() : ''
    if (!nextStatus) {
      res.status(400).json({ error: 'Statut requis.' })
      return
    }
    const row = await prisma.storefrontOrder.findFirst({
      where: { externalId: req.params.externalId, organizationId: org.id },
    })
    if (!row) {
      res.status(404).json({ error: 'Commande introuvable.' })
      return
    }
    const payload =
      typeof row.payload === 'object' && row.payload !== null
        ? { ...(row.payload as Record<string, unknown>), status: nextStatus }
        : { status: nextStatus }
    await prisma.storefrontOrder.update({
      where: { id: row.id },
      data: { status: nextStatus, payload },
    })
    res.json({ ok: true, status: nextStatus })
  } catch (err) {
    console.error('[storefront/order-patch]', err)
    res.status(500).json({ error: 'Mise à jour impossible.' })
  }
})
