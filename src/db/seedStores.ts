import type { Store } from './types'

export const DEFAULT_STORE_ID = 'store-main'

/** Second magasin de test (multi-magasins). */
export const TEST_STORE_ANNEX_ID = 'store-test-annex'

/** Entrepôt central du réseau. */
export const CENTRAL_WAREHOUSE_ID = 'store-warehouse'

/** Magasins de structure (+ annexe + entrepôt). */
export const SEED_STORES: Store[] = [
  {
    id: CENTRAL_WAREHOUSE_ID,
    name: 'Entrepôt central',
    shortCode: 'EC',
    sortOrder: 0,
    kind: 'warehouse',
  },
  {
    id: DEFAULT_STORE_ID,
    name: 'Boutique principale',
    shortCode: 'BP',
    sortOrder: 1,
    kind: 'store',
  },
  {
    id: TEST_STORE_ANNEX_ID,
    name: 'Boutique Annexe Plateau',
    shortCode: 'AP',
    sortOrder: 2,
    kind: 'store',
  },
]

export function isWarehouseStore(store: Pick<Store, 'kind'> | undefined): boolean {
  return store?.kind === 'warehouse'
}

export function storeKindLabel(store: Pick<Store, 'kind'> | undefined): string {
  return isWarehouseStore(store) ? 'Entrepôt' : 'Boutique'
}
