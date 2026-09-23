import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sale } from '../../db/types'
import {
  buildFneInvoiceNumber,
  fneLinesFromSale,
  issueFneForSale,
} from './fneInvoice'

const sampleSale: Sale = {
  id: 'sale-fne-1',
  createdAt: new Date('2026-09-22T10:00:00').getTime(),
  lines: [
    {
      productId: 'p1',
      name: 'Crème hydratante',
      unitPriceTTC: 4500,
      qty: 1,
      vatRatePct: 18,
    },
  ],
  subtotalHT: 3814,
  tva: 686,
  totalTTC: 4500,
  discountPct: 0,
  paymentMethod: 'cash',
  synced: false,
}

vi.mock('../../db/db', () => ({
  db: {
    sales: {
      where: () => ({
        between: () => ({
          toArray: async () => [] as Sale[],
        }),
      }),
    },
  },
}))

describe('fneLinesFromSale', () => {
  it('dérive HT/TVA/TTC des lignes de vente sans re-saisie', () => {
    const lines = fneLinesFromSale(sampleSale)
    expect(lines).toHaveLength(1)
    expect(lines[0]?.designation).toBe('Crème hydratante')
    expect(lines[0]?.lineTTC).toBe(4500)
    expect(lines[0]?.lineHT + lines[0]!.lineTVA).toBe(4500)
  })
})

describe('buildFneInvoiceNumber', () => {
  it('formate FNE-YYYYMMDD-XXXXX', () => {
    expect(buildFneInvoiceNumber('2026-09-22', 7)).toBe('FNE-20260922-00007')
  })
})

describe('issueFneForSale', () => {
  beforeEach(() => {
    try {
      localStorage.clear()
    } catch {
      /* node test env */
    }
  })

  it('n’attache rien si FNE désactivée', async () => {
    const out = await issueFneForSale(sampleSale, {
      enabled: false,
      nif: '123',
      regime: 'REEL',
    })
    expect(out.fne).toBeUndefined()
  })

  it('génère un numéro stable à l’encaissement', async () => {
    const out = await issueFneForSale(sampleSale, {
      enabled: true,
      nif: 'CI-NIF-9',
      regime: 'REEL',
    })
    expect(out.fne?.status).toBe('issued')
    expect(out.fne?.invoiceNumber).toMatch(/^FNE-20260922-\d{5}$/)
    expect(out.fne?.nif).toBe('CI-NIF-9')
  })
})
