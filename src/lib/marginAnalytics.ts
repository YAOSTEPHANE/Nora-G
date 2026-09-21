import type {
  Product,
  PurchasePriceHistoryEntry,
  Sale,
  Store,
} from '../db/types'

export type TopProductMarginRow = {
  name: string
  qty: number
  revenueTTC: number
  costTTC: number | null
  marginTTC: number | null
  marginPct: number | null
}

export type MarginMetrics = {
  qty: number
  revenueTTC: number
  /** CA des lignes pour lesquelles un coût d’achat est connu. */
  revenueWithCostTTC: number
  costTTC: number
  /** Marge = CA connu − coût. */
  marginTTC: number
  /** Taux de marge = marge / CA × 100. */
  marginRatePct: number | null
  /** Taux de marque = marge / coût × 100. */
  markupRatePct: number | null
  /** Coefficient multiplicateur = CA / coût. */
  multiplier: number | null
  linesWithCost: number
  linesWithoutCost: number
}

export type ProfitabilityRow = MarginMetrics & {
  key: string
  label: string
  /** Catégorie produit (si agrégation produit). */
  category?: string
}

const disc = (pct: number) => Math.max(0, 1 - pct / 100)

function productMap(products: Product[]): Map<string, Product> {
  return new Map(products.map((p) => [p.id, p]))
}

function emptyMetrics(): MarginMetrics {
  return {
    qty: 0,
    revenueTTC: 0,
    revenueWithCostTTC: 0,
    costTTC: 0,
    marginTTC: 0,
    marginRatePct: null,
    markupRatePct: null,
    multiplier: null,
    linesWithCost: 0,
    linesWithoutCost: 0,
  }
}

function finalizeMetrics(m: MarginMetrics): MarginMetrics {
  const marginTTC = m.revenueWithCostTTC - m.costTTC
  const marginRatePct =
    m.revenueWithCostTTC > 0
      ? Math.round((marginTTC / m.revenueWithCostTTC) * 1000) / 10
      : null
  const markupRatePct =
    m.costTTC > 0
      ? Math.round((marginTTC / m.costTTC) * 1000) / 10
      : null
  const multiplier =
    m.costTTC > 0
      ? Math.round((m.revenueWithCostTTC / m.costTTC) * 100) / 100
      : null
  return {
    ...m,
    marginTTC,
    marginRatePct,
    markupRatePct,
    multiplier,
  }
}

/**
 * Coût d’achat unitaire à une date : dernier historique ≤ atMs,
 * sinon prix de revient catalogue.
 */
export function resolvePurchaseUnitCost(
  productId: string,
  atMs: number,
  products: Map<string, Product>,
  historyByProduct: Map<string, PurchasePriceHistoryEntry[]>,
): number | null {
  const hist = historyByProduct.get(productId)
  if (hist && hist.length > 0) {
    // hist trié desc par createdAt
    for (const h of hist) {
      if (h.createdAt <= atMs && Number.isFinite(h.unitCostTTC) && h.unitCostTTC >= 0) {
        return h.unitCostTTC
      }
    }
  }
  const p = products.get(productId)
  const cost = p?.purchasePriceTTC
  if (cost != null && Number.isFinite(cost) && cost >= 0) return cost
  return null
}

/** Index historique prix (par produit, du plus récent au plus ancien). */
export function indexPurchasePriceHistory(
  history: PurchasePriceHistoryEntry[],
): Map<string, PurchasePriceHistoryEntry[]> {
  const map = new Map<string, PurchasePriceHistoryEntry[]>()
  for (const h of history) {
    const list = map.get(h.productId) ?? []
    list.push(h)
    map.set(h.productId, list)
  }
  for (const list of map.values()) {
    list.sort((a, b) => b.createdAt - a.createdAt)
  }
  return map
}

type Acc = {
  qty: number
  revenueTTC: number
  revenueWithCostTTC: number
  costTTC: number
  linesWithCost: number
  linesWithoutCost: number
  label: string
  category?: string
}

function bump(
  map: Map<string, Acc>,
  key: string,
  label: string,
  patch: {
    qty: number
    rev: number
    cost: number | null
    category?: string
  },
): void {
  const cur = map.get(key) ?? {
    qty: 0,
    revenueTTC: 0,
    revenueWithCostTTC: 0,
    costTTC: 0,
    linesWithCost: 0,
    linesWithoutCost: 0,
    label,
    category: patch.category,
  }
  cur.qty += patch.qty
  cur.revenueTTC += patch.rev
  if (patch.cost != null) {
    cur.revenueWithCostTTC += patch.rev
    cur.costTTC += patch.cost
    cur.linesWithCost += 1
  } else {
    cur.linesWithoutCost += 1
  }
  if (patch.category) cur.category = patch.category
  map.set(key, cur)
}

function toRows(map: Map<string, Acc>): ProfitabilityRow[] {
  return [...map.entries()]
    .map(([key, v]) => {
      const base = finalizeMetrics({
        qty: v.qty,
        revenueTTC: v.revenueTTC,
        revenueWithCostTTC: v.revenueWithCostTTC,
        costTTC: v.costTTC,
        marginTTC: 0,
        marginRatePct: null,
        markupRatePct: null,
        multiplier: null,
        linesWithCost: v.linesWithCost,
        linesWithoutCost: v.linesWithoutCost,
      })
      return {
        key,
        label: v.label,
        category: v.category,
        ...base,
      }
    })
    .sort((a, b) => b.marginTTC - a.marginTTC)
}

