import type {
  Product,
  PurchasePriceHistoryEntry,
  Sale,
  Store,
  StoreStock,
} from '../db/types'
import { isWarehouseStore } from '../db/seedStores'
import {
  aggregateProfitability,
  profitabilityTotals,
  type MarginMetrics,
} from './marginAnalytics'
import { productIsActive } from './productFilters'
import { avgTicket, sumTotalTTC } from './salesStats'
import {
  aggregateSalespersonPerformance,
  type SalespersonPerfRow,
} from './salespersonStats'
import { stockAlertsSummary } from './stockAnalytics'
import type { ProductWithStock } from '../db/types'

export type PilotagePeriod = 7 | 14 | 30 | 90

export type PilotageOverview = {
  caTTC: number
  salesCount: number
  avgBasketTTC: number
  margin: MarginMetrics
  stockUnits: number
  stockValueTTC: number
  ruptureCount: number
  lowStockCount: number
  /** Rotation moyenne (qty vendue / stock) sur produits avec stock > 0. */
  avgTurnoverRate: number | null
  /** Couverture stock moyenne en jours (produits vendus). */
  avgDaysOfCover: number | null
}

export type StorePilotageRow = {
  storeId: string
  storeName: string
  caTTC: number
  salesCount: number
  avgBasketTTC: number
  marginTTC: number
  marginRatePct: number | null
  stockUnits: number
  stockValueTTC: number
  ruptureCount: number
  lowStockCount: number
}

export type ProductPilotageRow = {
  productId: string
  name: string
  category: string
  qtySold: number
  revenueTTC: number
  marginTTC: number | null
  marginRatePct: number | null
  stock: number
  stockValueTTC: number
  /** qtySold / stock (période). */
  turnoverRate: number | null
  /** stock / (qtySold / periodDays). */
  daysOfCover: number | null
}

function stockQtyForProduct(
  productId: string,
  storeId: string | 'all',
  stocks: StoreStock[],
  fallbackStock: number,
): number {
  if (storeId === 'all') {
    const rows = stocks.filter((s) => s.productId === productId)
    if (rows.length === 0) return fallbackStock
    return rows.reduce((sum, s) => sum + s.stock, 0)
  }
  const row = stocks.find(
    (s) => s.productId === productId && s.storeId === storeId,
  )
  return row?.stock ?? 0
}

export function productsWithResolvedStock(params: {
  products: Product[]
  stocks: StoreStock[]
  storeId: string | 'all'
}): ProductWithStock[] {
  return params.products.filter(productIsActive).map((p) => ({
    ...p,
    stock: stockQtyForProduct(p.id, params.storeId, params.stocks, 0),
  }))
}

export function buildPilotageOverview(params: {
  sales: Sale[]
  products: Product[]
  history: PurchasePriceHistoryEntry[]
  stocks: StoreStock[]
  storeId: string | 'all'
  periodDays: number
}): PilotageOverview {
  const caTTC = sumTotalTTC(params.sales)
  const salesCount = params.sales.length
  const avgBasketTTC = avgTicket(params.sales)
  const margin = profitabilityTotals(
    params.sales,
    params.products,
    params.history,
  )
  const withStock = productsWithResolvedStock({
    products: params.products,
    stocks: params.stocks,
    storeId: params.storeId,
  })
  const alerts = stockAlertsSummary(withStock)
  let stockUnits = 0
  let stockValueTTC = 0
  for (const p of withStock) {
    stockUnits += p.stock
    stockValueTTC += p.stock * p.priceTTC
  }

  const rotations = buildProductPilotage({
    sales: params.sales,
    products: params.products,
    history: params.history,
    stocks: params.stocks,
    storeId: params.storeId,
    periodDays: params.periodDays,
  }).filter((r) => r.stock > 0 && r.qtySold > 0)

  const avgTurnoverRate =
    rotations.length > 0
      ? Math.round(
          (rotations.reduce((s, r) => s + (r.turnoverRate ?? 0), 0) /
            rotations.length) *
            100,
        ) / 100
      : null
  const coverRows = rotations.filter((r) => r.daysOfCover != null)
  const avgDaysOfCover =
    coverRows.length > 0
      ? Math.round(
          coverRows.reduce((s, r) => s + (r.daysOfCover ?? 0), 0) /
            coverRows.length,
        )
      : null

  return {
    caTTC: Math.round(caTTC),
    salesCount,
    avgBasketTTC: Math.round(avgBasketTTC),
    margin,
    stockUnits,
    stockValueTTC: Math.round(stockValueTTC),
    ruptureCount: alerts.rupture,
    lowStockCount: alerts.alerte,
    avgTurnoverRate,
    avgDaysOfCover,
  }
}

