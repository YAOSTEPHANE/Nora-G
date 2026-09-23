import type { Sale } from '../../db/types'
import { db } from '../../db/db'
import { saleNetTTC } from '../refundMath'
import { saleLocalYmd } from '../salesStats'

const SEQ_STORAGE_PREFIX = 'nora-fne-seq:'

export type FneInvoiceLine = {
  designation: string
  quantity: number
  unitPriceHT: number
  vatRatePct: number
  lineHT: number
  lineTVA: number
  lineTTC: number
}

export type SaleFneMeta = {
  /** Numéro stable attribué à l’encaissement (ex. FNE-20260922-00042). */
  invoiceNumber: string
  issuedAt: number
  nif: string | null
  regime: string
  status: 'issued'
}

export type FneIssueOptions = {
  enabled: boolean
  nif: string | null
  regime: string
}

/** Lignes FNE dérivées de la vente (pas de re-saisie). */
export function fneLinesFromSale(sale: Sale): FneInvoiceLine[] {
  const net = saleNetTTC(sale)
  const ratio = sale.totalTTC > 0 ? net / sale.totalTTC : 0
  return sale.lines.map((line) => {
    const lineTTC = Math.round(line.unitPriceTTC * line.qty * ratio)
    const vatRate = line.vatRatePct ?? 0
    const lineHT =
      vatRate > 0 ? Math.round(lineTTC / (1 + vatRate / 100)) : lineTTC
    return {
      designation: line.name,
      quantity: line.qty,
      unitPriceHT: line.qty > 0 ? Math.round(lineHT / line.qty) : 0,
      vatRatePct: vatRate,
      lineHT,
      lineTVA: lineTTC - lineHT,
      lineTTC,
    }
  })
}

export function buildFneInvoiceNumber(ymd: string, seq: number): string {
  const day = ymd.replace(/-/g, '')
  return `FNE-${day}-${String(Math.max(1, seq)).padStart(5, '0')}`
}

function parseSeqFromInvoiceNumber(
  invoiceNumber: string,
  ymd: string,
): number | null {
  const day = ymd.replace(/-/g, '')
  const m = invoiceNumber.match(new RegExp(`^FNE-${day}-(\\d{5})$`))
  if (!m?.[1]) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function readCachedSeq(ymd: string): number {
  try {
    const raw = localStorage.getItem(`${SEQ_STORAGE_PREFIX}${ymd}`)
    const n = raw ? Number(raw) : 0
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  } catch {
    return 0
  }
}

function writeCachedSeq(ymd: string, seq: number): void {
  try {
    localStorage.setItem(`${SEQ_STORAGE_PREFIX}${ymd}`, String(seq))
  } catch {
    /* ignore quota */
  }
}

/** Prochain numéro du jour : max(ventes locales, cache) + 1. */
export async function nextFneSequenceForDay(ymd: string): Promise<number> {
  const dayStart = new Date(`${ymd}T00:00:00`).getTime()
  const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1
  const sales = await db.sales
    .where('createdAt')
    .between(dayStart, dayEnd, true, true)
    .toArray()

  let maxSeq = readCachedSeq(ymd)
  for (const sale of sales) {
    const num = sale.fne?.invoiceNumber
    if (!num) continue
    const parsed = parseSeqFromInvoiceNumber(num, ymd)
    if (parsed != null && parsed > maxSeq) maxSeq = parsed
  }

  const next = maxSeq + 1
  writeCachedSeq(ymd, next)
  return next
}

/**
 * Attache une FNE à la vente à partir des montants / lignes déjà encaissés.
 * Aucune double saisie : HT, TVA, TTC et désignations viennent du ticket.
 */
export async function issueFneForSale(
  sale: Sale,
  options: FneIssueOptions,
): Promise<Sale> {
  if (!options.enabled) return sale
  if (sale.fne?.status === 'issued') return sale
  if (saleNetTTC(sale) <= 0) return sale

  const ymd = saleLocalYmd(sale.createdAt)
  const seq = await nextFneSequenceForDay(ymd)
  const fne: SaleFneMeta = {
    invoiceNumber: buildFneInvoiceNumber(ymd, seq),
    issuedAt: sale.createdAt,
    nif: options.nif?.trim() || null,
    regime: options.regime?.trim() || 'REEL',
    status: 'issued',
  }
  return { ...sale, fne }
}

export function saleHasFne(sale: Sale | null | undefined): boolean {
  return Boolean(sale?.fne?.invoiceNumber)
}
