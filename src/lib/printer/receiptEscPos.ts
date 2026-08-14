import type { OnlineOrder, Sale, TicketInvoice } from '../../db/types'
import { getAppSettings } from '../appSettings'
import { formatFCFA, vatSlicesFromLinesTTC } from '../money'
import {
  paymentMethodShortLabel,
  salePaymentAmounts,
} from '../paymentDisplay'
import { saleNetTTC } from '../refundMath'
import { getReceiptBusinessName, receiptDocumentLabel } from '../receiptBusinessName'
import { SESSION_ID } from '../session'
import {
  centerLine,
  cmdAlign,
  cmdBold,
  cmdCut,
  cmdDoubleSize,
  cmdFeed,
  cmdInit,
  cmdOpenCashDrawer,
  concatBytes,
  dashedLine,
  padLine,
  textLine,
} from './escpos'

export type ReceiptPrintSource =
  | { kind: 'sale'; sale: Sale }
  | { kind: 'onlineOrder'; order: OnlineOrder }
  | { kind: 'ticketInvoice'; ticketInvoice: TicketInvoice }

function syntheticSaleFromOnlineOrder(order: OnlineOrder): Sale {
  return {
    id: order.id,
    createdAt: order.createdAt,
    lines: order.lines,
    subtotalHT: order.subtotalHT,
    tva: order.tva,
    totalTTC: order.totalTTC,
    discountPct: order.discountPct ?? 0,
    paymentMethod: order.paymentMethod,
    synced: false,
    storeId: order.storeId,
    storeName: order.storeName,
  }
}

function syntheticSaleFromTicketInvoice(doc: TicketInvoice): Sale {
  return {
    id: doc.id,
    createdAt: doc.createdAt,
    lines: doc.lines,
    subtotalHT: doc.subtotalHT,
    tva: doc.tva,
    totalTTC: doc.totalTTC,
    discountPct: 0,
    paymentMethod: 'cash',
    synced: false,
    storeId: doc.storeId,
    storeName: doc.storeName,
    cashierProfileId: doc.createdByProfileId,
    cashierDisplayName: doc.createdByDisplayName,
  }
}

function resolveSale(source: ReceiptPrintSource): {
  sale: Sale
  order: OnlineOrder | null
  ticketInvoice: TicketInvoice | null
  documentLabel: string
} {
  if (source.kind === 'sale') {
    return {
      sale: source.sale,
      order: null,
      ticketInvoice: null,
      documentLabel: receiptDocumentLabel('sale'),
    }
  }
  if (source.kind === 'onlineOrder') {
    return {
      sale: syntheticSaleFromOnlineOrder(source.order),
      order: source.order,
      ticketInvoice: null,
      documentLabel: receiptDocumentLabel('onlineOrder'),
    }
  }
  return {
    sale: syntheticSaleFromTicketInvoice(source.ticketInvoice),
    order: null,
    ticketInvoice: source.ticketInvoice,
    documentLabel: receiptDocumentLabel(
      source.ticketInvoice.kind === 'facture' ? 'facture' : 'ticket',
    ),
  }
}

/**
 * Construit le flux ESC/POS 80 mm pour Toplink TL-R120 (et clones ESC/POS).
 */
