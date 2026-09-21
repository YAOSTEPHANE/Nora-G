import type {
  Product,
  PurchaseOrder,
  PurchasePriceHistoryEntry,
  Supplier,
} from '../db/types'

export function merchandiseTotalTTC(order: PurchaseOrder): number {
  return order.lines.reduce(
    (s, l) => s + l.qtyOrdered * l.unitCostTTC,
    0,
  )
}

export function receivedMerchandiseTotalTTC(order: PurchaseOrder): number {
  return order.lines.reduce(
    (s, l) => s + l.qtyReceived * l.unitCostTTC,
    0,
  )
}

export function supplyExtrasTTC(order: PurchaseOrder): number {
  return (order.shippingCostTTC ?? 0) + (order.otherCostTTC ?? 0)
}

/** Coût d’approvisionnement total (marchandises + frais). */
export function landedCostTTC(order: PurchaseOrder): number {
  return merchandiseTotalTTC(order) + supplyExtrasTTC(order)
}

/**
 * Répartit les frais au prorata des montants marchandises
 * pour obtenir un coût unitaire « landed » approximatif.
 */
export function unitLandedCostTTC(
  order: PurchaseOrder,
  line: PurchaseOrder['lines'][number],
): number {
  const merch = merchandiseTotalTTC(order)
  const extras = supplyExtrasTTC(order)
  if (merch <= 0 || line.qtyOrdered <= 0) return line.unitCostTTC
  const share = (line.qtyOrdered * line.unitCostTTC) / merch
  const allocated = extras * share
  return Math.round(line.unitCostTTC + allocated / line.qtyOrdered)
}

export type SupplierSpendRow = {
  supplierId: string
  supplierName: string
  orderCount: number
  merchandiseTTC: number
  extrasTTC: number
  landedTTC: number
}

export function spendBySupplier(
  orders: PurchaseOrder[],
  suppliers: Supplier[],
): SupplierSpendRow[] {
  const nameById = new Map(suppliers.map((s) => [s.id, s.name]))
  const map = new Map<string, SupplierSpendRow>()
  for (const o of orders) {
    if (o.status === 'cancelled') continue
    const cur = map.get(o.supplierId) ?? {
      supplierId: o.supplierId,
      supplierName: nameById.get(o.supplierId) ?? o.supplierName,
      orderCount: 0,
      merchandiseTTC: 0,
      extrasTTC: 0,
      landedTTC: 0,
    }
    cur.orderCount += 1
    const merch = merchandiseTotalTTC(o)
    const extras = supplyExtrasTTC(o)
    cur.merchandiseTTC += merch
    cur.extrasTTC += extras
    cur.landedTTC += merch + extras
    map.set(o.supplierId, cur)
  }
  return [...map.values()].sort((a, b) => b.landedTTC - a.landedTTC)
}

export type ProductCostSnapshot = {
  product: Product
  purchasePriceTTC: number | null
  lastHistory?: PurchasePriceHistoryEntry
  historyCount: number
  deltaVsPrevious: number | null
}

export function buildProductCostSnapshots(
  products: Product[],
  history: PurchasePriceHistoryEntry[],
): ProductCostSnapshot[] {
  const byProduct = new Map<string, PurchasePriceHistoryEntry[]>()
  for (const h of history) {
    const list = byProduct.get(h.productId) ?? []
    list.push(h)
    byProduct.set(h.productId, list)
  }
  for (const list of byProduct.values()) {
    list.sort((a, b) => b.createdAt - a.createdAt)
  }

  return products
    .map((product) => {
      const list = byProduct.get(product.id) ?? []
      const last = list[0]
      const prev = last?.previousUnitCostTTC
      const current = product.purchasePriceTTC ?? last?.unitCostTTC ?? null
      let deltaVsPrevious: number | null = null
      if (current != null && prev != null) {
        deltaVsPrevious = current - prev
      } else if (current != null && list[1]) {
        deltaVsPrevious = current - list[1].unitCostTTC
      }
      return {
        product,
        purchasePriceTTC: current,
        lastHistory: last,
        historyCount: list.length,
        deltaVsPrevious,
      }
    })
    .sort((a, b) => a.product.name.localeCompare(b.product.name, 'fr'))
}

export function supplyCostKpis(orders: PurchaseOrder[]): {
  openCount: number
  receivedCount: number
  merchandiseTTC: number
  extrasTTC: number
  landedTTC: number
  avgLandedPerOrder: number
} {
  const relevant = orders.filter((o) => o.status !== 'cancelled')
  const received = relevant.filter(
    (o) => o.status === 'received' || o.status === 'partial',
  )
  const open = relevant.filter(
    (o) =>
      o.status === 'draft' || o.status === 'ordered' || o.status === 'partial',
  )
  const merchandiseTTC = relevant.reduce((s, o) => s + merchandiseTotalTTC(o), 0)
  const extrasTTC = relevant.reduce((s, o) => s + supplyExtrasTTC(o), 0)
  const landedTTC = merchandiseTTC + extrasTTC
  return {
    openCount: open.length,
    receivedCount: received.length,
    merchandiseTTC,
    extrasTTC,
    landedTTC,
    avgLandedPerOrder:
      relevant.length > 0 ? Math.round(landedTTC / relevant.length) : 0,
  }
}
