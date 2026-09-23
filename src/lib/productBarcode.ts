import { db } from '../db/db'
import type { Product } from '../db/types'
import { getAppSettings } from './appSettings'
import { productBelongsToDomain } from './domainCatalog'

/** Recherche un produit par code-barres non vide. */
export async function findProductByBarcode(
  barcode: string,
): Promise<Product | undefined> {
  const code = barcode.trim()
  if (!code) return undefined
  return db.products.where('barcode').equals(code).first()
}

/**
 * Recherche un code-barres dans l’activité courante (prioritaire),
 * pour éviter de retrouver un article d’un autre métier.
 */
export async function findProductByBarcodeInDomain(
  barcode: string,
  domain = getAppSettings().businessDomain,
): Promise<Product | undefined> {
  const code = barcode.trim()
  if (!code) return undefined
  const matches = await db.products.where('barcode').equals(code).toArray()
  return (
    matches.find((p) => productBelongsToDomain(p, domain)) ??
    undefined
  )
}

/**
 * Les codes-barres vides sont autorisés (plusieurs articles sans code).
 * Seuls les codes non vides doivent être uniques **au sein de l’activité**.
 */
export async function assertBarcodeAvailable(
  barcode: string,
  exceptProductId?: string,
  domain = getAppSettings().businessDomain,
): Promise<void> {
  const code = barcode.trim()
  if (!code) return
  const matches = await db.products.where('barcode').equals(code).toArray()
  const dup = matches.find(
    (p) => productBelongsToDomain(p, domain) && p.id !== exceptProductId,
  )
  if (dup) {
    throw new Error('Ce code-barres existe déjà pour cette activité.')
  }
}
