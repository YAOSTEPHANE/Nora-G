import type { Sale } from '../../db/types'
import { saleNetTTC } from '../refundMath'
import { saleLocalYmd } from '../salesStats'
import { toCsvSemicolon } from '../analyticsExport'
import {
  buildFneInvoiceNumber,
  fneLinesFromSale,
  type FneInvoiceLine,
} from './fneInvoice'

export type { FneInvoiceLine }

export type FneExportDocument = {
  format: 'FNE-CI-v1'
  exportedAt: string
  issuer: {
    name: string
    nif: string
    regime: string
  }
  period: { from: string; to: string }
  invoices: Array<{
    invoiceNumber: string
    saleId: string
    issuedAt: string
    storeName: string | null
    cashier: string | null
    paymentMethod: string
    totalHT: number
    totalTVA: number
    totalTTC: number
    lines: FneInvoiceLine[]
  }>
}

export function buildFneExport(input: {
  sales: Sale[]
  fromYmd: string
  toYmd: string
  issuerName: string
  nif: string
  regime?: string
}): FneExportDocument {
  const invoices = input.sales
    .filter((sale) => {
      const ymd = saleLocalYmd(sale.createdAt)
      return ymd >= input.fromYmd && ymd <= input.toYmd && saleNetTTC(sale) > 0
    })
    .map((sale, index) => {
      const net = saleNetTTC(sale)
      const ratio = sale.totalTTC > 0 ? net / sale.totalTTC : 0
      const lines = fneLinesFromSale(sale)
      const ymd = saleLocalYmd(sale.createdAt)
      const invoiceNumber =
        sale.fne?.invoiceNumber ??
        buildFneInvoiceNumber(ymd, index + 1)
      return {
        invoiceNumber,
        saleId: sale.id,
        issuedAt: new Date(sale.fne?.issuedAt ?? sale.createdAt).toISOString(),
        storeName: sale.storeName ?? null,
        cashier: sale.cashierDisplayName ?? null,
        paymentMethod: sale.paymentMethod,
        totalHT: Math.round(sale.subtotalHT * ratio),
        totalTVA: Math.round(sale.tva * ratio),
        totalTTC: net,
        lines,
      }
    })

  return {
    format: 'FNE-CI-v1',
    exportedAt: new Date().toISOString(),
    issuer: {
      name: input.issuerName,
      nif: input.nif,
      regime: input.regime ?? 'REEL',
    },
    period: { from: input.fromYmd, to: input.toYmd },
    invoices,
  }
}

/** Export FEC simplifié (SYSCOHADA / OHADA — ventes caisse). */
export function buildFecCsv(input: {
  sales: Sale[]
  fromYmd: string
  toYmd: string
  journalCode?: string
}): string {
  const journal = input.journalCode ?? 'VT'
  const rows: string[][] = [
    [
      'JournalCode',
      'EcritureDate',
      'CompteNum',
      'CompteLib',
      'PieceRef',
      'EcritureLib',
      'Debit',
      'Credit',
    ],
  ]

  for (const sale of input.sales) {
    const ymd = saleLocalYmd(sale.createdAt)
    if (ymd < input.fromYmd || ymd > input.toYmd) continue
    const net = saleNetTTC(sale)
    if (net <= 0) continue
    const ratio = sale.totalTTC > 0 ? net / sale.totalTTC : 0
    const ht = Math.round(sale.subtotalHT * ratio)
    const tva = Math.round(sale.tva * ratio)
    const piece = sale.id.slice(0, 12).toUpperCase()
    const label = `Vente caisse ${piece}`

    rows.push([journal, ymd, '57', 'Caisse', piece, label, String(net), '0'])
    rows.push([journal, ymd, '707', 'Ventes', piece, label, '0', String(ht)])
    if (tva > 0) {
      rows.push([journal, ymd, '4457', 'TVA collectée', piece, label, '0', String(tva)])
    }
  }

  return toCsvSemicolon(rows)
}

export function downloadFneJson(doc: FneExportDocument, filename: string): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
