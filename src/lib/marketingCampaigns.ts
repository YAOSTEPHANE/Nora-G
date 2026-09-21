import type {
  MarketingCampaign,
  MarketingCampaignAudience,
  Sale,
  WhatsAppCampaign,
  WhatsAppCampaignMessage,
} from '../db/types'
import type { CustomerProfileRow } from './customerSegmentation'
import { filterCustomerProfiles } from './customerSegmentation'

export const MARKETING_AUDIENCE_LABELS: Record<
  MarketingCampaignAudience,
  string
> = {
  all: 'Toutes les clientes',
  vip: 'VIP',
  inactive: 'Inactives',
  product: 'Acheteuses d’un produit',
  store: 'Par boutique',
  spend: 'Par dépense',
  frequency: 'Par fréquence',
  manual: 'Sélection manuelle',
}

export const MARKETING_STATUS_LABELS: Record<
  MarketingCampaign['status'],
  string
> = {
  draft: 'Brouillon',
  active: 'Active',
  ended: 'Terminée',
  cancelled: 'Annulée',
}

export function saleNetTTC(sale: Sale): number {
  return Math.max(0, sale.totalTTC - (sale.refundsTotalTTC ?? 0))
}

export function resolveMarketingAudience(
  campaign: Pick<
    MarketingCampaign,
    | 'audience'
    | 'inactiveDays'
    | 'productId'
    | 'minSpendTTC'
    | 'minFrequency'
    | 'manualCustomerIds'
    | 'storeId'
  >,
  profiles: CustomerProfileRow[],
): CustomerProfileRow[] {
  if (campaign.audience === 'manual') {
    const ids = new Set(campaign.manualCustomerIds ?? [])
    return profiles.filter((p) => ids.has(p.customerId))
  }
  return filterCustomerProfiles(profiles, {
    segment: campaign.audience === 'all' ? 'all' : campaign.audience,
    inactiveDays: campaign.inactiveDays ?? 60,
    productId: campaign.productId ?? 'all',
    storeId:
      campaign.audience === 'store' ? (campaign.storeId ?? 'all') : 'all',
    minSpendTTC: campaign.minSpendTTC ?? 0,
    minFrequency: campaign.minFrequency ?? 0,
    query: '',
  })
}

export function campaignAttributionWindow(
  campaign: Pick<
    MarketingCampaign,
    'startedAt' | 'endedAt' | 'attributionWindowDays' | 'createdAt'
  >,
): { from: number; to: number } | null {
  const start = campaign.startedAt ?? null
  if (start == null) return null
  const windowMs =
    Math.max(1, campaign.attributionWindowDays || 14) * 24 * 60 * 60 * 1000
  const toByWindow = start + windowMs
  const to =
    campaign.endedAt != null
      ? Math.min(campaign.endedAt, toByWindow)
      : toByWindow
  return { from: start, to }
}

export type CampaignAttribution = {
  promoCaTTC: number
  promoSalesCount: number
  promoCustomersCount: number
  audienceCaTTC: number
  audienceSalesCount: number
  audienceCustomersCount: number
  /** CA total attribué (promo prioritaire, puis audience hors promo). */
  attributedCaTTC: number
  attributedSalesCount: number
  attributedCustomersCount: number
  windowFrom: number | null
  windowTo: number | null
}

function emptyAttribution(): CampaignAttribution {
  return {
    promoCaTTC: 0,
    promoSalesCount: 0,
    promoCustomersCount: 0,
    audienceCaTTC: 0,
    audienceSalesCount: 0,
    audienceCustomersCount: 0,
    attributedCaTTC: 0,
    attributedSalesCount: 0,
    attributedCustomersCount: 0,
    windowFrom: null,
    windowTo: null,
  }
}

/**
 * Mesure le CA généré par une campagne :
 * - ventes avec le code promo dans la fenêtre d’attribution
 * - + ventes des clientes ciblées (hors déjà comptées via promo)
 */
