import type { Product, ProductWithStock, Sale } from '../db/types'

export const DEFAULT_DORMANT_DAYS = 60

export type StockAlertLevel = 'rupture' | 'alerte' | 'ok'

export function stockAlertLevel(p: ProductWithStock): StockAlertLevel {
  if (p.stock <= 0) return 'rupture'
  if (p.stock <= p.lowStockThreshold) return 'alerte'
  return 'ok'
}

/** Dernière vente (toute méthode) par productId. */
export function lastSoldAtByProduct(sales: Sale[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const sale of sales) {
    for (const line of sale.lines) {
      const prev = map.get(line.productId)
      if (prev == null || sale.createdAt > prev) {
        map.set(line.productId, sale.createdAt)
      }
    }
  }
  return map
}

export type DormantStockRow = {
  product: ProductWithStock
  lastSoldAt: number | null
  daysSinceSale: number | null
  stockValueTTC: number
}

/**
 * Stock dormant : quantité > 0 et aucune vente depuis `dormantDays`
 * (ou jamais vendu).
 */
export function computeDormantStock(params: {
  products: ProductWithStock[]
  sales: Sale[]
  dormantDays?: number
  now?: number
}): DormantStockRow[] {
  const dormantDays = params.dormantDays ?? DEFAULT_DORMANT_DAYS
  const now = params.now ?? Date.now()
  const cutoff = now - dormantDays * 24 * 60 * 60 * 1000
  const lastSold = lastSoldAtByProduct(params.sales)

  const rows: DormantStockRow[] = []
  for (const product of params.products) {
    if (product.archived || product.stock <= 0) continue
    const lastSoldAt = lastSold.get(product.id) ?? null
    if (lastSoldAt != null && lastSoldAt >= cutoff) continue
    const daysSinceSale =
      lastSoldAt == null
        ? null
        : Math.floor((now - lastSoldAt) / (24 * 60 * 60 * 1000))
    rows.push({
      product,
      lastSoldAt,
      daysSinceSale,
      stockValueTTC: Math.round(product.stock * product.priceTTC),
    })
  }
  return rows.sort((a, b) => b.stockValueTTC - a.stockValueTTC)
}

export function stockAlertsSummary(products: ProductWithStock[]): {
  rupture: number
  alerte: number
  ok: number
  total: number
  ruptureValueTTC: number
  alerteValueTTC: number
} {
  let rupture = 0
  let alerte = 0
  let ok = 0
  let ruptureValueTTC = 0
  let alerteValueTTC = 0
  for (const p of products) {
    const level = stockAlertLevel(p)
    if (level === 'rupture') {
      rupture += 1
      ruptureValueTTC += p.priceTTC
    } else if (level === 'alerte') {
      alerte += 1
      alerteValueTTC += Math.round(p.stock * p.priceTTC)
    } else {
      ok += 1
    }
  }
  return {
    rupture,
    alerte,
    ok,
    total: products.length,
    ruptureValueTTC,
    alerteValueTTC,
  }
}

export function productDisplayName(p: Pick<Product, 'name' | 'brand'>): string {
  return p.brand ? `${p.name} · ${p.brand}` : p.name
}
