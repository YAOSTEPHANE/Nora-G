const FMT = new Intl.NumberFormat('fr-CI', {
  maximumFractionDigits: 0,
})

export function formatFCFA(amount: number): string {
  return `${FMT.format(Math.round(amount))} FCFA`
}

/** Alias explicite devise Côte d’Ivoire (XOF). */
export function formatXOF(amount: number): string {
  return formatFCFA(amount)
}

/** Taux TVA par défaut si non renseigné sur la ligne (%) */
export const DEFAULT_VAT_RATE_PCT = 18

export function totalsFromLinesTTC(
  lines: { unitPriceTTC: number; qty: number; vatRatePct?: number }[],
  discountPct: number,
): { subtotalHT: number; tva: number; totalTTC: number } {
  const grossTTC = lines.reduce(
    (s, l) => s + l.unitPriceTTC * l.qty,
    0,
  )
  const factor = Math.max(0, 1 - discountPct / 100)
  const totalTTC = grossTTC * factor
  if (grossTTC <= 0) {
    return { subtotalHT: 0, tva: 0, totalTTC: 0 }
  }
  let subtotalHT = 0
  for (const l of lines) {
    const lineGross = l.unitPriceTTC * l.qty
    const lineTTC = lineGross * factor
    const ratePct = l.vatRatePct ?? DEFAULT_VAT_RATE_PCT
    const rate = ratePct / 100
    subtotalHT += lineTTC / (1 + rate)
  }
  const tva = totalTTC - subtotalHT
  return {
    subtotalHT,
    tva,
    totalTTC,
  }
}

/** Ventilation TVA / HT par taux (après remise panier), pour l’affichage ticket / panier. */
export type VatSliceByRate = {
  ratePct: number
  ht: number
  tva: number
}

export function vatSlicesFromLinesTTC(
  lines: { unitPriceTTC: number; qty: number; vatRatePct?: number }[],
  discountPct: number,
): VatSliceByRate[] {
  const factor = Math.max(0, 1 - discountPct / 100)
  const map = new Map<number, { ht: number; tva: number }>()
  for (const l of lines) {
    const lineGross = l.unitPriceTTC * l.qty
    const lineTTC = lineGross * factor
    const ratePct = l.vatRatePct ?? DEFAULT_VAT_RATE_PCT
    const r = ratePct / 100
    const ht = lineTTC / (1 + r)
    const tva = lineTTC - ht
    const prev = map.get(ratePct) ?? { ht: 0, tva: 0 }
    map.set(ratePct, { ht: prev.ht + ht, tva: prev.tva + tva })
  }
  return [...map.entries()]
    .map(([ratePct, v]) => ({ ratePct, ht: v.ht, tva: v.tva }))
    .sort((a, b) => a.ratePct - b.ratePct)
}