export function measureCampaignCa(input: {
  campaign: Pick<
    MarketingCampaign,
    | 'promoCode'
    | 'startedAt'
    | 'endedAt'
    | 'attributionWindowDays'
    | 'createdAt'
    | 'audience'
    | 'inactiveDays'
    | 'productId'
    | 'minSpendTTC'
    | 'minFrequency'
    | 'manualCustomerIds'
    | 'storeId'
  >
  sales: Sale[]
  profiles: CustomerProfileRow[]
  /** IDs clientes touchées (ex. messages WhatsApp envoyés) — sinon audience segment. */
  touchedCustomerIds?: string[]
}): CampaignAttribution {
  const window = campaignAttributionWindow(input.campaign)
  if (window == null) return emptyAttribution()

  const inWindow = input.sales.filter(
    (s) => s.createdAt >= window.from && s.createdAt <= window.to,
  )

  const promoCode = input.campaign.promoCode?.trim().toUpperCase()
  const promoSales = promoCode
    ? inWindow.filter(
        (s) => (s.promoCode ?? '').trim().toUpperCase() === promoCode,
      )
    : []

  const promoCustomerIds = new Set<string>()
  let promoCa = 0
  for (const s of promoSales) {
    promoCa += saleNetTTC(s)
    if (s.loyaltyCustomerId) promoCustomerIds.add(s.loyaltyCustomerId)
  }

  const audienceIds = new Set(
    input.touchedCustomerIds ??
      resolveMarketingAudience(input.campaign, input.profiles).map(
        (p) => p.customerId,
      ),
  )

  const promoSaleIds = new Set(promoSales.map((s) => s.id))
  const audienceSales = inWindow.filter((s) => {
    if (promoSaleIds.has(s.id)) return false
    const cid = s.loyaltyCustomerId
    return cid != null && audienceIds.has(cid)
  })

  const audienceCustomerIds = new Set<string>()
  let audienceCa = 0
  for (const s of audienceSales) {
    audienceCa += saleNetTTC(s)
    if (s.loyaltyCustomerId) audienceCustomerIds.add(s.loyaltyCustomerId)
  }

  const attributedCustomers = new Set([
    ...promoCustomerIds,
    ...audienceCustomerIds,
  ])

  return {
    promoCaTTC: Math.round(promoCa),
    promoSalesCount: promoSales.length,
    promoCustomersCount: promoCustomerIds.size,
    audienceCaTTC: Math.round(audienceCa),
    audienceSalesCount: audienceSales.length,
    audienceCustomersCount: audienceCustomerIds.size,
    attributedCaTTC: Math.round(promoCa + audienceCa),
    attributedSalesCount: promoSales.length + audienceSales.length,
    attributedCustomersCount: attributedCustomers.size,
    windowFrom: window.from,
    windowTo: window.to,
  }
}

/** Attribution CA pour une campagne WhatsApp (même logique). */
export function measureWhatsAppCampaignCa(input: {
  campaign: WhatsAppCampaign
  messages: WhatsAppCampaignMessage[]
  sales: Sale[]
  profiles: CustomerProfileRow[]
}): CampaignAttribution {
  const startedAt =
    input.messages
      .filter((m) => m.sentAt != null)
      .map((m) => m.sentAt!)
      .sort((a, b) => a - b)[0] ?? input.campaign.createdAt

  const touched = input.messages
    .filter((m) => m.status === 'sent' || m.openedAt != null)
    .map((m) => m.customerId)

  return measureCampaignCa({
    campaign: {
      promoCode: input.campaign.promoCode,
      startedAt,
      endedAt: input.campaign.completedAt,
      attributionWindowDays: input.campaign.attributionWindowDays ?? 14,
      createdAt: input.campaign.createdAt,
      audience: input.campaign.audience,
      inactiveDays: input.campaign.inactiveDays,
      productId: input.campaign.productId,
      minSpendTTC: input.campaign.minSpendTTC,
      minFrequency: input.campaign.minFrequency,
      manualCustomerIds: input.campaign.manualCustomerIds,
      storeId: input.campaign.storeId,
    },
    sales: input.sales,
    profiles: input.profiles,
    touchedCustomerIds: touched.length > 0 ? touched : undefined,
  })
}

export function suggestPromoCode(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 10)
  const suffix = String(Date.now() % 10000).padStart(4, '0')
  return `${base || 'PROMO'}${suffix}`.slice(0, 24)
}
