import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../db/db'
import type { Product } from '../db/types'
import {
  APP_SETTINGS_CHANGED_EVENT,
  getAppSettings,
} from '../lib/appSettings'
import type { BusinessDomain } from '../lib/businessDomain'
import { filterProductsForDomain } from '../lib/domainCatalog'
import { productIsActive } from '../lib/productFilters'

/** Catalogue réactif filtré sur l’activité métier courante. */
export function useDomainProducts(options?: { activeOnly?: boolean }): {
  domain: BusinessDomain
  products: Product[]
  allProducts: Product[]
} {
  const [domain, setDomain] = useState<BusinessDomain>(
    () => getAppSettings().businessDomain,
  )
  useEffect(() => {
    const sync = () => setDomain(getAppSettings().businessDomain)
    window.addEventListener(APP_SETTINGS_CHANGED_EVENT, sync)
    return () => window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, sync)
  }, [])

  const allProducts = useLiveQuery(() => db.products.toArray(), [], []) ?? []
  const products = useMemo(() => {
    const scoped = filterProductsForDomain(allProducts, domain)
    return options?.activeOnly ? scoped.filter(productIsActive) : scoped
  }, [allProducts, domain, options?.activeOnly])

  return { domain, products, allProducts }
}
