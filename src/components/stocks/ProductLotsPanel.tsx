import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../../db/db'
import type { Product, ProductLot } from '../../db/types'
import { useDomainProducts } from '../../hooks/useDomainProducts'
import {
  lotExpiryStatus,
  productLotRowId,
  syncStoreStockFromTracking,
} from '../../lib/productTracking'
import { enqueueStockSync } from '../../lib/sync'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { FormGrid, FormPanel } from '../../ui/Form'
import { EmptyState } from '../../ui/EmptyState'
import { Field, Input, Select } from '../../ui/Input'
import { Tabs } from '../../ui/Tabs'
import { useToast } from '../../ui/Toast'

type Props = {
  storeId: string
  storeLabel: string
}

type LotFilter = 'all' | 'soon' | 'expired'

async function pushStockSync(storeId: string, productId: string) {
  const product = await db.products.get(productId)
  if (!product) return
  const stockRow = await db.storeStocks
    .where('[storeId+productId]')
    .equals([storeId, productId])
    .first()
  await enqueueStockSync({
    productId,
    stock: stockRow?.stock ?? 0,
    lowStockThreshold: product.lowStockThreshold,
    storeId,
  })
}

export function ProductLotsPanel({ storeId, storeLabel }: Props) {
  const toast = useToast()
  const { products: domainProducts } = useDomainProducts({ activeOnly: true })
  const products = useMemo(
    () => domainProducts.filter((p) => !!p.trackLots),
    [domainProducts],
  )
  const lots =
    useLiveQuery(
      () => db.productLots.where('storeId').equals(storeId).toArray(),
      [storeId],
      [],
    ) ?? []

  const [productId, setProductId] = useState('')
  const [lotNumber, setLotNumber] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [qty, setQty] = useState('1')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<LotFilter>('all')
  const [busy, setBusy] = useState(false)

  const productName = (id: string) =>
    products.find((p) => p.id === id)?.name ?? '—'

  const expiredCount = lots.filter(
    (l) => l.qty > 0 && lotExpiryStatus(l.expiryDate) === 'expired',
  ).length
  const soonCount = lots.filter(
    (l) => l.qty > 0 && lotExpiryStatus(l.expiryDate) === 'soon',
  ).length

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...lots]
      .filter((lot) => {
        const st = lotExpiryStatus(lot.expiryDate)
        if (filter === 'expired' && st !== 'expired') return false
        if (filter === 'soon' && st !== 'soon') return false
        if (!q) return true
        return (
          lot.lotNumber.toLowerCase().includes(q) ||
          productName(lot.productId).toLowerCase().includes(q)
        )
      })
      .sort((a, b) => {
        const da = a.expiryDate.localeCompare(b.expiryDate)
        if (da !== 0) return da
        return a.lotNumber.localeCompare(b.lotNumber)
      })
  }, [lots, search, filter, products])

  const handleReceive = async () => {
    const pid = productId.trim()
    const num = lotNumber.trim()
    const exp = expiryDate.trim()
    const q = Number.parseInt(qty.replace(/\s/g, ''), 10)
    if (!pid) return toast.error('Article requis', 'Choisissez un produit.')
    if (!num) return toast.error('Lot requis', 'Indiquez le n° de lot.')
    if (!exp) return toast.error('DLC requise', 'Indiquez la date de péremption.')
    if (!Number.isFinite(q) || q <= 0) {
      return toast.error('Quantité invalide', 'Saisissez une quantité positive.')
    }

    setBusy(true)
    try {
      const id = productLotRowId(storeId, pid, num)
      const existing = await db.productLots.get(id)
      const nextQty = (existing?.qty ?? 0) + q
      const row: ProductLot = {
        id,
        productId: pid,
        storeId,
        lotNumber: num,
        expiryDate: exp,
        qty: nextQty,
        receivedAt: Date.now(),
      }
      await db.productLots.put(row)
      await syncStoreStockFromTracking(storeId, pid)
      await pushStockSync(storeId, pid)
      toast.success('Lot enregistré', `${num} · ${q} unité(s)`)
      setLotNumber('')
      setQty('1')
    } catch (e) {
      toast.error(
        'Échec',
        e instanceof Error ? e.message : 'Enregistrement impossible.',
      )
    } finally {
      setBusy(false)
    }
  }

  const adjustLot = async (lot: ProductLot, delta: number) => {
    const next = lot.qty + delta
    if (next < 0) return
    await db.productLots.update(lot.id, { qty: next })
    await syncStoreStockFromTracking(storeId, lot.productId)
    await pushStockSync(storeId, lot.productId)
    toast.info('Lot mis à jour', `${lot.lotNumber} → ${next}`)
  }

  const removeLot = async (lot: ProductLot) => {
    if (lot.qty > 0) {
      return toast.error(
        'Lot non vide',
        'Passez la quantité à 0 avant de supprimer, ou utilisez Péremptions.',
      )
    }
    await db.productLots.delete(lot.id)
    await syncStoreStockFromTracking(storeId, lot.productId)
    await pushStockSync(storeId, lot.productId)
    toast.info('Lot supprimé', lot.lotNumber)
  }

  if (products.length === 0) {
    return (
      <EmptyState
        title="Aucun article suivi par lots"
        description="Activez « Suivi par lots (DLC) » sur la fiche article du catalogue."
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-ink-muted">
        Magasin : <strong className="text-ink">{storeLabel}</strong> — réception
        FEFO (premier périmé, premier sorti) à la caisse.
      </p>

      <FormPanel
        eyebrow="Réception"
        title="Entrer un lot"
        description="Article, numéro de lot, DLC et quantité."
        actions={
          <Button variant="accent" loading={busy} onClick={() => void handleReceive()}>
            Enregistrer
          </Button>
        }
      >
        <FormGrid columns={4}>
          <Field label="Article" required>
            <Select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">— Choisir —</option>
              {products.map((p: Product) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="N° lot" required>
            <Input
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              className="font-mono-nums"
            />
          </Field>
          <Field label="DLC" required>
            <Input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </Field>
          <Field label="Quantité" required>
            <Input
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="font-mono-nums"
            />
          </Field>
        </FormGrid>
      </FormPanel>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          variant="segmented"
          active={filter}
          onChange={setFilter}
          items={[
            { id: 'all', label: 'Tous', count: lots.length },
            { id: 'soon', label: 'Bientôt', count: soonCount || undefined },
            { id: 'expired', label: 'Périmés', count: expiredCount || undefined },
          ]}
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Lot ou article…"
          className="sm:max-w-xs"
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="Aucun lot"
          description="Réceptionnez un lot ou changez le filtre."
          variant="flat"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-border bg-surface-sunken text-[11px] uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-2">Article</th>
                <th className="px-3 py-2">Lot</th>
                <th className="px-3 py-2">DLC</th>
                <th className="px-3 py-2">Qté</th>
                <th className="px-3 py-2">État</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((lot) => {
                const st = lotExpiryStatus(lot.expiryDate)
                return (
                  <tr key={lot.id} className="border-b border-border/60">
                    <td className="px-3 py-2">{productName(lot.productId)}</td>
                    <td className="px-3 py-2 font-mono-nums">{lot.lotNumber}</td>
                    <td className="px-3 py-2 font-mono-nums">{lot.expiryDate}</td>
                    <td className="px-3 py-2 font-mono-nums">{lot.qty}</td>
                    <td className="px-3 py-2">
                      <Badge
                        tone={
                          st === 'expired'
                            ? 'danger'
                            : st === 'soon'
                              ? 'warning'
                              : 'success'
                        }
                      >
                        {st === 'expired'
                          ? 'Périmé'
                          : st === 'soon'
                            ? 'Bientôt'
                            : 'OK'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void adjustLot(lot, -1)}
                          disabled={lot.qty <= 0}
                        >
                          −
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void adjustLot(lot, 1)}
                        >
                          +
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void removeLot(lot)}
                          disabled={lot.qty > 0}
                        >
                          Suppr.
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
