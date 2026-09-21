import type { MobileMoneyOperator } from '../db/types'

export type CiMobileOperatorMeta = {
  id: MobileMoneyOperator
  label: string
  shortLabel: string
  /** Préfixes locaux CI (ex. 07 Orange). */
  prefixes: string[]
  /** Couleur d’accent UI (hex). */
  accent: string
  /** Code canal CinetPay CI (si agrégé). */
  cinetpayCode: string
}

/** Canaux mobile money Côte d’Ivoire (caisse + boutique). */
export const CI_MOBILE_OPERATORS: CiMobileOperatorMeta[] = [
  {
    id: 'orange',
    label: 'Orange Money',
    shortLabel: 'OM',
    prefixes: ['07'],
    accent: '#ff7900',
    cinetpayCode: 'ORANGE_MONEY',
  },
  {
    id: 'wave',
    label: 'Wave',
    shortLabel: 'Wave',
    prefixes: ['05', '01'],
    accent: '#1dc8ff',
    cinetpayCode: 'WAVE',
  },
  {
    id: 'mtn',
    label: 'MTN MoMo',
    shortLabel: 'MTN',
    prefixes: ['05'],
    accent: '#ffcc00',
    cinetpayCode: 'MTN',
  },
  {
    id: 'moov',
    label: 'Moov Money',
    shortLabel: 'Moov',
    prefixes: ['01'],
    accent: '#0066b3',
    cinetpayCode: 'MOOV',
  },
]

export const CI_MOBILE_OPERATOR_IDS = CI_MOBILE_OPERATORS.map((o) => o.id)

export function ciMobileOperatorMeta(
  id: MobileMoneyOperator,
): CiMobileOperatorMeta {
  return (
    CI_MOBILE_OPERATORS.find((o) => o.id === id) ?? CI_MOBILE_OPERATORS[0]!
  )
}

/** Normalise un numéro ivoirien vers +225XXXXXXXXX */
export function normalizeCiPhone(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('225') && digits.length === 12) {
    return `+${digits}`
  }
  if (digits.length === 10 && digits.startsWith('0')) {
    return `+225${digits.slice(1)}`
  }
  if (digits.length === 9) {
    return `+225${digits}`
  }
  return null
}

export function formatCiPhoneDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, '')
  const local = digits.startsWith('225') ? digits.slice(3) : digits
  if (local.length === 10) {
    return `+225 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 8)} ${local.slice(8)}`
  }
  if (local.length === 9) {
    return `+225 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7)}`
  }
  return e164
}

/** Devise d’affichage caisse Côte d’Ivoire. */
export const CI_CURRENCY = {
  code: 'XOF',
  label: 'FCFA',
  locale: 'fr-CI',
} as const
