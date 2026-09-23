import type { OnlineOrder, OnlineOrderPlatform } from '../../db/types'

/** Libellés canaux omnicanal (boutique, WhatsApp, marketplaces). */
export function omnichannelPlatformLabel(
  platform?: OnlineOrderPlatform | null,
): string {
  switch (platform) {
    case 'web_storefront':
      return 'Boutique en ligne'
    case 'native':
      return 'Canal direct'
    case 'whatsapp':
      return 'WhatsApp'
    case 'glovo':
      return 'Glovo'
    case 'ubereats':
      return 'Uber Eats'
    case 'jumia':
      return 'Jumia'
    case 'shopify':
      return 'Shopify'
    default:
      return 'Autre canal'
  }
}

/**
 * Click & collect = retrait en magasin.
 * Conservé en `pickup` sur le fil pour compat API / sync.
 */
export function omnichannelFulfillmentLabel(
  mode?: OnlineOrder['fulfillmentMode'] | null,
): string {
  if (mode === 'delivery') return 'Livraison'
  return 'Click & collect'
}

export function isMarketplacePlatform(
  platform?: OnlineOrderPlatform | null,
): boolean {
  return (
    platform === 'glovo' ||
    platform === 'ubereats' ||
    platform === 'jumia' ||
    platform === 'shopify'
  )
}

export function isOmnichannelInboundPlatform(
  platform?: OnlineOrderPlatform | null,
): boolean {
  return (
    platform === 'web_storefront' ||
    platform === 'whatsapp' ||
    isMarketplacePlatform(platform) ||
    platform === 'native'
  )
}
