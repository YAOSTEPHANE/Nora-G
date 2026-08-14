import { describe, expect, it } from 'vitest'
import {
  computeDeliveryFeeTTC,
  DEFAULT_STOREFRONT_DELIVERY_FEE_TTC,
  DEFAULT_STOREFRONT_FREE_DELIVERY_THRESHOLD_TTC,
  normalizeStorefrontBranding,
  resolveStorefrontDeliveryFeeTTC,
  resolveStorefrontFreeDeliveryThresholdTTC,
  storefrontAccentColor,
  storefrontDisplayName,
  storefrontMapsHref,
  storefrontTelHref,
  storefrontWhatsAppHref,
  orderStorefrontCategories,
  type PublishedStorefrontMenu,
  type StorefrontBranding,
} from './types'

/** Mirror serveur : republication catalogue conserve le branding existant. */
function mergePublishMenu(
  existing: PublishedStorefrontMenu | null,
  next: Omit<PublishedStorefrontMenu, 'branding'>,
): PublishedStorefrontMenu {
  const branding = existing?.branding
  return {
    ...next,
    ...(branding ? { branding } : {}),
  }
}

describe('normalizeStorefrontBranding', () => {
  it('accepte un branding valide', () => {
    expect(
      normalizeStorefrontBranding({
        shopName: '  Ma Boutique  ',
        primaryColor: '#1A2B3C',
        welcomeMessage: 'Bonjour',
      }),
    ).toEqual({
      shopName: 'Ma Boutique',
      primaryColor: '#1A2B3C',
      welcomeMessage: 'Bonjour',
    })
  })

  it('rejette une couleur invalide', () => {
    expect(
      normalizeStorefrontBranding({ primaryColor: 'red' }),
    ).toBeUndefined()
  })

  it('conserve une data URL logo longue (pas de troncature à 2k)', () => {
    const payload = 'A'.repeat(12_000)
    const logoUrl = `data:image/png;base64,${payload}`
    expect(
      normalizeStorefrontBranding({ logoUrl })?.logoUrl,
    ).toBe(logoUrl)
  })

  it('accepte une URL https courte', () => {
    expect(
      normalizeStorefrontBranding({
        logoUrl: 'https://example.com/logo.png',
      })?.logoUrl,
    ).toBe('https://example.com/logo.png')
  })

  it('normalise contact et pied de page', () => {
    expect(
      normalizeStorefrontBranding({
        phone: '  +225 07 00 00 00 00  ',
        whatsapp: '0700112233',
        email: '  contact@shop.ci ',
        address: ' Plateau, Abidjan ',
        mapsUrl: 'https://maps.google.com/?q=Plateau',
        openingHours: 'Lun–Ven 8h–20h',
        footerTagline: 'Commandez en ligne',
        legalMentions: 'RCCM CI-ABJ-123',
      }),
    ).toEqual({
      phone: '+225 07 00 00 00 00',
      whatsapp: '0700112233',
      email: 'contact@shop.ci',
      address: 'Plateau, Abidjan',
      mapsUrl: 'https://maps.google.com/?q=Plateau',
      openingHours: 'Lun–Ven 8h–20h',
      footerTagline: 'Commandez en ligne',
      legalMentions: 'RCCM CI-ABJ-123',
    })
  })

  it('rejette une mapsUrl non http(s)', () => {
    expect(
      normalizeStorefrontBranding({ mapsUrl: 'javascript:alert(1)' }),
    ).toBeUndefined()
  })

  it('normalise les tarifs de livraison', () => {
    expect(
      normalizeStorefrontBranding({
        deliveryFeeTTC: 2500,
        freeDeliveryThresholdTTC: '20000',
      }),
    ).toEqual({
      deliveryFeeTTC: 2500,
      freeDeliveryThresholdTTC: 20_000,
    })
  })

  it('rejette un frais de livraison hors plage', () => {
    expect(
      normalizeStorefrontBranding({ deliveryFeeTTC: -1 }),
    ).toBeUndefined()
  })

  it('normalise les zones de livraison', () => {
    expect(
      normalizeStorefrontBranding({
        deliveryZones: [
          { id: ' z1 ', name: ' Cocody ', feeTTC: '1500' },
          { id: '', name: 'Ignoré', feeTTC: 1000 },
        ],
      }),
    ).toEqual({
      deliveryZones: [{ id: 'z1', name: 'Cocody', feeTTC: 1500 }],
    })
  })
})

