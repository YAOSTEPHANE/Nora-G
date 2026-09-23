import { describe, expect, it } from 'vitest'
import { buildFecCsv, buildFneExport } from './ciExport'
import type { Sale } from '../../db/types'

const sampleSale: Sale = {
  id: 'sale-1',
  createdAt: new Date('2026-08-01T10:00:00').getTime(),
  lines: [
    {
      productId: 'p1',
      name: 'Eau 1.5L',
      unitPriceTTC: 500,
      qty: 2,
      vatRatePct: 18,
    },
  ],
  subtotalHT: 847,
  tva: 153,
  totalTTC: 1000,
  discountPct: 0,
  paymentMethod: 'cash',
  synced: true,
}

describe('buildFneExport', () => {
  it('produit un document FNE-CI-v1', () => {
    const doc = buildFneExport({
      sales: [sampleSale],
      fromYmd: '2026-08-01',
      toYmd: '2026-08-31',
      issuerName: 'Boutique Test',
      nif: '1234567890',
    })
    expect(doc.format).toBe('FNE-CI-v1')
    expect(doc.invoices).toHaveLength(1)
    expect(doc.invoices[0]?.totalTTC).toBe(1000)
  })

  it('réutilise le numéro FNE déjà émis à la vente', () => {
    const withFne: Sale = {
      ...sampleSale,
      fne: {
        invoiceNumber: 'FNE-20260801-00099',
        issuedAt: sampleSale.createdAt,
        nif: '1234567890',
        regime: 'REEL',
        status: 'issued',
      },
    }
    const doc = buildFneExport({
      sales: [withFne],
      fromYmd: '2026-08-01',
      toYmd: '2026-08-31',
      issuerName: 'Boutique Test',
      nif: '1234567890',
    })
    expect(doc.invoices[0]?.invoiceNumber).toBe('FNE-20260801-00099')
  })
})

describe('buildFecCsv', () => {
  it('contient les colonnes FEC', () => {
    const csv = buildFecCsv({
      sales: [sampleSale],
      fromYmd: '2026-08-01',
      toYmd: '2026-08-31',
    })
    expect(csv).toContain('JournalCode')
    expect(csv).toContain('707')
  })
})
