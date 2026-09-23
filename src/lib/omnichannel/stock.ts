import { db } from '../../db/db'
import type { OnlineOrder, ProductWithStock, SaleLine } from '../../db/types'
import { storeStockRowId } from '../storeStockId'

/** Commande qui immobilise du stock sans l’avoir encore déduit. */
export function isStockReservingOrder(order: OnlineOrder): boolean {
  return order.status === 'pending' && !order.stockDeductedAt
}

/** Quantités réservées par produit (commandes omnicanal en attente). */
export function reservedQtyByProduct(
  orders: OnlineOrder[],
  storeId: string,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const order of orders) {
    if (order.storeId !== storeId) continue
    if (!isStockReservingOrder(order)) continue
    for (const line of order.lines) {
      if (!line.productId || line.productId === 'remote-order') continue
      const qty = Number(line.qty)
      if (!Number.isFinite(qty) || qty <= 0) continue
      map.set(line.productId, (map.get(line.productId) ?? 0) + qty)
    }
  }
  return map
}

export function sellableStock(physical: number, reserved: number): number {
  return Math.max(0, Math.floor(physical) - Math.max(0, Math.floor(reserved)))
}

/** Applique les réservations omnicanal au stock affiché (même pool que la caisse). */
export function applyOmnichannelReservations(
  products: ProductWithStock[],
  reserved: Map<string, number>,
): ProductWithStock[] {
  if (reserved.size === 0) return products
  return products.map((product) => {
    const reservedQty = reserved.get(product.id) ?? 0
    if (reservedQty <= 0) return product
    return {
      ...product,
      stock: sellableStock(product.stock, reservedQty),
    }
  })
}

export async function loadReservedQtyByProduct(
  storeId: string,
): Promise<Map<string, number>> {
  const pending = await db.onlineOrders
    .where('status')
    .equals('pending')
    .toArray()
  return reservedQtyByProduct(pending, storeId)
}

export type StockCheckFailure = {
  productId: string
  name: string
  requested: number
  available: number
}

export async function checkLinesAgainstSellableStock(input: {
  storeId: string
  lines: Array<Pick<SaleLine, 'productId' | 'name' | 'qty'>>
  /** Exclure une commande déjà en attente (ex. re-validation). */
  ignoreOrderId?: string
}): Promise<StockCheckFailure[]> {
  const reserved = await loadReservedQtyByProduct(input.storeId)
  if (input.ignoreOrderId) {
    const ignored = await db.onlineOrders.get(input.ignoreOrderId)
    if (ignored && isStockReservingOrder(ignored)) {
      for (const line of ignored.lines) {
        if (!line.productId || line.productId === 'remote-order') continue
        const cur = reserved.get(line.productId) ?? 0
        reserved.set(line.productId, Math.max(0, cur - line.qty))
      }
    }
  }

  const failures: StockCheckFailure[] = []
  for (const line of input.lines) {
    if (!line.productId || line.productId === 'remote-order') continue
    const rid = storeStockRowId(input.storeId, line.productId)
    const row = await db.storeStocks.get(rid)
    const physical = row?.stock ?? 0
    const reservedQty = reserved.get(line.productId) ?? 0
    const available = sellableStock(physical, reservedQty)
    if (line.qty > available) {
      failures.push({
        productId: line.productId,
        name: line.name,
        requested: line.qty,
        available,
      })
    }
  }
  return failures
}

/** Déduit le stock magasin pour les lignes catalogue d’une commande. */
export async function deductOmnichannelOrderStock(input: {
  storeId: string
  lines: Array<Pick<SaleLine, 'productId' | 'name' | 'qty'>>
}): Promise<void> {
  for (const line of input.lines) {
    if (!line.productId || line.productId === 'remote-order') {
      throw new Error(
        `Ligne non liée au catalogue : « ${line.name} ». Reliez un produit pour déduire le stock.`,
      )
    }
    const product = await db.products.get(line.productId)
    if (!product || product.archived) {
      throw new Error(`Produit indisponible : « ${line.name} ».`)
    }
    const rid = storeStockRowId(input.storeId, line.productId)
    const row = await db.storeStocks.get(rid)
    const current = row?.stock ?? 0
    if (current < line.qty) {
      throw new Error(
        `Stock insuffisant pour « ${line.name} » (disponible : ${current}).`,
      )
    }
    await db.storeStocks.put({
      id: rid,
      storeId: input.storeId,
      productId: line.productId,
      stock: current - line.qty,
    })
  }
}
