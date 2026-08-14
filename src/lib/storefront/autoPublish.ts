import { db } from '../../db/db'
import type { ProductWithStock, Promotion } from '../../db/types'
import { productIsActive } from '../productFilters'
import { getOrganizationCredentials } from '../subscription/store'
import { publishStorefrontMenu } from './api'
import { orderStorefrontCategories } from './types'

const LAST_FINGERPRINT_KEY = 'nora-storefront-publish-fingerprint'
const LAST_PUBLISHED_AT_KEY = 'nora-storefront-published-at'

export type StorefrontPublishResult = {
  productCount: number
  publishedAt: string
  skipped: boolean
}

function fingerprintPayload(input: {
  storeId: string
  storeName: string
  products: ProductWithStock[]
  promotions: Promotion[]
  categories?: string[]
}): string {
  const products = input.products
    .map((p) =>
      [
        p.id,
        p.name,
        p.priceTTC,
        p.category,
        p.vatRatePct,
        p.stock,
        p.archived ? 1 : 0,
        p.imageUrl ?? '',
        p.imageDataUrl ? '1' : '0',
        p.barcode ?? '',
        p.description?.trim() ?? '',
        Array.isArray(p.highlights) ? p.highlights.join('|') : '',
      ].join(':'),
    )
    .sort()
  const promotions = input.promotions
    .map((p) =>
      [
        p.id,
        p.code,
        p.discountPct,
        p.active ? 1 : 0,
        p.startAt ?? '',
        p.endAt ?? '',
        p.minCartTTC ?? '',
        p.maxUsage ?? '',
        p.usageCount,
        p.storeId ?? '',
      ].join(':'),
    )
    .sort()
  return JSON.stringify({
    storeId: input.storeId,
    storeName: input.storeName,
    categories: input.categories ?? [],
    products,
    promotions,
  })
}

export function getLastStorefrontPublishedAt(): string | null {
  try {
    return localStorage.getItem(LAST_PUBLISHED_AT_KEY)
  } catch {
    return null
  }
}

function readLastFingerprint(): string | null {
  try {
    return localStorage.getItem(LAST_FINGERPRINT_KEY)
  } catch {
    return null
  }
}

function writePublishMeta(fingerprint: string, publishedAt: string): void {
  try {
    localStorage.setItem(LAST_FINGERPRINT_KEY, fingerprint)
    localStorage.setItem(LAST_PUBLISHED_AT_KEY, publishedAt)
  } catch {
    /* ignore */
  }
}

export async function buildActiveStorefrontMenu(storeId: string): Promise<{
  storeId: string
  storeName: string
  products: ProductWithStock[]
  promotions: Promotion[]
  categories: string[]
} | null> {
  const store = await db.stores.get(storeId)
  const products = await db.products.toArray()
  const stockRows = await db.storeStocks.where('storeId').equals(storeId).toArray()
  const stockByProduct = new Map(stockRows.map((row) => [row.productId, row.stock]))
  const displayProducts: ProductWithStock[] = products
    .filter(productIsActive)
    .map((product) => ({
      ...product,
      stock: stockByProduct.get(product.id) ?? 0,
    }))
  const promotions = await db.promotions
    .filter(
      (promotion) =>
        promotion.storeId == null || promotion.storeId === storeId,
    )
    .toArray()
  const categoryRows = await db.productCategories.orderBy('sortOrder').toArray()
  const categories = orderStorefrontCategories(
    displayProducts,
    categoryRows.map((row) => row.name),
  )

  const credentials = getOrganizationCredentials()
  return {
    storeId,
    storeName: store?.name ?? credentials?.name ?? 'Boutique',
    products: displayProducts,
    promotions,
    categories,
  }
}

export async function publishActiveStorefrontMenu(options: {
  licenseKey: string
  storeId: string
  force?: boolean
}): Promise<StorefrontPublishResult> {
  const menu = await buildActiveStorefrontMenu(options.storeId)
  if (!menu) {
    throw new Error('Impossible de préparer le menu boutique.')
  }

  const fingerprint = fingerprintPayload(menu)
  if (!options.force && fingerprint === readLastFingerprint()) {
    return {
      productCount: menu.products.length,
      publishedAt: getLastStorefrontPublishedAt() ?? new Date().toISOString(),
      skipped: true,
    }
  }

  const result = await publishStorefrontMenu(options.licenseKey, menu)
  writePublishMeta(fingerprint, result.publishedAt)
  return {
    productCount: result.productCount,
    publishedAt: result.publishedAt,
    skipped: false,
  }
}
