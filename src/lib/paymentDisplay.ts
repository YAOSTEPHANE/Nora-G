import type { MobileMoneyOperator, PaymentMethod, Sale } from '../db/types'
import { CI_MOBILE_OPERATORS, ciMobileOperatorMeta } from './ciPayments'

export const MOBILE_OPERATOR_LABELS: Record<MobileMoneyOperator, string> =
  Object.fromEntries(
    CI_MOBILE_OPERATORS.map((o) => [o.id, o.label]),
  ) as Record<MobileMoneyOperator, string>

export const MOBILE_OPERATOR_ORDER: MobileMoneyOperator[] =
  CI_MOBILE_OPERATORS.map((o) => o.id)

/** Montants TTC par canal (espèces / carte / mobile) pour une vente. */
export function salePaymentAmounts(s: Sale): {
  cash: number
  card: number
  mobile: number
} {
  if (s.paymentSplit) {
    return {
      cash: s.paymentSplit.cash,
      card: s.paymentSplit.card,
      mobile: s.paymentSplit.mobile,
    }
  }
  const t = s.totalTTC
  if (s.paymentMethod === 'cash') return { cash: t, card: 0, mobile: 0 }
  if (s.paymentMethod === 'card') return { cash: 0, card: t, mobile: 0 }
  if (s.paymentMethod === 'mobile') return { cash: 0, card: 0, mobile: t }
  if (s.paymentMethod === 'credit') return { cash: 0, card: 0, mobile: 0 }
  if (s.paymentMethod === 'mixed') {
    return { cash: t, card: 0, mobile: 0 }
  }
  return { cash: 0, card: 0, mobile: 0 }
}

export function saleMobileOperator(
  s: Sale,
): MobileMoneyOperator | undefined {
  return s.paymentSplit?.mobileOperator
}

export function saleMobilePhone(s: Sale): string | undefined {
  return s.paymentSplit?.mobilePhone
}

/** Libellé court pour l’historique / tableaux. */
export function paymentMethodShortLabel(
  m: PaymentMethod,
  operator?: MobileMoneyOperator,
): string {
  if (m === 'cash') return 'Espèces'
  if (m === 'card') return 'Carte'
  if (m === 'mobile') {
    return operator ? MOBILE_OPERATOR_LABELS[operator] : 'Mobile money'
  }
  if (m === 'credit') return 'Crédit client'
  return 'Paiement mixte'
}

/** Libellé caisse / journal à partir d’une vente. */
export function salePaymentShortLabel(s: Sale): string {
  if (s.paymentMethod === 'mobile' || (s.paymentSplit?.mobile ?? 0) > 0) {
    const op = saleMobileOperator(s)
    if (s.paymentMethod === 'mixed') {
      return describeSalePayment(s)
    }
    return paymentMethodShortLabel('mobile', op)
  }
  return paymentMethodShortLabel(s.paymentMethod)
}

/** Libellé détaillé pour reçu ou récap (FCFA Côte d’Ivoire). */
export function describeSalePayment(s: Sale): string {
  const parts: string[] = []
  const amt = salePaymentAmounts(s)
  if (amt.cash > 0) parts.push(`Espèces ${formatPart(amt.cash)} FCFA`)
  if (amt.card > 0) parts.push(`Carte ${formatPart(amt.card)} FCFA`)
  if (amt.mobile > 0) {
    const op = saleMobileOperator(s)
    const opL = op ? MOBILE_OPERATOR_LABELS[op] : 'Mobile money'
    parts.push(`${opL} ${formatPart(amt.mobile)} FCFA`)
  }
  if (s.paymentMethod === 'credit') {
    parts.push(`Crédit client ${formatPart(s.totalTTC)} FCFA`)
  }
  if (parts.length === 0) return paymentMethodShortLabel(s.paymentMethod)
  return parts.join(' · ')
}

/** Ligne mobile money pour reçu (opérateur + montant). */
export function mobileMoneyLineLabel(s: Sale): string {
  const op = saleMobileOperator(s)
  if (!op) return 'Mobile money'
  return ciMobileOperatorMeta(op).label
}

function formatPart(n: number): string {
  return new Intl.NumberFormat('fr-CI', {
    maximumFractionDigits: 0,
  }).format(Math.round(n))
}
