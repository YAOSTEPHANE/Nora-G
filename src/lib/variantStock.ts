import { db } from '../db/db'
import { storeStockRowId } from './storeStockId'
import { variantStoreStockRowId } from './variantStockId'
import { enqueueStockSync } from './sync'

/** Recalcule le stock magasin = somme des stocks variantes. */
export async function syncProductStockFromVariants(
  storeId: string,
  productId: string,
): Promise<number> {
  const rows = await db.variantStoreStocks
    .where('[storeId+productId]')
    .equals([storeId, productId])
    .toArray()
  const total = rows.reduce((s, r) => s + r.stock, 0)
  const product = await db.products.get(productId)
  await db.storeStocks.put({
    id: storeStockRowId(storeId, productId),
    storeId,
    productId,
    stock: total,
  })
  if (product) {
    await db.products.update(productId, { hasVariants: true })
    await enqueueStockSync({
      productId,
      stock: total,
      lowStockThreshold: product.lowStockThreshold,
      storeId,
    })
  }
  return total
}

/**
 * Déduit le stock variante (variante ciblée ou FIFO).
 * Met à jour le stock produit agrégé.
 */
export async function deductVariantStockForSale(params: {
  storeId: string
  productId: string
  productName: string
  qty: number
  variantId?: string
}): Promise<{ variantId: string }> {
  const qty = params.qty
  if (qty <= 0) throw new Error('Quantité invalide.')

  if (params.variantId) {
    const rid = variantStoreStockRowId(params.storeId, params.variantId)
    const row = await db.variantStoreStocks.get(rid)
    const cur = row?.stock ?? 0
    if (cur < qty) {
      throw new Error(
        `Stock variante insuffisant pour « ${params.productName} » (disponible : ${cur}).`,
      )
    }
    await db.variantStoreStocks.put({
      id: rid,
      storeId: params.storeId,
      productId: params.productId,
      variantId: params.variantId,
      stock: cur - qty,
    })
    await syncProductStockFromVariants(params.storeId, params.productId)
    return { variantId: params.variantId }
  }

  const rows = (
    await db.variantStoreStocks
      .where('[storeId+productId]')
      .equals([params.storeId, params.productId])
      .toArray()
  )
    .filter((r) => r.stock > 0)
    .sort((a, b) => b.stock - a.stock)

  let remaining = qty
  let firstVariantId: string | undefined
  for (const row of rows) {
    if (remaining <= 0) break
    const take = Math.min(row.stock, remaining)
    await db.variantStoreStocks.put({
      ...row,
      stock: row.stock - take,
    })
    firstVariantId ??= row.variantId
    remaining -= take
  }
  if (remaining > 0) {
    throw new Error(
      `Stock variante insuffisant pour « ${params.productName} » (manque ${remaining}).`,
    )
  }
  await syncProductStockFromVariants(params.storeId, params.productId)
  return { variantId: firstVariantId ?? '' }
}

/** Réintègre du stock sur une variante (ou la 1ʳᵉ active) après remboursement. */
export async function restoreVariantStockForRefund(params: {
  storeId: string
  productId: string
  qty: number
  variantId?: string
}): Promise<void> {
  if (params.qty <= 0) return

  let variantId = params.variantId
  if (!variantId) {
    const variants = await db.productVariants
      .where('productId')
      .equals(params.productId)
      .filter((v) => v.active)
      .toArray()
    variants.sort((a, b) => a.sortOrder - b.sortOrder)
    variantId = variants[0]?.id
  }
  if (!variantId) {
    // Pas de variante : stock classique uniquement.
    const rid = storeStockRowId(params.storeId, params.productId)
    const row = await db.storeStocks.get(rid)
    await db.storeStocks.put({
      id: rid,
      storeId: params.storeId,
      productId: params.productId,
      stock: (row?.stock ?? 0) + params.qty,
    })
    return
  }

  const rid = variantStoreStockRowId(params.storeId, variantId)
  const row = await db.variantStoreStocks.get(rid)
  await db.variantStoreStocks.put({
    id: rid,
    storeId: params.storeId,
    productId: params.productId,
    variantId,
    stock: (row?.stock ?? 0) + params.qty,
  })
  await syncProductStockFromVariants(params.storeId, params.productId)
}
