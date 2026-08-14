import type { MobileMoneyOperator, PaymentMethod, Sale } from '../db/types'

export const MOBILE_OPERATOR_LABELS: Record<MobileMoneyOperator, string> = {
  orange: 'Orange Money',
  mtn: 'MTN MoMo',
  wave: 'Wave',
}

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

/** Libellé court pour l’historique / tableaux. */
export function paymentMethodShortLabel(m: PaymentMethod): string {
  if (m === 'cash') return 'Espèces'
  if (m === 'card') return 'Carte'
  if (m === 'mobile') return 'Mobile money'
  if (m === 'credit') return 'Crédit client'
  return 'Paiement mixte'
}

/** Libellé détaillé pour reçu ou récap. */
export function describeSalePayment(s: Sale): string {
  const parts: string[] = []
  const amt = salePaymentAmounts(s)
  if (amt.cash > 0) parts.push(`Espèces ${formatPart(amt.cash)}`)
  if (amt.card > 0) parts.push(`Carte ${formatPart(amt.card)}`)
  if (amt.mobile > 0) {
    const op = saleMobileOperator(s)
    const opL = op ? MOBILE_OPERATOR_LABELS[op] : 'Mobile money'
    parts.push(`${opL} ${formatPart(amt.mobile)}`)
  }
  if (s.paymentMethod === 'credit') {
    parts.push(`Crédit client ${formatPart(s.totalTTC)}`)
  }
  if (parts.length === 0) return paymentMethodShortLabel(s.paymentMethod)
  return parts.join(' · ')
}

function formatPart(n: number): string {
  return new Intl.NumberFormat('fr-CI', {
    maximumFractionDigits: 0,
  }).format(Math.round(n))
}
