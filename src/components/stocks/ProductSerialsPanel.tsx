import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../../db/db'
import type { Product, ProductSerialUnit, SerialUnitStatus } from '../../db/types'
import {
  syncStoreStockFromTracking,
  warrantyStatus,
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

type SerialFilter = 'all' | 'in_stock' | 'sold' | 'returned' | 'warranty'

function statusLabel(s: SerialUnitStatus): string {
  switch (s) {
    case 'in_stock':
      return 'En stock'
    case 'sold':
      return 'Vendu'
    case 'reserved':
      return 'Réservé'
    case 'returned':
      return 'Retour'
    case 'warranty':
      return 'SAV / garantie'
    default: {
      const _e: never = s
      return _e
    }
  }
}

function statusTone(
  s: SerialUnitStatus,
): 'accent' | 'neutral' | 'warning' | 'success' | 'info' {
  switch (s) {
    case 'in_stock':
      return 'accent'
    case 'sold':
      return 'neutral'
    case 'reserved':
      return 'warning'
    case 'returned':
      return 'success'
    case 'warranty':
      return 'info'
    default: {
      const _e: never = s
      return _e
    }
  }
}

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

export function ProductSerialsPanel({ storeId, storeLabel }: Props) {
  const toast = useToast()
  const products =
    useLiveQuery(
      () => db.products.filter((p) => !!p.trackSerialNumbers).toArray(),
      [],
      [],
    ) ?? []
  const units =
    useLiveQuery(
      () => db.productSerialUnits.where('storeId').equals(storeId).toArray(),
      [storeId],
      [],
    ) ?? []

  const [productId, setProductId] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [imei, setImei] = useState('')
  const [warrantyUntil, setWarrantyUntil] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<SerialFilter>('all')
  const [busy, setBusy] = useState(false)

  const inStockCount = units.filter((u) => u.status === 'in_stock').length

  const productName = (id: string) =>
    products.find((p) => p.id === id)?.name ?? '—'

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return units.filter((u) => {
      if (filter !== 'all' && u.status !== filter) return false
      if (!q) return true
      return (
        u.serialNumber.toLowerCase().includes(q) ||
        (u.imei?.toLowerCase().includes(q) ?? false) ||
        productName(u.productId).toLowerCase().includes(q)
      )
    })
  }, [units, search, filter, products])

  const handleRegister = async () => {
    const pid = productId.trim()
    const serial = serialNumber.trim()
    if (!pid) return toast.error('Article requis', 'Choisissez un produit.')
    if (!serial) {
      return toast.error('Série requise', 'Indiquez le n° de série.')
    }

    const dup = await db.productSerialUnits
      .where('[storeId+serialNumber]')
      .equals([storeId, serial])
      .first()
    if (dup) {
      return toast.error('Doublon', 'Ce n° de série existe déjà sur ce magasin.')
    }

    setBusy(true)
    try {
      const row: ProductSerialUnit = {
        id: crypto.randomUUID(),
        productId: pid,
        storeId,
        serialNumber: serial,
        imei: imei.trim() || undefined,
        warrantyUntil: warrantyUntil.trim() || undefined,
        status: 'in_stock',
      }
      await db.productSerialUnits.add(row)
      await syncStoreStockFromTracking(storeId, pid)
      await pushStockSync(storeId, pid)
      toast.success('Unité enregistrée', serial)
      setSerialNumber('')
      setImei('')
      setWarrantyUntil('')
    } catch (e) {
      toast.error(
        'Échec',
        e instanceof Error ? e.message : 'Enregistrement impossible.',
      )
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (unit: ProductSerialUnit, status: SerialUnitStatus) => {
    await db.productSerialUnits.update(unit.id, {
      status,
      soldAt: status === 'sold' ? Date.now() : undefined,
    })
    await syncStoreStockFromTracking(storeId, unit.productId)
    await pushStockSync(storeId, unit.productId)
    toast.info('Statut mis à jour', `${unit.serialNumber} · ${statusLabel(status)}`)
  }

  const removeUnit = async (unit: ProductSerialUnit) => {
    if (unit.status === 'sold') {
      return toast.error('Unité vendue', 'Impossible de supprimer une série déjà vendue.')
    }
    await db.productSerialUnits.delete(unit.id)
    await syncStoreStockFromTracking(storeId, unit.productId)
    await pushStockSync(storeId, unit.productId)
    toast.info('Unité supprimée', unit.serialNumber)
  }

  if (products.length === 0) {
    return (
      <EmptyState
        title="Aucun article suivi par n° de série"
        description="Activez « Suivi n° série / IMEI » sur la fiche article du catalogue."
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-ink-muted">
        Magasin : <strong className="text-ink">{storeLabel}</strong> — une unité
        = un n° de série (IMEI et garantie optionnels).
      </p>

      <FormPanel
        eyebrow="Réception"
        title="Enregistrer une unité"
        description="Numéro de série, IMEI et garantie optionnelle."
        actions={
          <Button variant="accent" loading={busy} onClick={() => void handleRegister()}>
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
          <Field label="N° série" required>
            <Input
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              className="font-mono-nums"
            />
          </Field>
          <Field label="IMEI" hint="optionnel">
            <Input
              value={imei}
              onChange={(e) => setImei(e.target.value)}
              className="font-mono-nums"
            />
          </Field>
          <Field label="Garantie jusqu’au">
            <Input
              type="date"
              value={warrantyUntil}
              onChange={(e) => setWarrantyUntil(e.target.value)}
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
            { id: 'all', label: 'Tous', count: units.length },
            { id: 'in_stock', label: 'En stock', count: inStockCount || undefined },
            { id: 'sold', label: 'Vendus' },
            { id: 'returned', label: 'Retours' },
            { id: 'warranty', label: 'SAV' },
          ]}
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Série, IMEI ou article…"
          className="font-mono-nums sm:max-w-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Aucune unité"
          description="Réceptionnez une série ou changez le filtre."
          variant="flat"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-surface-sunken text-[11px] uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-2">Article</th>
                <th className="px-3 py-2">N° série</th>
                <th className="px-3 py-2">IMEI</th>
                <th className="px-3 py-2">Garantie</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((unit) => {
                const w = warrantyStatus(unit.warrantyUntil)
                return (
                  <tr key={unit.id} className="border-b border-border/60">
                    <td className="px-3 py-2">{productName(unit.productId)}</td>
                    <td className="px-3 py-2 font-mono-nums">{unit.serialNumber}</td>
                    <td className="px-3 py-2 font-mono-nums text-ink-muted">
                      {unit.imei ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      {unit.warrantyUntil ? (
                        <span className="font-mono-nums text-xs">
                          {unit.warrantyUntil}
                          {w === 'active' ? (
                            <Badge tone="accent" className="ml-1">
                              Active
                            </Badge>
                          ) : w === 'expired' ? (
                            <Badge tone="danger" className="ml-1">
                              Expirée
                            </Badge>
                          ) : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={statusTone(unit.status)}>
                        {statusLabel(unit.status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {unit.status === 'in_stock' ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void setStatus(unit, 'warranty')}
                            >
                              SAV
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void removeUnit(unit)}
                            >
                              Suppr.
                            </Button>
                          </>
                        ) : null}
                        {unit.status === 'sold' ||
                        unit.status === 'warranty' ||
                        unit.status === 'returned' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void setStatus(unit, 'in_stock')}
                          >
                            Remettre en stock
                          </Button>
                        ) : null}
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
