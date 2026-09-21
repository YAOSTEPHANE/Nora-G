import type { AuditEvent, AuditEventKind, Sale } from '../db/types'
import { formatFCFA } from './money'
import { saleDiscountTTC } from './salespersonStats'

export type InternalControlCategory =
  | 'all'
  | 'remises'
  | 'annulations'
  | 'retours'
  | 'prix'
  | 'stock'
  | 'vendeuses'

export const INTERNAL_CONTROL_CATEGORY_LABELS: Record<
  InternalControlCategory,
  string
> = {
  all: 'Tout',
  remises: 'Remises',
  annulations: 'Annulations',
  retours: 'Retours',
  prix: 'Prix',
  stock: 'Stock',
  vendeuses: 'Vendeuses',
}

export const AUDIT_KIND_LABELS: Record<AuditEventKind, string> = {
  cart_cancelled: 'Annulation panier',
  sale_refund: 'Remboursement',
  sale_void: 'Annulation vente',
  sale_exchange: 'Échange',
  promo_applied: 'Code promo',
  discount_override: 'Remise gérant',
  stock_adjusted: 'Modification stock',
  stock_transfer: 'Transfert stock',
  product_deleted: 'Suppression produit',
  time_punch: 'Pointage',
  ticket_invoice_updated: 'Ticket/Facture modifié',
  day_closure: 'Clôture journalière',
  day_reopen: 'Réouverture journalière',
  price_changed: 'Modification de prix',
  customer_return: 'Retour client',
  shrinkage: 'Perte / casse',
}

const CATEGORY_KINDS: Record<
  Exclude<InternalControlCategory, 'all' | 'vendeuses'>,
  AuditEventKind[]
> = {
  remises: ['discount_override', 'promo_applied'],
  annulations: ['cart_cancelled', 'sale_void'],
  retours: ['sale_refund', 'sale_exchange', 'customer_return'],
  prix: ['price_changed'],
  stock: ['stock_adjusted', 'stock_transfer', 'shrinkage'],
}

export function auditKindLabel(kind: AuditEventKind): string {
  return AUDIT_KIND_LABELS[kind]
}

export function auditCategoryForKind(
  kind: AuditEventKind,
): Exclude<InternalControlCategory, 'all' | 'vendeuses'> | 'other' {
  for (const [cat, kinds] of Object.entries(CATEGORY_KINDS) as [
    Exclude<InternalControlCategory, 'all' | 'vendeuses'>,
    AuditEventKind[],
  ][]) {
    if (kinds.includes(kind)) return cat
  }
  return 'other'
}

