import { describe, expect, it } from 'vitest'
import type { OnlineOrder } from '../../db/types'
import {
  applyOmnichannelReservations,
  isStockReservingOrder,
  reservedQtyByProduct,
  sellableStock,
} from './stock'
import {
  omnichannelFulfillmentLabel,
  omnichannelPlatformLabel,
} from './channels'

const baseOrder = (patch: Partial<OnlineOrder>): OnlineOrder => ({
  id: 'o1',
  createdAt: Date.now(),
  storeId: 'store-a',
  customerName: 'Awa',
  paymentMethod: 'mobile',
  lines: [
    {
      productId: 'p1',
      name: 'Shampoing',
      unitPriceTTC: 2000,
      qty: 2,
      vatRatePct: 18,
    },
  ],
  subtotalHT: 3389,
  tva: 611,
  totalTTC: 4000,
  status: 'pending',
  sourcePlatform: 'whatsapp',
  fulfillmentMode: 'pickup',
  ...patch,
})

describe('omnichannel stock', () => {
  it('calcule le stock vendable = physique − réservé', () => {
    expect(sellableStock(10, 3)).toBe(7)
    expect(sellableStock(2, 5)).toBe(0)
  })

  it('agrège les réservations des commandes pending non déduites', () => {
    const map = reservedQtyByProduct(
      [
        baseOrder({ id: 'a' }),
        baseOrder({
          id: 'b',
          lines: [
            {
              productId: 'p1',
              name: 'Shampoing',
              unitPriceTTC: 2000,
              qty: 1,
              vatRatePct: 18,
            },
          ],
        }),
        baseOrder({ id: 'c', status: 'approved', stockDeductedAt: Date.now() }),
        baseOrder({ id: 'd', storeId: 'other' }),
      ],
      'store-a',
    )
    expect(map.get('p1')).toBe(3)
  })

  it('applique les réservations aux produits affichés', () => {
    const products = applyOmnichannelReservations(
      [{ id: 'p1', stock: 10 } as never],
      new Map([['p1', 4]]),
    )
    expect(products[0]?.stock).toBe(6)
  })

  it('reconnaît une commande réservante', () => {
    expect(isStockReservingOrder(baseOrder({}))).toBe(true)
    expect(
      isStockReservingOrder(
        baseOrder({ status: 'approved', stockDeductedAt: 1 }),
      ),
    ).toBe(false)
  })
})

describe('omnichannel channels', () => {
  it('libellé click & collect pour le retrait', () => {
    expect(omnichannelFulfillmentLabel('pickup')).toBe('Click & collect')
    expect(omnichannelFulfillmentLabel('delivery')).toBe('Livraison')
  })

  it('libellés plateformes', () => {
    expect(omnichannelPlatformLabel('web_storefront')).toBe('Boutique en ligne')
    expect(omnichannelPlatformLabel('whatsapp')).toBe('WhatsApp')
    expect(omnichannelPlatformLabel('glovo')).toBe('Glovo')
  })
})
