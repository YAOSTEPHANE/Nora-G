/** Identifiant stock variante = magasin + variante. */
export function variantStoreStockRowId(
  storeId: string,
  variantId: string,
): string {
  return `${storeId}_${variantId}`
}
