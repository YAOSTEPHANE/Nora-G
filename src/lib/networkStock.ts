import type { Product, Store, StoreStock } from '../db/types'
import { isWarehouseStore } from '../db/seedStores'
import { productIsActive } from './productFilters'

export type NetworkStoreStockSummary = {
  storeId: string
  store: Store
  skuCount: number
  units: number
  valueTTC: number
  ruptureCount: number
  lowCount: number
}

export type NetworkConsolidatedRow = {
  product: Product
  byStore: Map<string, number>
  total: number
  warehouseQty: number
  boutiqueQty: number
  hasRuptureSomewhere: boolean
  hasLowSomewhere: boolean
}

export function buildNetworkStockMatrix(
  stocks: StoreStock[],
): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>()
  for (const s of stocks) {
    if (!m.has(s.productId)) m.set(s.productId, new Map())
    m.get(s.productId)!.set(s.storeId, s.stock)
  }
  return m
}

export function summarizeStoreStocks(params: {
  stores: Store[]
  products: Product[]
  stocks: StoreStock[]
}): NetworkStoreStockSummary[] {
  const activeProducts = params.products.filter(productIsActive)
  const matrix = buildNetworkStockMatrix(params.stocks)
  return params.stores.map((store) => {
    let units = 0
    let valueTTC = 0
    let ruptureCount = 0
    let lowCount = 0
    let skuCount = 0
    for (const p of activeProducts) {
      const q = matrix.get(p.id)?.get(store.id) ?? 0
      if (q <= 0) {
        ruptureCount += 1
      } else if (q <= p.lowStockThreshold) {
        lowCount += 1
      }
      if (q > 0) skuCount += 1
      units += q
      valueTTC += q * p.priceTTC
    }
    return {
      storeId: store.id,
      store,
      skuCount,
      units,
      valueTTC: Math.round(valueTTC),
      ruptureCount,
      lowCount,
    }
  })
}

export function buildConsolidatedRows(params: {
  stores: Store[]
  products: Product[]
  stocks: StoreStock[]
}): NetworkConsolidatedRow[] {
  const matrix = buildNetworkStockMatrix(params.stocks)

  return params.products
    .filter(productIsActive)
    .map((product) => {
      const byStore = matrix.get(product.id) ?? new Map<string, number>()
      let total = 0
      let warehouseQty = 0
      let boutiqueQty = 0
      let hasRuptureSomewhere = false
      let hasLowSomewhere = false
      for (const s of params.stores) {
        const q = byStore.get(s.id) ?? 0
        total += q
        if (isWarehouseStore(s)) warehouseQty += q
        else boutiqueQty += q
        if (!isWarehouseStore(s)) {
          if (q <= 0) hasRuptureSomewhere = true
          else if (q <= product.lowStockThreshold) hasLowSomewhere = true
        }
      }
      return {
        product,
        byStore,
        total,
        warehouseQty,
        boutiqueQty,
        hasRuptureSomewhere,
        hasLowSomewhere,
      }
    })
    .sort((a, b) => a.product.name.localeCompare(b.product.name, 'fr'))
}

export function networkTotals(summaries: NetworkStoreStockSummary[]): {
  units: number
  valueTTC: number
  ruptureSku: number
  boutiqueCount: number
  warehouseCount: number
} {
  return {
    units: summaries.reduce((s, x) => s + x.units, 0),
    valueTTC: summaries.reduce((s, x) => s + x.valueTTC, 0),
    ruptureSku: summaries.reduce((s, x) => s + x.ruptureCount, 0),
    boutiqueCount: summaries.filter((x) => !isWarehouseStore(x.store)).length,
    warehouseCount: summaries.filter((x) => isWarehouseStore(x.store)).length,
  }
}
