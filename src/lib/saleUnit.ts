import type { Product, SaleUnit } from '../db/types'
import { SALE_UNIT_OPTIONS } from '../db/types'

export function saleUnitOf(product: Pick<Product, 'saleUnit'> | undefined): SaleUnit {
  return product?.saleUnit ?? 'piece'
}

export function saleUnitLabel(unit: SaleUnit): string {
  return SALE_UNIT_OPTIONS.find((o) => o.id === unit)?.label ?? 'Pièce'
}

export function saleUnitShort(unit: SaleUnit): string {
  return SALE_UNIT_OPTIONS.find((o) => o.id === unit)?.short ?? 'pce'
}

/** Pas d’incrément caisse selon l’unité / le mode fractionnaire. */
export function qtyStepForProduct(
  product: Pick<Product, 'saleUnit' | 'allowFractionalQty' | 'trackSerialNumbers'> | undefined,
): number {
  if (!product || product.trackSerialNumbers) return 1
  if (!product.allowFractionalQty) return 1
  const unit = saleUnitOf(product)
  switch (unit) {
    case 'm':
      return 0.5
    case 'kg':
    case 'l':
      return 0.1
    case 'piece':
    case 'pack':
    case 'box':
    case 'set':
      return 0.5
    default: {
      const _exhaustive: never = unit
      return _exhaustive
    }
  }
}

export function roundQty(qty: number, step: number): number {
  if (step >= 1) return Math.round(qty)
  const decimals = step <= 0.1 ? 1 : 1
  const factor = 10 ** decimals
  return Math.round(qty * factor) / factor
}

export function formatQty(qty: number, unit?: SaleUnit): string {
  const u = unit ?? 'piece'
  const short = saleUnitShort(u)
  const n =
    Number.isInteger(qty) || Math.abs(qty - Math.round(qty)) < 1e-9
      ? String(Math.round(qty))
      : qty.toFixed(1).replace(/\.0$/, '')
  return `${n} ${short}`
}

export function formatPricePerUnit(
  priceTTC: number,
  unit: SaleUnit,
  formatMoney: (n: number) => string,
): string {
  if (unit === 'piece') return formatMoney(priceTTC)
  return `${formatMoney(priceTTC)} / ${saleUnitShort(unit)}`
}

export function packHint(
  product: Pick<Product, 'packContentQty' | 'packContentLabel' | 'saleUnit'>,
): string | null {
  if (product.packContentQty == null || product.packContentQty <= 0) return null
  const label = product.packContentLabel?.trim() || 'unités'
  const pack = saleUnitShort(saleUnitOf(product))
  return `${product.packContentQty} ${label} / ${pack}`
}
