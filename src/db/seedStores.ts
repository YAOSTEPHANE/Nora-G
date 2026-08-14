import type { Store } from './types'

export const DEFAULT_STORE_ID = 'store-main'

/** Second magasin de test (multi-magasins). */
export const TEST_STORE_ANNEX_ID = 'store-test-annex'

/** Magasins de structure (+ annexe de test). */
export const SEED_STORES: Store[] = [
  {
    id: DEFAULT_STORE_ID,
    name: 'Magasin principal',
    shortCode: 'MP',
    sortOrder: 0,
  },
  {
    id: TEST_STORE_ANNEX_ID,
    name: 'Annexe Plateau',
    shortCode: 'AP',
    sortOrder: 1,
  },
]