export function buildStorePilotage(params: {
  sales: Sale[]
  products: Product[]
  history: PurchasePriceHistoryEntry[]
  stores: Store[]
  stocks: StoreStock[]
}): StorePilotageRow[] {
  const boutiques = params.stores.filter(
    (s) => !s.archived && !isWarehouseStore(s),
  )
  const marginByStore = aggregateProfitability({
    sales: params.sales,
    products: params.products,
    history: params.history,
    stores: boutiques,
    dimension: 'store',
  })
  const marginMap = new Map(marginByStore.map((r) => [r.key, r]))

  const salesByStore = new Map<string, Sale[]>()
  for (const sale of params.sales) {
    const sid = sale.storeId ?? 'unknown'
    const list = salesByStore.get(sid) ?? []
    list.push(sale)
    salesByStore.set(sid, list)
  }

  return boutiques
    .map((store) => {
      const storeSales = salesByStore.get(store.id) ?? []
      const m = marginMap.get(store.id)
      const withStock = productsWithResolvedStock({
        products: params.products,
        stocks: params.stocks,
        storeId: store.id,
      })
      const alerts = stockAlertsSummary(withStock)
      let stockUnits = 0
      let stockValueTTC = 0
      for (const p of withStock) {
        stockUnits += p.stock
        stockValueTTC += p.stock * p.priceTTC
      }
      return {
        storeId: store.id,
        storeName: store.name,
        caTTC: Math.round(sumTotalTTC(storeSales)),
        salesCount: storeSales.length,
        avgBasketTTC: Math.round(avgTicket(storeSales)),
        marginTTC: m?.marginTTC ?? 0,
        marginRatePct: m?.marginRatePct ?? null,
        stockUnits,
        stockValueTTC: Math.round(stockValueTTC),
        ruptureCount: alerts.rupture,
        lowStockCount: alerts.alerte,
      }
    })
    .sort((a, b) => b.caTTC - a.caTTC)
}

export function buildProductPilotage(params: {
  sales: Sale[]
  products: Product[]
  history: PurchasePriceHistoryEntry[]
  stocks: StoreStock[]
  storeId: string | 'all'
  periodDays: number
}): ProductPilotageRow[] {
  const marginRows = aggregateProfitability({
    sales: params.sales,
    products: params.products,
    history: params.history,
    dimension: 'product',
  })
  const days = Math.max(1, params.periodDays)
  const pmap = new Map(params.products.map((p) => [p.id, p]))

  return marginRows
    .map((row) => {
      const p = pmap.get(row.key)
      const stock = stockQtyForProduct(
        row.key,
        params.storeId,
        params.stocks,
        0,
      )
      const price = p?.priceTTC ?? 0
      const turnoverRate =
        stock > 0
          ? Math.round((row.qty / stock) * 100) / 100
          : row.qty > 0
            ? null
            : 0
      const dailyRate = row.qty / days
      const daysOfCover =
        dailyRate > 0 ? Math.round(stock / dailyRate) : stock > 0 ? null : 0

      return {
        productId: row.key,
        name: row.label,
        category: row.category ?? p?.category ?? 'Sans catégorie',
        qtySold: row.qty,
        revenueTTC: row.revenueTTC,
        marginTTC: row.linesWithCost > 0 ? row.marginTTC : null,
        marginRatePct: row.marginRatePct,
        stock,
        stockValueTTC: Math.round(stock * price),
        turnoverRate,
        daysOfCover,
      }
    })
    .sort((a, b) => b.revenueTTC - a.revenueTTC)
}

export function buildSellerPilotage(params: {
  sales: Sale[]
}): SalespersonPerfRow[] {
  return aggregateSalespersonPerformance({ sales: params.sales })
}

export function rateLabel(v: number | null, suffix = ' %'): string {
  if (v == null) return '—'
  return `${v}${suffix}`
}

export function turnoverLabel(v: number | null): string {
  if (v == null) return '—'
  return `${v}×`
}

export function daysCoverLabel(v: number | null): string {
  if (v == null) return '—'
  return `${v} j`
}
