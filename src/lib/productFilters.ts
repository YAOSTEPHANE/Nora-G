import type { Product } from '../db/types'
import type { BusinessDomain } from './businessDomain'
import { productBelongsToDomain } from './domainCatalog'

/** Produit vendable à la caisse (non archivé). */
export function productIsActive(p: Product): boolean {
  return p.archived !== true
}

/** Actif et rattaché à l’activité métier courante. */
export function productIsActiveInDomain(
  p: Product,
  domain: BusinessDomain,
): boolean {
  return productIsActive(p) && productBelongsToDomain(p, domain)
}