export function filterAuditEvents(params: {
  events: AuditEvent[]
  category: InternalControlCategory
  actorId?: string | 'all'
  query?: string
  sinceMs?: number
  untilMs?: number
}): AuditEvent[] {
  const q = params.query?.trim().toLowerCase() ?? ''
  return params.events.filter((ev) => {
    if (params.sinceMs != null && ev.createdAt < params.sinceMs) return false
    if (params.untilMs != null && ev.createdAt > params.untilMs) return false
    if (params.actorId && params.actorId !== 'all') {
      if (ev.actorProfileId !== params.actorId) return false
    }
    if (params.category === 'vendeuses') {
      // Toutes actions d’un acteur (filtre acteur optionnel)
    } else if (params.category !== 'all') {
      const kinds = CATEGORY_KINDS[params.category]
      if (!kinds.includes(ev.kind)) return false
    }
    if (!q) return true
    const hay = [
      AUDIT_KIND_LABELS[ev.kind],
      ev.actorDisplayName,
      ev.reason,
      ev.relatedSaleId ?? '',
      ev.payloadJson,
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export type InternalControlTotals = {
  total: number
  remises: number
  annulations: number
  retours: number
  prix: number
  stock: number
  byActor: { actorId: string; displayName: string; count: number }[]
}

export function summarizeAuditEvents(events: AuditEvent[]): InternalControlTotals {
  const byActorMap = new Map<string, { displayName: string; count: number }>()
  let remises = 0
  let annulations = 0
  let retours = 0
  let prix = 0
  let stock = 0
  for (const ev of events) {
    const cat = auditCategoryForKind(ev.kind)
    if (cat === 'remises') remises += 1
    else if (cat === 'annulations') annulations += 1
    else if (cat === 'retours') retours += 1
    else if (cat === 'prix') prix += 1
    else if (cat === 'stock') stock += 1
    const prev = byActorMap.get(ev.actorProfileId)
    if (prev) prev.count += 1
    else
      byActorMap.set(ev.actorProfileId, {
        displayName: ev.actorDisplayName,
        count: 1,
      })
  }
  const byActor = [...byActorMap.entries()]
    .map(([actorId, v]) => ({
      actorId,
      displayName: v.displayName,
      count: v.count,
    }))
    .sort((a, b) => b.count - a.count)
  return {
    total: events.length,
    remises,
    annulations,
    retours,
    prix,
    stock,
    byActor,
  }
}

export function auditPayloadSummary(ev: AuditEvent): string | null {
  try {
    const o = JSON.parse(ev.payloadJson) as Record<string, unknown>
    switch (ev.kind) {
      case 'promo_applied': {
        const code = o.code
        const applied = o.appliedPct
        const prev = o.previousPct
        return typeof code === 'string'
          ? `${code} → ${String(applied)} % (avant ${String(prev)} %)`
          : null
      }
      case 'discount_override': {
        const applied = o.appliedPct
        const manager = o.managerDisplayName
        return typeof applied === 'number'
          ? `${applied} % · ${String(manager ?? 'gérant')}`
          : null
      }
      case 'sale_void':
      case 'sale_exchange':
      case 'sale_refund': {
        const amount = o.amountTTC ?? o.returnedAmountTTC
        return typeof amount === 'number' ? formatFCFA(amount) : null
      }
      case 'stock_adjusted': {
        const pq = o.previousQty
        const nq = o.newQty
        if (typeof pq === 'number' && typeof nq === 'number') {
          return `${pq} → ${nq} unité(s)`
        }
        return null
      }
      case 'stock_transfer': {
        const q = o.qty
        const fn = o.fromStoreName
        const tn = o.toStoreName
        return typeof q === 'number'
          ? `${q} u. · ${String(fn ?? '?')} → ${String(tn ?? '?')}`
          : null
      }
      case 'cart_cancelled': {
        const lines = o.lines as unknown[] | undefined
        return Array.isArray(lines) ? `${lines.length} ligne(s)` : null
      }
      case 'price_changed': {
        const name = o.productName
        const before = o.previousPriceTTC
        const after = o.newPriceTTC
        if (typeof before === 'number' && typeof after === 'number') {
          return `${String(name ?? 'Article')} · ${formatFCFA(before)} → ${formatFCFA(after)}`
        }
        return typeof name === 'string' ? name : null
      }
      case 'customer_return': {
        const ref = o.reference
        const amount = o.amountTTC
        const product = o.productName
        const bits = [
          typeof ref === 'string' ? ref : null,
          typeof product === 'string' ? product : null,
          typeof amount === 'number' ? formatFCFA(amount) : null,
        ].filter(Boolean)
        return bits.length ? bits.join(' · ') : null
      }
      case 'shrinkage': {
        const kind = o.kind
        const product = o.productName
        const amount = o.amountTTC
        return [
          typeof kind === 'string' ? kind : null,
          typeof product === 'string' ? product : null,
          typeof amount === 'number' ? formatFCFA(amount) : null,
        ]
          .filter(Boolean)
          .join(' · ') || null
      }
      case 'time_punch': {
        const kind =
          o.kind === 'in' ? 'Arrivée' : o.kind === 'out' ? 'Départ' : null
        const store = o.storeName ?? o.storeId
        return [kind, typeof store === 'string' ? store : null]
          .filter(Boolean)
          .join(' · ') || null
      }
      case 'ticket_invoice_updated': {
        const ref = o.reference
        return typeof ref === 'string' ? ref : null
      }
      case 'product_deleted': {
        const name = o.name ?? o.productName
        return typeof name === 'string' ? name : null
      }
      case 'day_closure':
      case 'day_reopen': {
        const ymd = o.dateYmd
        return typeof ymd === 'string' ? ymd : null
      }
      default:
        return null
    }
  } catch {
    return null
  }
}

/** Ventes avec remise (hors promo audit) pour compléter la traçabilité. */
export function salesWithDiscountTrace(sales: Sale[]): {
  id: string
  createdAt: number
  actorDisplayName: string
  actorProfileId: string
  discountPct: number
  discountTTC: number
  totalTTC: number
  promoCode?: string
}[] {
  return sales
    .filter(
      (s) =>
        (s.discountPct ?? 0) > 0 ||
        (s.loyaltyDiscountTTC ?? 0) > 0 ||
        Boolean(s.promoCode),
    )
    .map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      actorDisplayName: s.cashierDisplayName?.trim() || 'Non attribué',
      actorProfileId: s.cashierProfileId ?? `name:${s.cashierDisplayName ?? '?'}`,
      discountPct: s.discountPct ?? 0,
      discountTTC: saleDiscountTTC(s),
      totalTTC: s.totalTTC,
      promoCode: s.promoCode,
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function categoryTone(
  cat: ReturnType<typeof auditCategoryForKind>,
): 'neutral' | 'warning' | 'danger' | 'info' | 'accent' | 'success' {
  switch (cat) {
    case 'remises':
      return 'warning'
    case 'annulations':
      return 'danger'
    case 'retours':
      return 'info'
    case 'prix':
      return 'accent'
    case 'stock':
      return 'success'
    default:
      return 'neutral'
  }
}