export function buildEscPosReceipt(
  source: ReceiptPrintSource,
  options?: { openCashDrawer?: boolean },
): Uint8Array {
  const { sale, order, ticketInvoice, documentLabel } = resolveSale(source)
  const businessName = getReceiptBusinessName()
  const dtLabel = new Date(sale.createdAt).toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const receiptRef = (
    ticketInvoice?.reference ?? sale.id.slice(0, 8)
  ).toUpperCase()
  const vatSlices = vatSlicesFromLinesTTC(sale.lines, sale.discountPct)
  const amt = salePaymentAmounts(sale)
  const footer =
    order != null
      ? 'Commande en ligne · Document non fiscal'
      : getAppSettings().receiptFooterLine

  const chunks: Uint8Array[] = [
    cmdInit(),
    cmdAlign('center'),
    cmdBold(true),
    cmdDoubleSize(true),
    textLine(businessName),
    cmdDoubleSize(false),
    cmdBold(false),
    textLine(documentLabel),
    textLine(dtLabel),
    textLine(`Session #${SESSION_ID}`),
    textLine(`Ref. ${receiptRef}`),
  ]

  if (sale.cashierDisplayName) {
    chunks.push(textLine(`Caissier : ${sale.cashierDisplayName}`))
  }
  if (sale.storeName && sale.storeName.trim() !== businessName) {
    chunks.push(textLine(`Magasin : ${sale.storeName}`))
  }
  if (sale.tableName) {
    chunks.push(textLine(`Table : ${sale.tableName}`))
  }
  if (order) {
    chunks.push(textLine(`Client : ${order.customerName}`))
    if (order.customerPhone) chunks.push(textLine(`Tel. : ${order.customerPhone}`))
    if (order.customerAddress) {
      chunks.push(textLine(`Adresse : ${order.customerAddress}`))
    }
    chunks.push(
      textLine(
        order.fulfillmentMode === 'delivery'
          ? 'Livraison'
          : 'Retrait boutique',
      ),
    )
  }
  if (ticketInvoice) {
    chunks.push(
      textLine(`Client : ${ticketInvoice.customerName ?? 'Client comptoir'}`),
    )
    if (ticketInvoice.customerPhone) {
      chunks.push(textLine(`Tel. : ${ticketInvoice.customerPhone}`))
    }
  }

  chunks.push(cmdAlign('left'), textLine(dashedLine()))

  for (const line of sale.lines) {
    const total = formatFCFA(line.unitPriceTTC * line.qty)
    chunks.push(textLine(padLine(line.name.slice(0, 28), total)))
    chunks.push(
      textLine(`  ${formatFCFA(line.unitPriceTTC)} x ${line.qty}`),
    )
  }

  chunks.push(textLine(dashedLine()))
  chunks.push(textLine(padLine('Sous-total HT', formatFCFA(sale.subtotalHT))))
  for (const slice of vatSlices) {
    chunks.push(
      textLine(padLine(`TVA ${slice.ratePct} %`, formatFCFA(slice.tva))),
    )
  }
  if (sale.discountPct > 0) {
    chunks.push(
      textLine(
        padLine(
          `Remise ${sale.discountPct} %`,
          order?.promoCode ? String(order.promoCode) : '',
        ),
      ),
    )
  }
  if (order?.deliveryFeeTTC && order.deliveryFeeTTC > 0) {
    chunks.push(
      textLine(padLine('Livraison TTC', formatFCFA(order.deliveryFeeTTC))),
    )
  }
  if ((sale.refundsTotalTTC ?? 0) > 0) {
    chunks.push(
      textLine(padLine('Rembourse', formatFCFA(sale.refundsTotalTTC ?? 0))),
    )
    chunks.push(textLine(padLine('CA net', formatFCFA(saleNetTTC(sale)))))
  }

  chunks.push(
    cmdBold(true),
    textLine(padLine('TOTAL TTC', formatFCFA(sale.totalTTC))),
    cmdBold(false),
  )

  if (!ticketInvoice) {
    chunks.push(textLine(dashedLine()), cmdAlign('center'), textLine('PAIEMENT'))
    chunks.push(
      textLine(
        order
          ? order.paymentMethod === 'cash'
            ? 'Especes a la livraison / retrait'
            : order.paymentMethod === 'card'
              ? 'Carte bancaire'
              : order.paymentMethod === 'mobile'
                ? 'Mobile money'
                : 'Paiement mixte'
          : paymentMethodShortLabel(sale.paymentMethod),
      ),
      cmdAlign('left'),
    )
    if (amt.cash > 0) chunks.push(textLine(padLine('Especes', formatFCFA(amt.cash))))
    if (amt.card > 0) chunks.push(textLine(padLine('Carte (TPE)', formatFCFA(amt.card))))
    if (amt.mobile > 0) {
      chunks.push(textLine(padLine('Mobile money', formatFCFA(amt.mobile))))
    }
    if (sale.cashReceived != null) {
      chunks.push(textLine(padLine('Recu', formatFCFA(sale.cashReceived))))
    }
    if (sale.changeDue != null && sale.changeDue > 0) {
      chunks.push(textLine(padLine('Monnaie', formatFCFA(sale.changeDue))))
    }
  }

  chunks.push(
    cmdAlign('center'),
    cmdFeed(1),
    textLine(centerLine(footer)),
    textLine(centerLine('Nora · ESC/POS')),
    cmdFeed(2),
  )

  // Pulse tiroir avant la coupe (plus fiable sur certains clones POS-80).
  if (options?.openCashDrawer) {
    chunks.push(cmdOpenCashDrawer())
  }

  chunks.push(cmdFeed(2), cmdCut())

  if (options?.openCashDrawer) {
    chunks.push(cmdOpenCashDrawer())
  }

  return concatBytes(...chunks)
}

export function buildEscPosTestPage(): Uint8Array {
  return concatBytes(
    cmdInit(),
    cmdAlign('center'),
    cmdBold(true),
    cmdDoubleSize(true),
    textLine('Toplink TL-R120'),
    cmdDoubleSize(false),
    cmdBold(false),
    textLine('Test impression Nora'),
    textLine(new Date().toLocaleString('fr-FR')),
    cmdAlign('left'),
    textLine(dashedLine()),
    textLine(padLine('Article demo', formatFCFA(1500))),
    textLine(padLine('TOTAL TTC', formatFCFA(1500))),
    cmdAlign('center'),
    cmdFeed(2),
    textLine('Connexion OK'),
    cmdFeed(3),
    cmdCut(),
  )
}