describe('computeDeliveryFeeTTC', () => {
  it('retourne 0 en retrait', () => {
    expect(
      computeDeliveryFeeTTC({
        fulfillmentMode: 'pickup',
        cartTTC: 50_000,
        feeTTC: 1000,
        freeThresholdTTC: 15_000,
      }),
    ).toBe(0)
  })

  it('applique le frais hors seuil', () => {
    expect(
      computeDeliveryFeeTTC({
        fulfillmentMode: 'delivery',
        cartTTC: 5_000,
        feeTTC: 1500,
        freeThresholdTTC: 15_000,
      }),
    ).toBe(1500)
  })

  it('offre la livraison au seuil', () => {
    expect(
      computeDeliveryFeeTTC({
        fulfillmentMode: 'delivery',
        cartTTC: 15_000,
        feeTTC: 1500,
        freeThresholdTTC: 15_000,
      }),
    ).toBe(0)
  })

  it('n’offre jamais si seuil = 0', () => {
    expect(
      computeDeliveryFeeTTC({
        fulfillmentMode: 'delivery',
        cartTTC: 100_000,
        feeTTC: 2000,
        freeThresholdTTC: 0,
      }),
    ).toBe(2000)
  })

  it('utilise les défauts branding absents', () => {
    expect(resolveStorefrontDeliveryFeeTTC(undefined)).toBe(
      DEFAULT_STOREFRONT_DELIVERY_FEE_TTC,
    )
    expect(resolveStorefrontFreeDeliveryThresholdTTC(undefined)).toBe(
      DEFAULT_STOREFRONT_FREE_DELIVERY_THRESHOLD_TTC,
    )
  })

  it('prend le tarif de la zone sélectionnée', () => {
    const branding: StorefrontBranding = {
      deliveryFeeTTC: 1000,
      deliveryZones: [
        { id: 'a', name: 'Cocody', feeTTC: 2000 },
        { id: 'b', name: 'Plateau', feeTTC: 1500 },
      ],
    }
    expect(resolveStorefrontDeliveryFeeTTC(branding, 'b')).toBe(1500)
    expect(resolveStorefrontDeliveryFeeTTC(branding, null)).toBe(0)
  })
})

describe('orderStorefrontCategories', () => {
  it('respecte l’ordre préféré puis complète en alpha', () => {
    expect(
      orderStorefrontCategories(
        [
          { category: 'Desserts' },
          { category: 'Boissons' },
          { category: 'Plats' },
          { category: '' },
        ],
        ['Plats', 'Boissons', 'Inconnu'],
      ),
    ).toEqual(['Plats', 'Boissons', 'Autres', 'Desserts'])
  })
})

describe('storefront contact href helpers', () => {
  it('construit tel et wa.me', () => {
    expect(storefrontTelHref('+225 07 00 00 00 00')).toBe('tel:+2250700000000')
    expect(storefrontWhatsAppHref(undefined, '+225 07 11 22 33 44')).toBe(
      'https://wa.me/2250711223344',
    )
    expect(
      storefrontMapsHref(undefined, 'Cocody, Abidjan'),
    ).toBe('https://maps.google.com/?q=Cocody%2C%20Abidjan')
  })
})

describe('storefrontDisplayName / accent', () => {
  it('préfère shopName', () => {
    const branding: StorefrontBranding = { shopName: 'Chez Awa' }
    expect(storefrontDisplayName(branding, 'Org Légale')).toBe('Chez Awa')
    expect(storefrontDisplayName(undefined, 'Org Légale')).toBe('Org Légale')
  })

  it('fallback bleu marque', () => {
    expect(storefrontAccentColor(undefined)).toBe('#0033AA')
    expect(storefrontAccentColor({ primaryColor: '#FF5500' })).toBe('#FF5500')
  })
})

describe('publish merge branding', () => {
  it('conserve le branding lors d’une republication catalogue', () => {
    const existing: PublishedStorefrontMenu = {
      storeId: 's1',
      storeName: 'Ancien',
      publishedAt: '2020-01-01T00:00:00.000Z',
      products: [],
      promotions: [],
      branding: {
        shopName: 'Vitrine',
        primaryColor: '#112233',
        logoUrl: 'https://example.com/logo.png',
      },
    }
    const published = mergePublishMenu(existing, {
      storeId: 's1',
      storeName: 'Nouveau catalogue',
      publishedAt: '2026-08-05T00:00:00.000Z',
      products: [],
      promotions: [],
    })
    expect(published.storeName).toBe('Nouveau catalogue')
    expect(published.branding).toEqual(existing.branding)
  })
})
