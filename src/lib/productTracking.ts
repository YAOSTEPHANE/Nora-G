import { db } from '../db/db'
import type {
  LotAllocation,
  Product,
  ProductLot,
  ProductSerialUnit,
} from '../db/types'
import { storeStockRowId } from './storeStockId'

export function productLotRowId(
  storeId: string,
  productId: string,
  lotNumber: string,
): string {
  const norm = lotNumber.trim().toUpperCase()
  return `${storeId}:${productId}:${norm}`
}

export async function countInStockSerials(
  storeId: string,
  productId: string,
): Promise<number> {
  const rows = await db.productSerialUnits
    .where('[storeId+productId]')
    .equals([storeId, productId])
    .toArray()
  return rows.filter((r) => r.status === 'in_stock').length
}

export async function sumLotQty(
  storeId: string,
  productId: string,
): Promise<number> {
  const lots = await db.productLots
    .where('[storeId+productId]')
    .equals([storeId, productId])
    .toArray()
  return lots.reduce((sum, lot) => sum + lot.qty, 0)
}

export async function recomputeTrackedStock(
  storeId: string,
  productId: string,
  product: Pick<Product, 'trackLots' | 'trackSerialNumbers'>,
): Promise<number> {
  if (product.trackSerialNumbers) {
    return countInStockSerials(storeId, productId)
  }
  if (product.trackLots) {
    return sumLotQty(storeId, productId)
  }
  const row = await db.storeStocks.get(storeStockRowId(storeId, productId))
  return row?.stock ?? 0
}

/** Met à jour storeStocks à partir des lots ou séries. */
export async function syncStoreStockFromTracking(
  storeId: string,
  productId: string,
): Promise<void> {
  const product = await db.products.get(productId)
  if (!product?.trackLots && !product?.trackSerialNumbers) return
  const stock = await recomputeTrackedStock(storeId, productId, product)
  await db.storeStocks.put({
    id: storeStockRowId(storeId, productId),
    storeId,
    productId,
    stock,
  })
}

/** Allocation FEFO (First Expired, First Out). */
export function allocateLotsFEFO(
  lots: ProductLot[],
  qtyNeeded: number,
): LotAllocation[] | { error: string } {
  if (qtyNeeded <= 0) return []
  const sorted = [...lots]
    .filter((l) => l.qty > 0)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
  const total = sorted.reduce((s, l) => s + l.qty, 0)
  if (total < qtyNeeded) {
    return { error: `Stock lot insuffisant (disponible : ${total}).` }
  }
  let remaining = qtyNeeded
  const out: LotAllocation[] = []
  for (const lot of sorted) {
    if (remaining <= 0) break
    const take = Math.min(lot.qty, remaining)
    out.push({
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      expiryDate: lot.expiryDate,
      qty: take,
    })
    remaining -= take
  }
  return out
}

export function lotExpiryStatus(
  expiryDate: string,
  warnDays = 30,
): 'expired' | 'soon' | 'ok' {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const exp = new Date(`${expiryDate}T12:00:00`)
  if (Number.isNaN(exp.getTime())) return 'ok'
  const diffDays = Math.ceil(
    (exp.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  )
  if (diffDays < 0) return 'expired'
  if (diffDays <= warnDays) return 'soon'
  return 'ok'
}

export function warrantyStatus(
  warrantyUntil?: string,
): 'active' | 'expired' | 'none' {
  if (!warrantyUntil?.trim()) return 'none'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(`${warrantyUntil}T12:00:00`)
  if (Number.isNaN(end.getTime())) return 'none'
  return end >= today ? 'active' : 'expired'
}

export async function pickAvailableSerials(
  storeId: string,
  productId: string,
  qty: number,
): Promise<ProductSerialUnit[]> {
  const rows = await db.productSerialUnits
    .where('[storeId+productId]')
    .equals([storeId, productId])
    .toArray()
  return rows.filter((r) => r.status === 'in_stock').slice(0, qty)
}

export type CheckoutLineMeta = {
  productId: string
  lotAllocations?: LotAllocation[]
  serialUnitIds?: string[]
}

/** Déduit lots ou séries ; retourne false si le stock classique doit être déduit. */
export async function deductTrackedStockForLine(params: {
  storeId: string
  line: { productId: string; name: string; qty: number }
  meta?: CheckoutLineMeta
  saleId: string
  createdAt: number
}): Promise<'tracked' | 'classic'> {
  const product = await db.products.get(params.line.productId)
  if (!product) {
    throw new Error(`Article « ${params.line.name} » introuvable.`)
  }

  if (product.trackLots) {
    const allocs = params.meta?.lotAllocations ?? []
    const sum = allocs.reduce((s, a) => s + a.qty, 0)
    if (sum !== params.line.qty) {
      throw new Error(
        `Lots incomplets pour « ${params.line.name} » (${sum}/${params.line.qty}).`,
      )
    }
    for (const alloc of allocs) {
      if (lotExpiryStatus(alloc.expiryDate) === 'expired') {
        throw new Error(`Lot ${alloc.lotNumber} périmé.`)
      }
      const lot = await db.productLots.get(alloc.lotId)
      if (!lot || lot.qty < alloc.qty) {
        throw new Error(`Stock lot insuffisant (${alloc.lotNumber}).`)
      }
      await db.productLots.update(alloc.lotId, { qty: lot.qty - alloc.qty })
    }
    await syncStoreStockFromTracking(params.storeId, params.line.productId)
    return 'tracked'
  }

  if (product.trackSerialNumbers) {
    const ids = params.meta?.serialUnitIds ?? []
    if (ids.length !== params.line.qty) {
      throw new Error(
        `Sélectionnez ${params.line.qty} n° de série pour « ${params.line.name} ».`,
      )
    }
    for (const id of ids) {
      const unit = await db.productSerialUnits.get(id)
      if (!unit || unit.status !== 'in_stock') {
        throw new Error(`Unité série indisponible pour « ${params.line.name} ».`)
      }
      await db.productSerialUnits.update(id, {
        status: 'sold',
        saleId: params.saleId,
        soldAt: params.createdAt,
      })
    }
    await syncStoreStockFromTracking(params.storeId, params.line.productId)
    return 'tracked'
  }

  return 'classic'
}

/** Réintègre stock lot/série après remboursement (si traçabilité sur la ligne). */
export async function restoreTrackedStockForRefund(params: {
  storeId: string
  productId: string
  qty: number
  saleLine?: {
    lotAllocations?: LotAllocation[]
    serialNumbers?: string[]
  }
}): Promise<void> {
  const product = await db.products.get(params.productId)
  if (!product) return

  if (product.trackLots && params.saleLine?.lotAllocations?.length) {
    for (const alloc of params.saleLine.lotAllocations) {
      const lot = await db.productLots.get(alloc.lotId)
      if (lot) {
        await db.productLots.update(alloc.lotId, { qty: lot.qty + alloc.qty })
      }
    }
    await syncStoreStockFromTracking(params.storeId, params.productId)
    return
  }

  if (product.trackSerialNumbers && params.saleLine?.serialNumbers?.length) {
    const toRestore = params.saleLine.serialNumbers.slice(0, params.qty)
    for (const serial of toRestore) {
      const unit = await db.productSerialUnits
        .where('[storeId+serialNumber]')
        .equals([params.storeId, serial])
        .first()
      if (unit && unit.status === 'sold') {
        await db.productSerialUnits.update(unit.id, {
          status: 'in_stock',
          saleId: undefined,
          soldAt: undefined,
        })
      }
    }
    await syncStoreStockFromTracking(params.storeId, params.productId)
  }
}