export type ProfitabilityDimension =
  | 'product'
  | 'category'
  | 'store'
  | 'cashier'
  | 'day'

export function aggregateProfitability(params: {
  sales: Sale[]
  products: Product[]
  history: PurchasePriceHistoryEntry[]
  stores?: Store[]
  dimension: ProfitabilityDimension
}): ProfitabilityRow[] {
  const pmap = productMap(params.products)
  const histIndex = indexPurchasePriceHistory(params.history)
  const storeNames = new Map(
    (params.stores ?? []).map((s) => [s.id, s.name]),
  )
  const map = new Map<string, Acc>()

  for (const s of params.sales) {
    const f = disc(s.discountPct)
    const day = new Date(s.createdAt)
    const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`

    for (const line of s.lines) {
      const rq = s.refundedLineQty?.[line.productId] ?? 0
      const eq = Math.max(0, line.qty - rq)
      if (eq <= 0) continue
      const p = pmap.get(line.productId)
      const rev = Math.round(line.unitPriceTTC * eq * f)
      const unitCost = resolvePurchaseUnitCost(
        line.productId,
        s.createdAt,
        pmap,
        histIndex,
      )
      const cost =
        unitCost != null ? Math.round(unitCost * eq) : null

      let key: string
      let label: string
      let category: string | undefined

      switch (params.dimension) {
        case 'product':
          key = line.productId
          label = p?.name ?? line.name
          category = p?.category ?? 'Sans catégorie'
          break
        case 'category':
          key = p?.category ?? 'Sans catégorie'
          label = key
          break
        case 'store': {
          const sid = s.storeId ?? 'unknown'
          key = sid
          label =
            s.storeName ??
            storeNames.get(sid) ??
            (sid === 'unknown' ? 'Magasin inconnu' : sid)
          break
        }
        case 'cashier': {
          const cid = s.cashierProfileId ?? 'unknown'
          key = cid
          label =
            s.cashierDisplayName?.trim() ||
            (cid === 'unknown' ? 'Non attribué' : cid)
          break
        }
        case 'day':
          key = ymd
          label = ymd
          break
        default: {
          const _e: never = params.dimension
          return _e
        }
      }

      bump(map, key, label, {
        qty: eq,
        rev,
        cost,
        category,
      })
    }
  }

  return toRows(map)
}

export function profitabilityTotals(
  sales: Sale[],
  products: Product[],
  history: PurchasePriceHistoryEntry[] = [],
): MarginMetrics {
  const rows = aggregateProfitability({
    sales,
    products,
    history,
    dimension: 'product',
  })
  const m = emptyMetrics()
  for (const r of rows) {
    m.qty += r.qty
    m.revenueTTC += r.revenueTTC
    m.revenueWithCostTTC += r.revenueWithCostTTC
    m.costTTC += r.costTTC
    m.linesWithCost += r.linesWithCost
    m.linesWithoutCost += r.linesWithoutCost
  }
  return finalizeMetrics(m)
}

/** Top articles avec marge si prix de revient renseigné sur le produit. */
export function topProductsWithMargins(
  sales: Sale[],
  products: Product[],
  limit: number,
  history: PurchasePriceHistoryEntry[] = [],
): TopProductMarginRow[] {
  return aggregateProfitability({
    sales,
    products,
    history,
    dimension: 'product',
  })
    .slice(0, limit)
    .map((r) => ({
      name: r.label,
      qty: r.qty,
      revenueTTC: r.revenueTTC,
      costTTC: r.revenueWithCostTTC > 0 ? r.costTTC : null,
      marginTTC: r.revenueWithCostTTC > 0 ? r.marginTTC : null,
      marginPct: r.marginRatePct,
    }))
}

/** Totaux période : CA net global et marge sur la part avec prix de revient. */
export function periodMarginTotals(
  sales: Sale[],
  products: Product[],
  history: PurchasePriceHistoryEntry[] = [],
): {
  revenueTTC: number
  revenueWithCostTTC: number
  costTTC: number
  marginOnKnownTTC: number
  marginPctOnKnown: number | null
} {
  const t = profitabilityTotals(sales, products, history)
  return {
    revenueTTC: t.revenueTTC,
    revenueWithCostTTC: t.revenueWithCostTTC,
    costTTC: t.costTTC,
    marginOnKnownTTC: t.marginTTC,
    marginPctOnKnown: t.marginRatePct,
  }
}

export function filterSalesByPeriodDays(
  sales: Sale[],
  periodDays: number,
  now = Date.now(),
): Sale[] {
  const start = now - periodDays * 24 * 60 * 60 * 1000
  return sales.filter((s) => s.createdAt >= start && s.createdAt <= now)
}

export function filterSalesByStore(
  sales: Sale[],
  storeId: string | 'all',
): Sale[] {
  if (storeId === 'all') return sales
  return sales.filter((s) => s.storeId === storeId)
}
