import type { PaymentMethod, Sale } from '../db/types'
import { salePaymentAmounts } from './paymentDisplay'
import { saleNetTTC } from './refundMath'

function localYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function saleLocalYmd(createdAt: number): string {
  return localYmd(new Date(createdAt))
}

export function filterSalesOnLocalDay(
  sales: Sale[],
  dayYmd: string,
): Sale[] {
  return sales.filter((s) => saleLocalYmd(s.createdAt) === dayYmd)
}

export function filterSalesToday(sales: Sale[], now = Date.now()): Sale[] {
  return filterSalesOnLocalDay(sales, localYmd(new Date(now)))
}

/** Ventes rattachées au magasin (les tickets sans `storeId` restent visibles partout). */
export function filterSalesForStore(sales: Sale[], storeId: string): Sale[] {
  return sales.filter((s) => !s.storeId || s.storeId === storeId)
}

export function filterSalesSince(sales: Sale[], sinceMs: number): Sale[] {
  return sales.filter((s) => s.createdAt >= sinceMs)
}

/** CA TTC net après remboursements. */
export function sumTotalTTC(sales: Sale[]): number {
  return sales.reduce((s, x) => s + saleNetTTC(x), 0)
}

export function avgTicket(sales: Sale[]): number {
  if (sales.length === 0) return 0
  return sumTotalTTC(sales) / sales.length
}

export type DayBucket = { label: string; ymd: string; total: number; count: number }

/** Derniers `dayCount` jours calendaires (aujourd'hui en dernier). */
export function bucketSalesByLocalDay(
  sales: Sale[],
  dayCount: number,
  now = Date.now(),
): DayBucket[] {
  const out: DayBucket[] = []
  const base = new Date(now)
  base.setHours(12, 0, 0, 0)
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    const ymd = localYmd(d)
    const label = d.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
    const daySales = filterSalesOnLocalDay(sales, ymd)
    out.push({
      label,
      ymd,
      total: sumTotalTTC(daySales),
      count: daySales.length,
    })
  }
  return out
}

export function paymentBreakdown(sales: Sale[]): Record<PaymentMethod, number> {
  const m: Record<PaymentMethod, number> = {
    cash: 0,
    card: 0,
    mobile: 0,
    credit: 0,
    mixed: 0,
  }
  for (const s of sales) {
    const net = saleNetTTC(s)
    if (net <= 0) continue
    const amt = salePaymentAmounts(s)
    const g = s.totalTTC
    const ratio = g > 0 ? net / g : 0
    m.cash += Math.round(amt.cash * ratio)
    m.card += Math.round(amt.card * ratio)
    m.mobile += Math.round(amt.mobile * ratio)
    if (s.paymentMethod === 'credit') m.credit += net
    if (s.paymentMethod === 'mixed') m.mixed += net
  }
  return m
}

export type PaymentMethodStats = { totalTTC: number; count: number }

/** Montants TTC et nombre de transactions par mode de paiement. */
export function paymentStatsByMethod(
  sales: Sale[],
): Record<PaymentMethod, PaymentMethodStats> {
  const z = (): PaymentMethodStats => ({ totalTTC: 0, count: 0 })
  const m: Record<PaymentMethod, PaymentMethodStats> = {
    cash: z(),
    card: z(),
    mobile: z(),
    credit: z(),
    mixed: z(),
  }
  for (const s of sales) {
    const net = saleNetTTC(s)
    if (net <= 0) continue
    const amt = salePaymentAmounts(s)
    const g = s.totalTTC
    const ratio = g > 0 ? net / g : 0
    const sc = {
      cash: Math.round(amt.cash * ratio),
      card: Math.round(amt.card * ratio),
      mobile: Math.round(amt.mobile * ratio),
    }
    if (s.paymentMethod === 'mixed') {
      m.mixed.totalTTC += net
      m.mixed.count += 1
      if (sc.cash > 0) {
        m.cash.totalTTC += sc.cash
        m.cash.count += 1
      }
      if (sc.card > 0) {
        m.card.totalTTC += sc.card
        m.card.count += 1
      }
      if (sc.mobile > 0) {
        m.mobile.totalTTC += sc.mobile
        m.mobile.count += 1
      }
      continue
    }
    const b = m[s.paymentMethod]
    b.totalTTC += net
    b.count += 1
  }
  return m
}

export type TopProductRow = {
  name: string
  qty: number
  revenueTTC: number
}

/** Ventes par heure locale (0–23) sur un ensemble de tickets. */
export type PeakHourBucket = {
  hour: number
  tickets: number
  totalTTC: number
}

export function peakHourBuckets(sales: Sale[]): PeakHourBucket[] {
  const arr: PeakHourBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    tickets: 0,
    totalTTC: 0,
  }))
  for (const s of sales) {
    const h = new Date(s.createdAt).getHours()
    arr[h].tickets += 1
    arr[h].totalTTC += saleNetTTC(s)
  }
  return arr
}

export function topProductsByQty(
  sales: Sale[],
  limit: number,
): TopProductRow[] {
  const map = new Map<string, { qty: number; revenueTTC: number }>()
  const disc = (pct: number) => Math.max(0, 1 - pct / 100)
  for (const s of sales) {
    const f = disc(s.discountPct)
    for (const line of s.lines) {
      const rq = s.refundedLineQty?.[line.productId] ?? 0
      const eq = Math.max(0, line.qty - rq)
      if (eq <= 0) continue
      const cur = map.get(line.name) ?? { qty: 0, revenueTTC: 0 }
      cur.qty += eq
      cur.revenueTTC += Math.round(line.unitPriceTTC * eq * f)
      map.set(line.name, cur)
    }
  }
  return [...map.entries()]
    .map(([name, v]) => ({
      name,
      qty: v.qty,
      revenueTTC: v.revenueTTC,
    }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit)
}
