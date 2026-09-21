import type {
  MobileMoneyOperator,
  PaymentMethod,
  SalePaymentSplit,
} from '../db/types'
import { normalizeCiPhone } from './ciPayments'
import { formatFCFA } from './money'
import { MOBILE_OPERATOR_LABELS } from './paymentDisplay'

export type CheckoutPaymentState = {
  mixed: boolean
  /** Mode simple uniquement (pas `mixed`). */
  method: Exclude<PaymentMethod, 'mixed'>
  splitCash: string
  splitCard: string
  splitMobile: string
  mobileOperator: MobileMoneyOperator
  /** Numéro client (Orange / Wave / MTN / Moov). */
  mobilePhone: string
  cashReceived: string
  cardRef: string
  mobileRef: string
}

export function defaultCheckoutPayment(): CheckoutPaymentState {
  return {
    mixed: false,
    method: 'cash',
    splitCash: '',
    splitCard: '',
    splitMobile: '',
    mobileOperator: 'orange',
    mobilePhone: '',
    cashReceived: '',
    cardRef: '',
    mobileRef: '',
  }
}

function parseFcfaInt(raw: string): number | null {
  const n = Number.parseInt(raw.replace(/\s/g, ''), 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export type CheckoutValidation =
  | {
      ok: true
      split: SalePaymentSplit
      cashReceived?: number
      changeDue?: number
      cardTpeReference?: string
      mobileMoneyReference?: string
    }
  | { ok: false; message: string }

function parseSplitPart(raw: string): number | null {
  const t = raw.trim()
  if (t === '') return 0
  const n = Number.parseInt(t.replace(/\s/g, ''), 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function resolveMobilePhone(
  state: CheckoutPaymentState,
  requirePhone: boolean,
): { ok: true; phone?: string } | { ok: false; message: string } {
  const raw = state.mobilePhone.trim()
  if (!raw) {
    if (requirePhone) {
      return {
        ok: false,
        message:
          'Indiquez le numéro client (+225…) pour Orange Money, Wave, MTN MoMo ou Moov Money.',
      }
    }
    return { ok: true }
  }
  const phone = normalizeCiPhone(raw)
  if (!phone) {
    return {
      ok: false,
      message: 'Numéro invalide. Exemple : 07 XX XX XX XX ou +225XXXXXXXXX.',
    }
  }
  return { ok: true, phone }
}

function buildMobileRef(
  state: CheckoutPaymentState,
  phone?: string,
): string {
  if (state.mobileRef.trim()) return state.mobileRef.trim()
  const op = state.mobileOperator.toUpperCase()
  const suffix = Date.now().toString(36).slice(-8).toUpperCase()
  return phone ? `${op}-${phone}-${suffix}` : `${op}-${suffix}`
}

/**
 * Valide la saisie caisse avant encaissement.
 * `totalTTC` doit être l’entier FCFA attendu (déjà arrondi).
 */
export function validateCheckoutPayment(
  state: CheckoutPaymentState,
  totalTTC: number,
  online: boolean,
): CheckoutValidation {
  const total = Math.round(totalTTC)

  if (state.mixed) {
    const c = parseSplitPart(state.splitCash)
    const cd = parseSplitPart(state.splitCard)
    const m = parseSplitPart(state.splitMobile)
    if (c === null || cd === null || m === null) {
      return { ok: false, message: 'Montants du paiement mixte invalides.' }
    }
    if (!online && (cd > 0 || m > 0)) {
      return {
        ok: false,
        message:
          'Hors ligne : un paiement mixte ne peut comporter que des espèces.',
      }
    }
    if (c + cd + m !== total) {
      return {
        ok: false,
        message: `La somme des parts (${formatFCFA(c + cd + m)}) doit égaler le total (${formatFCFA(total)}).`,
      }
    }
    if (m > 0 && !state.mobileOperator) {
      return { ok: false, message: 'Choisissez un opérateur mobile money.' }
    }
    const phoneCheck = resolveMobilePhone(state, false)
    if (!phoneCheck.ok) return phoneCheck
    let cashReceived: number | undefined
    let changeDue: number | undefined
    if (c > 0) {
      const rec = parseFcfaInt(state.cashReceived)
      if (rec === null) {
        return {
          ok: false,
          message: 'Indiquez le montant reçu en espèces (part espèces du mixte).',
        }
      }
      if (rec < c) {
        return {
          ok: false,
          message: `Montant reçu insuffisant pour la part espèces (${formatFCFA(c)}).`,
        }
      }
      cashReceived = rec
      changeDue = rec - c
    }
    const cardTpeReference =
      cd > 0
        ? state.cardRef.trim() ||
          `TPE-${Date.now().toString(36).toUpperCase().slice(-10)}`
        : undefined
    const mobileMoneyReference =
      m > 0 ? buildMobileRef(state, phoneCheck.phone) : undefined
    return {
      ok: true,
      split: {
        cash: c,
        card: cd,
        mobile: m,
        mobileOperator: m > 0 ? state.mobileOperator : undefined,
        mobilePhone: m > 0 ? phoneCheck.phone : undefined,
      },
      cashReceived,
      changeDue,
      cardTpeReference,
      mobileMoneyReference,
    }
  }

  // Paiement simple
  if (!online && state.method !== 'cash' && state.method !== 'credit') {
    return {
      ok: false,
      message:
        'Hors ligne : encaissement en espèces ou crédit client uniquement. Carte et mobile nécessitent le réseau.',
    }
  }

  if (state.method === 'cash') {
    const rec = parseFcfaInt(state.cashReceived)
    if (rec === null) {
      return {
        ok: false,
        message: 'Indiquez le montant reçu en espèces pour calculer la monnaie.',
      }
    }
    if (rec < total) {
      return {
        ok: false,
        message: `Montant reçu insuffisant (total ${formatFCFA(total)}).`,
      }
    }
    return {
      ok: true,
      split: { cash: total, card: 0, mobile: 0 },
      cashReceived: rec,
      changeDue: rec - total,
    }
  }

  if (state.method === 'card') {
    return {
      ok: true,
      split: { cash: 0, card: total, mobile: 0 },
      cardTpeReference:
        state.cardRef.trim() ||
        `TPE-${Date.now().toString(36).toUpperCase().slice(-10)}`,
    }
  }

  if (state.method === 'credit') {
    return {
      ok: true,
      split: { cash: 0, card: 0, mobile: 0 },
    }
  }

  const phoneCheck = resolveMobilePhone(state, false)
  if (!phoneCheck.ok) return phoneCheck

  return {
    ok: true,
    split: {
      cash: 0,
      card: 0,
      mobile: total,
      mobileOperator: state.mobileOperator,
      mobilePhone: phoneCheck.phone,
    },
    mobileMoneyReference: buildMobileRef(state, phoneCheck.phone),
  }
}

export function confirmCheckoutSummary(
  state: CheckoutPaymentState,
  v: Extract<CheckoutValidation, { ok: true }>,
  totalTTC: number,
): string {
  const total = Math.round(totalTTC)
  const lines: string[] = [
    `Total à encaisser : ${formatFCFA(total)}`,
    '',
  ]
  if (state.mixed) {
    lines.push('Paiement mixte :')
    if (v.split.cash > 0) lines.push(`· Espèces : ${formatFCFA(v.split.cash)}`)
    if (v.split.card > 0) lines.push(`· Carte (TPE) : ${formatFCFA(v.split.card)}`)
    if (v.split.mobile > 0) {
      lines.push(
        `· ${MOBILE_OPERATOR_LABELS[state.mobileOperator]} : ${formatFCFA(v.split.mobile)}`,
      )
    }
    if (v.cashReceived != null && v.changeDue != null) {
      lines.push(
        '',
        `Reçu : ${formatFCFA(v.cashReceived)} · Monnaie : ${formatFCFA(v.changeDue)}`,
      )
    }
    if (v.cardTpeReference) lines.push(`Réf. TPE : ${v.cardTpeReference}`)
    if (v.mobileMoneyReference)
      lines.push(`Réf. mobile : ${v.mobileMoneyReference}`)
    if (v.split.mobilePhone)
      lines.push(`Tél. client : ${v.split.mobilePhone}`)
  } else if (state.method === 'cash' && v.changeDue != null) {
    lines.push(
      `Espèces — Reçu : ${formatFCFA(v.cashReceived!)} · Monnaie : ${formatFCFA(v.changeDue)}`,
    )
  } else if (state.method === 'card') {
    lines.push(`Carte bancaire (TPE intégré)`)
    if (v.cardTpeReference) lines.push(`Réf. : ${v.cardTpeReference}`)
  } else if (state.method === 'credit') {
    lines.push(`Crédit client — ${formatFCFA(total)}`)
  } else {
    lines.push(
      `${MOBILE_OPERATOR_LABELS[state.mobileOperator]} — ${formatFCFA(total)}`,
    )
    if (v.split.mobilePhone) lines.push(`Tél. : ${v.split.mobilePhone}`)
    if (v.mobileMoneyReference)
      lines.push(`Réf. : ${v.mobileMoneyReference}`)
  }
  lines.push('', 'Valider et imprimer le reçu ?')
  return lines.join('\n')
}
