import type { StaffProfile } from '../auth/types'
import type {
  RefundRecord,
  Sale,
  SalespersonGoal,
  StaffCommission,
} from '../db/types'
import { saleNetTTC } from './refundMath'

export function saleDiscountTTC(sale: Sale): number {
  const pct = sale.discountPct ?? 0
  let d = 0
  if (pct > 0 && pct < 100) {
    d = Math.round(sale.totalTTC / (1 - pct / 100) - sale.totalTTC)
  }
  return d + (sale.loyaltyDiscountTTC ?? 0)
}

export type SalespersonPerfRow = {
  key: string
  profileId: string | null
  displayName: string
  salesCount: number
  caGrossTTC: number
  caNetTTC: number
  avgBasketTTC: number
  discountTTC: number
  discountedSalesCount: number
  refundTTC: number
  refundedSalesCount: number
  commissionAccruedTTC: number
  commissionPaidTTC: number
}

function sellerKey(sale: Sale): { key: string; name: string; profileId: string | null } {
  if (sale.cashierProfileId) {
    return {
      key: sale.cashierProfileId,
      name: sale.cashierDisplayName?.trim() || sale.cashierProfileId,
      profileId: sale.cashierProfileId,
    }
  }
  const name = sale.cashierDisplayName?.trim() || 'Non attribué'
  return { key: `name:${name}`, name, profileId: null }
}

export function aggregateSalespersonPerformance(params: {
  sales: Sale[]
  refunds?: RefundRecord[]
  commissions?: StaffCommission[]
  profiles?: StaffProfile[]
}): SalespersonPerfRow[] {
  const map = new Map<string, SalespersonPerfRow>()
  const nameByProfile = new Map(
    (params.profiles ?? []).map((p) => [p.id, p.displayName]),
  )

  const ensure = (key: string, name: string, profileId: string | null) => {
    let row = map.get(key)
    if (!row) {
      row = {
        key,
        profileId,
        displayName: nameByProfile.get(profileId ?? '') ?? name,
        salesCount: 0,
        caGrossTTC: 0,
        caNetTTC: 0,
        avgBasketTTC: 0,
        discountTTC: 0,
        discountedSalesCount: 0,
        refundTTC: 0,
        refundedSalesCount: 0,
        commissionAccruedTTC: 0,
        commissionPaidTTC: 0,
      }
      map.set(key, row)
    }
    return row
  }

  for (const sale of params.sales) {
    const { key, name, profileId } = sellerKey(sale)
    const row = ensure(key, name, profileId)
    row.salesCount += 1
    row.caGrossTTC += sale.totalTTC
    row.caNetTTC += saleNetTTC(sale)
    const disc = saleDiscountTTC(sale)
    if (disc > 0) {
      row.discountTTC += disc
      row.discountedSalesCount += 1
    }
    const refund = sale.refundsTotalTTC ?? 0
    if (refund > 0) {
      row.refundTTC += refund
      row.refundedSalesCount += 1
    }
  }

  for (const c of params.commissions ?? []) {
    const key = c.staffProfileId
      ? c.staffProfileId
      : `name:${c.staffName.trim()}`
    const row = ensure(key, c.staffName, c.staffProfileId ?? null)
    if (c.status === 'paid') row.commissionPaidTTC += c.commissionTTC
    else row.commissionAccruedTTC += c.commissionTTC
  }

  // Ensure active caissier profiles appear even with 0 sales
  for (const p of params.profiles ?? []) {
    if (p.active === false) continue
    if (p.role !== 'caissier' && p.role !== 'gerant') continue
    ensure(p.id, p.displayName, p.id)
  }

  return [...map.values()]
    .map((r) => ({
      ...r,
      avgBasketTTC:
        r.salesCount > 0 ? Math.round(r.caNetTTC / r.salesCount) : 0,
    }))
    .sort((a, b) => b.caNetTTC - a.caNetTTC)
}

export type GoalProgress = {
  goal: SalespersonGoal
  caNetTTC: number
  salesCount: number
  caProgressPct: number | null
  salesProgressPct: number | null
  suggestedCommissionTTC: number
}

export function ymdFromMs(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function msFromYmd(ymd: string, endOfDay = false): number {
  const [y, m, d] = ymd.split('-').map(Number)
  if (endOfDay) return new Date(y!, m! - 1, d!, 23, 59, 59, 999).getTime()
  return new Date(y!, m! - 1, d!, 0, 0, 0, 0).getTime()
}

export function currentMonthBounds(now = Date.now()): {
  startYmd: string
  endYmd: string
} {
  const d = new Date(now)
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return {
    startYmd: ymdFromMs(start.getTime()),
    endYmd: ymdFromMs(end.getTime()),
  }
}

export function evaluateGoals(params: {
  goals: SalespersonGoal[]
  sales: Sale[]
}): GoalProgress[] {
  return params.goals.map((goal) => {
    const start = msFromYmd(goal.periodStartYmd)
    const end = msFromYmd(goal.periodEndYmd, true)
    const scoped = params.sales.filter((s) => {
      if (s.createdAt < start || s.createdAt > end) return false
      if (goal.storeId && s.storeId !== goal.storeId) return false
      if (s.cashierProfileId) return s.cashierProfileId === goal.staffProfileId
      return (
        (s.cashierDisplayName ?? '').trim() === goal.staffDisplayName.trim()
      )
    })
    const caNetTTC = scoped.reduce((m, s) => m + saleNetTTC(s), 0)
    const salesCount = scoped.length
    const caProgressPct =
      goal.targetCaTTC > 0
        ? Math.round((caNetTTC / goal.targetCaTTC) * 1000) / 10
        : null
    const salesProgressPct =
      goal.targetSalesCount != null && goal.targetSalesCount > 0
        ? Math.round((salesCount / goal.targetSalesCount) * 1000) / 10
        : null
    const rate = goal.commissionRatePct ?? 0
    const suggestedCommissionTTC = Math.round((caNetTTC * rate) / 100)
    return {
      goal,
      caNetTTC,
      salesCount,
      caProgressPct,
      salesProgressPct,
      suggestedCommissionTTC,
    }
  })
}

export function filterSalesForPeriod(
  sales: Sale[],
  periodDays: number,
  now = Date.now(),
): Sale[] {
  const start = now - periodDays * 86_400_000
  return sales.filter((s) => s.createdAt >= start && s.createdAt <= now)
}

export function teamPerfTotals(rows: SalespersonPerfRow[]): {
  salesCount: number
  caNetTTC: number
  discountTTC: number
  refundTTC: number
  commissionDueTTC: number
} {
  return {
    salesCount: rows.reduce((s, r) => s + r.salesCount, 0),
    caNetTTC: rows.reduce((s, r) => s + r.caNetTTC, 0),
    discountTTC: rows.reduce((s, r) => s + r.discountTTC, 0),
    refundTTC: rows.reduce((s, r) => s + r.refundTTC, 0),
    commissionDueTTC: rows.reduce((s, r) => s + r.commissionAccruedTTC, 0),
  }
}
