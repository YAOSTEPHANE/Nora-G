import { useLiveQuery } from 'dexie-react-hooks'
/* Provider et hooks sont volontairement co-localisés. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { db } from '../db/db'
import type { ProductWithStock, Store } from '../db/types'
import { DEFAULT_STORE_ID, isWarehouseStore } from '../db/seedStores'
import {
  APP_SETTINGS_CHANGED_EVENT,
  getAppSettings,
} from '../lib/appSettings'
import type { BusinessDomain } from '../lib/businessDomain'
import { productBelongsToDomain } from '../lib/domainCatalog'
import { productIsActive } from '../lib/productFilters'
import {
  applyOmnichannelReservations,
  reservedQtyByProduct,
} from '../lib/omnichannel/stock'

const STORAGE_KEY = 'nora-active-store-id'

function readStoredStoreId(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && v.length > 0 ? v : null
  } catch {
    return null
  }
}

function writeStoredStoreId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

type Ctx = {
  stores: Store[]
  activeStoreId: string
  setActiveStoreId: (id: string) => void
  canSwitchStore: boolean
  /** Produits actifs avec stock du magasin sélectionné. */
  displayProducts: ProductWithStock[]
  activeStore: Store | undefined
}

const ActiveStoreContext = createContext<Ctx | null>(null)

type ProviderProps = {
  children: ReactNode
  /** Droit de changer de magasin actif (liste déroulante). */
  canSwitchStore: boolean
}

export function ActiveStoreProvider({
  children,
  canSwitchStore,
}: ProviderProps) {
  const allStores =
    useLiveQuery(() => db.stores.orderBy('sortOrder').toArray(), [], []) ?? []
  const stores = useMemo(
    () =>
      allStores.filter(
        (store) => !store.archived && !isWarehouseStore(store),
      ),
    [allStores],
  )
  const products =
    useLiveQuery(() => db.products.toArray(), [], []) ?? []

  const [businessDomain, setBusinessDomain] = useState<BusinessDomain>(
    () => getAppSettings().businessDomain,
  )

  useEffect(() => {
    const sync = () => setBusinessDomain(getAppSettings().businessDomain)
    window.addEventListener(APP_SETTINGS_CHANGED_EVENT, sync)
    return () => window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, sync)
  }, [])

  const [requestedStoreId, setActiveStoreIdState] = useState(() => {
    const s = readStoredStoreId()
    return s ?? DEFAULT_STORE_ID
  })
  const activeStoreId =
    stores.length > 0 && !stores.some((store) => store.id === requestedStoreId)
      ? (stores[0]?.id ?? DEFAULT_STORE_ID)
      : requestedStoreId

  const stockRows =
    useLiveQuery(
      () => db.storeStocks.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []

  const stockByProduct = useMemo(
    () => new Map(stockRows.map((r) => [r.productId, r.stock])),
    [stockRows],
  )

  const pendingOrders =
    useLiveQuery(
      () => db.onlineOrders.where('status').equals('pending').toArray(),
      [],
      [],
    ) ?? []

  const reservedByProduct = useMemo(
    () => reservedQtyByProduct(pendingOrders, activeStoreId),
    [pendingOrders, activeStoreId],
  )

  const displayProducts = useMemo((): ProductWithStock[] => {
    const withPhysical = products
      .filter(productIsActive)
      .filter((p) => productBelongsToDomain(p, businessDomain))
      .map((p) => ({
        ...p,
        stock: stockByProduct.get(p.id) ?? 0,
      }))
    return applyOmnichannelReservations(withPhysical, reservedByProduct)
  }, [products, stockByProduct, businessDomain, reservedByProduct])

  const setActiveStoreId = useCallback((id: string) => {
    setActiveStoreIdState(id)
    writeStoredStoreId(id)
  }, [])

  useEffect(() => {
    if (activeStoreId !== requestedStoreId) {
      writeStoredStoreId(activeStoreId)
    }
  }, [activeStoreId, requestedStoreId])

  const activeStore = stores.find((s) => s.id === activeStoreId)

  const value = useMemo(
    (): Ctx => ({
      stores,
      activeStoreId,
      setActiveStoreId,
      canSwitchStore,
      displayProducts,
      activeStore,
    }),
    [
      stores,
      activeStoreId,
      setActiveStoreId,
      canSwitchStore,
      displayProducts,
      activeStore,
    ],
  )

  return (
    <ActiveStoreContext.Provider value={value}>
      {children}
    </ActiveStoreContext.Provider>
  )
}

export function useActiveStore(): Ctx {
  const c = useContext(ActiveStoreContext)
  if (!c) {
    throw new Error('useActiveStore hors ActiveStoreProvider')
  }
  return c
}

/** Pour écrans lecture seule sans jeter si provider manque (tests). */
export function useActiveStoreOptional(): Ctx | null {
  return useContext(ActiveStoreContext)
}
