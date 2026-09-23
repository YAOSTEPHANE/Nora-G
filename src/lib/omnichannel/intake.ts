import { db } from '../../db/db'
import type {
  OnlineOrder,
  OnlineOrderPlatform,
  PaymentMethod,
  SaleLine,
} from '../../db/types'
import {
  getKitchenStationDemo,
  isDeliveryModuleDemoOn,
  isKitchenModuleDemoOn,
} from '../integrationsConfig'
import { DEFAULT_VAT_RATE_PCT, totalsFromLinesTTC } from '../money'
import { checkLinesAgainstSellableStock } from './stock'

export type OmnichannelIntakeLine = {
  productId: string
  qty: number
}

export type CreateOmnichannelOrderInput = {
  storeId: string
  storeName?: string
  platform: OnlineOrderPlatform
  fulfillmentMode: 'pickup' | 'delivery'
  customerName: string
  customerPhone?: string
  customerAddress?: string
  customerNote?: string
  externalOrderRef?: string
  paymentMethod?: PaymentMethod
  lines: OmnichannelIntakeLine[]
}

/**
 * Crée une commande omnicanal liée au catalogue + même stock magasin.
 * Les quantités sont réservées (pending) jusqu’à validation / rejet.
 */
export async function createOmnichannelCatalogOrder(
  input: CreateOmnichannelOrderInput,
): Promise<OnlineOrder> {
  const name = input.customerName.trim()
  if (!name) throw new Error('Indiquez le nom du client.')
  if (input.lines.length === 0) {
    throw new Error('Ajoutez au moins un produit du catalogue.')
  }

  const saleLines: SaleLine[] = []
  for (const raw of input.lines) {
    const qty = Math.max(0, Math.round(Number(raw.qty)))
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error('Quantité invalide.')
    }
    const product = await db.products.get(raw.productId)
    if (!product || product.archived) {
      throw new Error('Produit introuvable ou archivé.')
    }
    saleLines.push({
      productId: product.id,
      name: product.name,
      unitPriceTTC: product.priceTTC,
      qty,
      vatRatePct: product.vatRatePct ?? DEFAULT_VAT_RATE_PCT,
    })
  }

  const failures = await checkLinesAgainstSellableStock({
    storeId: input.storeId,
    lines: saleLines,
  })
  if (failures.length > 0) {
    const first = failures[0]!
    throw new Error(
      `Stock insuffisant pour « ${first.name} » (vendable : ${first.available}, demandé : ${first.requested}).`,
    )
  }

  if (
    input.fulfillmentMode === 'delivery' &&
    !input.customerAddress?.trim()
  ) {
    throw new Error('Adresse requise pour une livraison.')
  }

  const totals = totalsFromLinesTTC(saleLines, 0)
  const now = Date.now()
  const id = crypto.randomUUID()
  const kitchenEnabled = isKitchenModuleDemoOn()
  const deliveryEnabled =
    input.fulfillmentMode === 'delivery' && isDeliveryModuleDemoOn()

  const order: OnlineOrder = {
    id,
    createdAt: now,
    importedAt: now,
    storeId: input.storeId,
    storeName: input.storeName,
    customerName: name,
    customerPhone: input.customerPhone?.trim() || undefined,
    customerAddress: input.customerAddress?.trim() || undefined,
    customerNote: input.customerNote?.trim() || undefined,
    paymentMethod: input.paymentMethod ?? 'mobile',
    lines: saleLines,
    subtotalHT: totals.subtotalHT,
    tva: totals.tva,
    totalTTC: totals.totalTTC,
    fulfillmentMode: input.fulfillmentMode,
    status: 'pending',
    sourcePlatform: input.platform,
    externalOrderRef:
      input.externalOrderRef?.trim() ||
      `${input.platform}-${id.slice(0, 8).toUpperCase()}`,
    kitchenStatus: kitchenEnabled ? 'queued' : undefined,
    kitchenPriority: kitchenEnabled ? 'normal' : undefined,
    kitchenStation: kitchenEnabled ? getKitchenStationDemo() : undefined,
    kitchenTicketCode: kitchenEnabled
      ? `K-${id.slice(0, 6).toUpperCase()}`
      : undefined,
    kitchenUpdatedAt: kitchenEnabled ? now : undefined,
    deliveryStatus: deliveryEnabled ? 'queued' : undefined,
    deliveryUpdatedAt: deliveryEnabled ? now : undefined,
  }

  await db.onlineOrders.add(order)
  return order
}
