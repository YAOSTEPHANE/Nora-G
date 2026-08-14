import { db } from '../db/db'
import type { RefundRecord } from '../db/types'
import { appendAuditEvent } from './auditLog'
import { restoreTrackedStockForRefund } from './productTracking'
import { storeStockRowId } from './storeStockId'
import type { LineRefundQtyMap } from './refundMath'
import { computeRefundFromLineQty } from './refundMath'

export type RefundActor = { profileId: string; displayName: string }

/**
 * Annulation du panier en cours : journalisation audit uniquement (pas de vente).
 */
export async function logCartCancellation(params: {
  actor: RefundActor
  reason: string
  cartSnapshot: {
    lines: { productId: string; name: string; qty: number; unitPriceTTC: number }[]
    discountPct: number
  }
}): Promise<void> {
  await appendAuditEvent({
    kind: 'cart_cancelled',
    actor: {
      profileId: params.actor.profileId,
      displayName: params.actor.displayName,
    },
    reason: params.reason.trim() || '(aucun motif saisi)',
    payload: params.cartSnapshot,
  })
}

/**
 * Remboursement partiel ou total : stock, vente, refund, audit dans une transaction.
 */
export async function applySaleRefund(params: {
  saleId: string
  lineQty: LineRefundQtyMap
  reason: string
  actor: RefundActor
}): Promise<{ amountTTC: number }> {
  const reason = params.reason.trim()
  if (reason.length < 3) {
    throw new Error('Motif du remboursement (au moins 3 caractères).')
  }

  return db.transaction(
    'rw',
    [
      db.sales,
      db.storeStocks,
      db.productLots,
      db.productSerialUnits,
      db.products,
      db.refunds,
      db.auditEvents,
    ],
    async () => {
      const sale = await db.sales.get(params.saleId)
      if (!sale) throw new Error('Vente introuvable.')

      const computed = computeRefundFromLineQty(sale, params.lineQty)
      if (!computed.ok) throw new Error(computed.message)

      const storeId = sale.storeId
      if (!storeId) {
        throw new Error('Vente sans magasin : impossible de réintégrer le stock.')
      }

      const prevRefunded = sale.refundsTotalTTC ?? 0
      const prevLine = { ...(sale.refundedLineQty ?? {}) }
      for (const adj of computed.adjustments) {
        prevLine[adj.productId] =
          (prevLine[adj.productId] ?? 0) + adj.qty
      }

      const newRefundTotal = prevRefunded + computed.amountTTC
      if (newRefundTotal > sale.totalTTC + 1) {
        throw new Error('Le remboursement dépasse le total de la vente.')
      }

      for (const adj of computed.adjustments) {
        const saleLine = sale.lines.find((l) => l.productId === adj.productId)
        const product = await db.products.get(adj.productId)
        if (
          product &&
          (product.trackLots || product.trackSerialNumbers) &&
          saleLine
        ) {
          await restoreTrackedStockForRefund({
            storeId,
            productId: adj.productId,
            qty: adj.qty,
            saleLine,
          })
        } else {
          const rid = storeStockRowId(storeId, adj.productId)
          const row = await db.storeStocks.get(rid)
          const cur = row?.stock ?? 0
          await db.storeStocks.put({
            id: rid,
            storeId,
            productId: adj.productId,
            stock: cur + adj.qty,
          })
        }
      }

      const refundId = crypto.randomUUID()
      const rec: RefundRecord = {
        id: refundId,
        createdAt: Date.now(),
        saleId: sale.id,
        amountTTC: computed.amountTTC,
        reason,
        actorProfileId: params.actor.profileId,
        actorDisplayName: params.actor.displayName,
        lineAdjustments: computed.adjustments,
      }
      await db.refunds.add(rec)

      await db.sales.update(sale.id, {
        refundsTotalTTC: newRefundTotal,
        refundedLineQty: prevLine,
      })

      await appendAuditEvent({
        kind: 'sale_refund',
        actor: {
          profileId: params.actor.profileId,
          displayName: params.actor.displayName,
        },
        reason,
        relatedSaleId: sale.id,
        payload: {
          refundId,
          amountTTC: computed.amountTTC,
          lineAdjustments: computed.adjustments,
          saleTotalTTC: sale.totalTTC,
          newRefundsTotalTTC: newRefundTotal,
        },
      })

      return { amountTTC: computed.amountTTC }
    },
  )
}
