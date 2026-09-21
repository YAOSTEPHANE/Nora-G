import type {
  LoyaltyCustomer,
  Product,
  Sale,
  Store,
  VipClient,
  VipTier,
} from '../db/types'
import { saleNetTTC } from './refundMath'

export type CustomerSegmentId =
  | 'all'
  | 'vip'
  | 'inactive'
  | 'product'
  | 'store'
  | 'spend'
  | 'frequency'

export type CustomerProfileRow = {
  customerId: string
  phone: string
  displayName: string
  points: number
  /** CA net cumulé (ventes liées). */
  totalSpentTTC: number
  /** Nombre de tickets / visites. */
  purchaseCount: number
  avgBasketTTC: number
  /** Achats par mois (sur la fenêtre depuis 1re vente ou 12 mois). */
  frequencyPerMonth: number
  lastPurchaseAt: number | null
  firstPurchaseAt: number | null
  daysSinceLastPurchase: number | null
  storeIds: string[]
  storeNames: string[]
  dominantStoreId: string | null
  dominantStoreName: string | null
  productIds: string[]
  productNames: string[]
  isVip: boolean
  vipTier: VipTier | null
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

function saleMatchesCustomer(sale: Sale, customer: LoyaltyCustomer): boolean {
  if (sale.loyaltyCustomerId && sale.loyaltyCustomerId === customer.id) {
    return true
  }
  if (sale.loyaltyCustomerPhone) {
    const a = normalizePhone(sale.loyaltyCustomerPhone)
    const b = normalizePhone(customer.phone)
    return a.length >= 8 && a === b
  }
  return false
}

export function buildCustomerProfiles(params: {
  customers: LoyaltyCustomer[]
  sales: Sale[]
  products: Product[]
  stores: Store[]
  vipClients: VipClient[]
  now?: number
}): CustomerProfileRow[] {
  const now = params.now ?? Date.now()
  const productName = new Map(params.products.map((p) => [p.id, p.name]))
  const storeName = new Map(params.stores.map((s) => [s.id, s.name]))

  const vipByPhone = new Map<string, VipClient>()
  for (const v of params.vipClients) {
    if (v.phone) vipByPhone.set(normalizePhone(v.phone), v)
  }

  return params.customers
    .filter((c) => !c.archived)
    .map((customer) => {
      const customerSales = params.sales
        .filter((s) => saleMatchesCustomer(s, customer))
        .sort((a, b) => a.createdAt - b.createdAt)

      let totalSpentTTC = 0
      let lastPurchaseAt: number | null = null
      let firstPurchaseAt: number | null = null
      const storeSpend = new Map<string, number>()
      const productIds = new Set<string>()

      for (const s of customerSales) {
        const net = saleNetTTC(s)
        totalSpentTTC += net
        lastPurchaseAt = Math.max(lastPurchaseAt ?? 0, s.createdAt)
        firstPurchaseAt =
          firstPurchaseAt == null
            ? s.createdAt
            : Math.min(firstPurchaseAt, s.createdAt)
        const sid = s.storeId ?? 'unknown'
        storeSpend.set(sid, (storeSpend.get(sid) ?? 0) + net)
        for (const line of s.lines) {
          productIds.add(line.productId)
        }
      }

      // Fallback catalogue loyalty fields if no linked sales yet
      if (customerSales.length === 0 && customer.totalSpentTTC > 0) {
        totalSpentTTC = customer.totalSpentTTC
      }
      const purchaseCount =
        customerSales.length > 0
          ? customerSales.length
          : customer.visitCount || 0

      const avgBasketTTC =
        purchaseCount > 0 ? Math.round(totalSpentTTC / purchaseCount) : 0

      let frequencyPerMonth = 0
      if (purchaseCount > 0 && firstPurchaseAt != null) {
        const spanMs = Math.max(now - firstPurchaseAt, 30 * 86_400_000)
        const months = spanMs / (30 * 86_400_000)
        frequencyPerMonth =
          Math.round((purchaseCount / Math.max(months, 1)) * 10) / 10
      }

      const daysSinceLastPurchase =
        lastPurchaseAt != null
          ? Math.floor((now - lastPurchaseAt) / 86_400_000)
          : null

      const storeIds = [...storeSpend.keys()].filter((id) => id !== 'unknown')
      let dominantStoreId: string | null = null
      let dominantSpend = -1
      for (const [sid, spend] of storeSpend) {
        if (spend > dominantSpend) {
          dominantSpend = spend
          dominantStoreId = sid === 'unknown' ? null : sid
        }
      }

      const vip =
        vipByPhone.get(normalizePhone(customer.phone)) ??
        params.vipClients.find(
          (v) =>
            v.name.trim().toLowerCase() ===
            (customer.displayName ?? '').trim().toLowerCase(),
        )

      const pIds = [...productIds]
      return {
        customerId: customer.id,
        phone: customer.phone,
        displayName: customer.displayName?.trim() || 'Cliente',
        points: customer.points,
        totalSpentTTC,
        purchaseCount,
        avgBasketTTC,
        frequencyPerMonth,
        lastPurchaseAt,
        firstPurchaseAt,
        daysSinceLastPurchase,
        storeIds,
        storeNames: storeIds.map((id) => storeName.get(id) ?? id),
        dominantStoreId,
        dominantStoreName: dominantStoreId
          ? (storeName.get(dominantStoreId) ?? dominantStoreId)
          : null,
        productIds: pIds,
        productNames: pIds
          .map((id) => productName.get(id) ?? id)
          .slice(0, 12),
        isVip: Boolean(vip),
        vipTier: vip?.tier ?? null,
      }
    })
    .sort((a, b) => b.totalSpentTTC - a.totalSpentTTC)
}

export type SegmentFilters = {
  segment: CustomerSegmentId
  inactiveDays: number
  productId: string | 'all'
  storeId: string | 'all'
  minSpendTTC: number
  minFrequency: number
  query: string
}

export function filterCustomerProfiles(
  profiles: CustomerProfileRow[],
  filters: SegmentFilters,
): CustomerProfileRow[] {
  const q = filters.query.trim().toLowerCase()
  return profiles.filter((p) => {
    if (q) {
      const hay = `${p.displayName} ${p.phone}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    switch (filters.segment) {
      case 'all':
        break
      case 'vip':
        if (!p.isVip) return false
        break
      case 'inactive':
        if (p.daysSinceLastPurchase == null) {
          // Never purchased → inactive
          break
        }
        if (p.daysSinceLastPurchase < filters.inactiveDays) return false
        break
      case 'product':
        if (filters.productId === 'all') return true
        if (!p.productIds.includes(filters.productId)) return false
        break
      case 'store':
        if (filters.storeId === 'all') return true
        if (!p.storeIds.includes(filters.storeId)) return false
        break
      case 'spend':
        if (p.totalSpentTTC < filters.minSpendTTC) return false
        break
      case 'frequency':
        if (p.frequencyPerMonth < filters.minFrequency) return false
        break
      default: {
        const _e: never = filters.segment
        return _e
      }
    }
    return true
  })
}

export function segmentKpis(profiles: CustomerProfileRow[]): {
  total: number
  vip: number
  inactive60: number
  avgSpend: number
  avgFrequency: number
} {
  const total = profiles.length
  const vip = profiles.filter((p) => p.isVip).length
  const inactive60 = profiles.filter(
    (p) => p.daysSinceLastPurchase == null || p.daysSinceLastPurchase >= 60,
  ).length
  const avgSpend =
    total > 0
      ? Math.round(
          profiles.reduce((s, p) => s + p.totalSpentTTC, 0) / total,
        )
      : 0
  const avgFrequency =
    total > 0
      ? Math.round(
          (profiles.reduce((s, p) => s + p.frequencyPerMonth, 0) / total) * 10,
        ) / 10
      : 0
  return { total, vip, inactive60, avgSpend, avgFrequency }
}

export const SEGMENT_LABELS: Record<CustomerSegmentId, string> = {
  all: 'Toutes',
  vip: 'VIP',
  inactive: 'Inactives',
  product: 'Par produit',
  store: 'Par boutique',
  spend: 'Montant dépensé',
  frequency: 'Fréquence',
}
