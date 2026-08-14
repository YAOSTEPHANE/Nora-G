import { db } from '../db/db'
import type { Product } from '../db/types'
import { appendAuditEvent, type AuditActor } from './auditLog'
import { enqueueProductSync } from './sync'

/**
 * Suppression définitive d'un article catalogue + stocks / recettes liés.
 * Les ventes historiques gardent le nom sur les lignes (pas de cascade ventes).
 */
export async function deleteProductPermanently(
  product: Product,
  actor: AuditActor,
): Promise<void> {
  const productId = product.id

  await db.transaction(
    'rw',
    [
      db.products,
      db.storeStocks,
      db.locationStocks,
      db.locationTransfers,
      db.productRecipeIngredients,
      db.kitchenIngredients,
      db.productLots,
      db.productSerialUnits,
      db.prescriptions,
      db.auditEvents,
      db.syncQueue,
    ],
    async () => {
      await db.storeStocks.where('productId').equals(productId).delete()
      await db.locationStocks.where('productId').equals(productId).delete()
      await db.locationTransfers.where('productId').equals(productId).delete()
      await db.productRecipeIngredients.where('productId').equals(productId).delete()
      await db.productLots.where('productId').equals(productId).delete()
      await db.productSerialUnits.where('productId').equals(productId).delete()

      await db.kitchenIngredients
        .where('productId')
        .equals(productId)
        .modify((ing) => {
          delete ing.productId
        })

      await db.products.delete(productId)

      await enqueueProductSync({ action: 'delete', productId })

      await appendAuditEvent({
        kind: 'product_deleted',
        actor,
        reason: 'Suppression article catalogue',
        payload: {
          productId,
          name: product.name,
          barcode: product.barcode,
          category: product.category,
          priceTTC: product.priceTTC,
        },
      })
    },
  )
}
