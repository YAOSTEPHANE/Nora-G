import { useLiveQuery } from 'dexie-react-hooks'
import { useDomainProducts } from '../hooks/useDomainProducts'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { ProductionOrder } from '../db/types'
import { productIsActive } from '../lib/productFilters'
import { saleLocalYmd } from '../lib/salesStats'
import { storeStockRowId } from '../lib/storeStockId'
import { enqueueStockSync } from '../lib/sync'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconLayers } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

export function ProductionView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const { products } = useDomainProducts()
  const orders =
    useLiveQuery(
      () =>
        db.productionOrders.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('10')
  const [plannedFor, setPlannedFor] = useState(() => saleLocalYmd(Date.now()))

  const activeProducts = useMemo(
    () => products.filter(productIsActive),
    [products],
  )
  const open = orders.filter(
    (o) => o.status === 'planned' || o.status === 'in_progress',
  )

  const create = async () => {
    if (!canManage) return
    const product = activeProducts.find((p) => p.id === productId)
    if (!product) {
      toast.error('Choisissez un article')
      return
    }
    const qtyPlanned = Math.max(1, Math.round(Number(qty) || 1))
    const row: ProductionOrder = {
      id: crypto.randomUUID(),
      reference: `PRD-${Date.now().toString(36).toUpperCase()}`,
      storeId: activeStoreId,
      status: 'planned',
      lines: [
        {
          productId: product.id,
          productName: product.name,
          qtyPlanned,
          qtyProduced: 0,
        },
      ],
      plannedFor,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.productionOrders.add(row)
    toast.success('Ordre créé', row.reference)
  }

  const complete = async (row: ProductionOrder) => {
    if (!canManage || row.status === 'done') return
    await db.transaction(
      'rw',
      db.productionOrders,
      db.storeStocks,
      db.products,
      db.syncQueue,
      async () => {
        for (const line of row.lines) {
          const rid = storeStockRowId(activeStoreId, line.productId)
          const stock = await db.storeStocks.get(rid)
          const next = (stock?.stock ?? 0) + line.qtyPlanned
          await db.storeStocks.put({
            id: rid,
            storeId: activeStoreId,
            productId: line.productId,
            stock: next,
          })
          const product = await db.products.get(line.productId)
          await enqueueStockSync({
            productId: line.productId,
            stock: next,
            lowStockThreshold: product?.lowStockThreshold ?? 5,
            storeId: activeStoreId,
          })
        }
        await db.productionOrders.update(row.id, {
          status: 'done',
          completedAt: Date.now(),
          updatedAt: Date.now(),
          lines: row.lines.map((l) => ({
            ...l,
            qtyProduced: l.qtyPlanned,
          })),
        })
      },
    )
    toast.success('Production terminée', 'Stock augmenté')
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconLayers />}
        title="Production"
        subtitle="Fournées / ordres de fabrication"
      />
      <Kpi label="Ordres ouverts" value={String(open.length)} tone="amber" />
      {canManage ? (
        <FormPanel
          eyebrow="Fournée"
          title="Planifier une production"
          description="Article, quantité et date de fabrication."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Planifier
            </Button>
          }
        >
          <FormGrid columns={3}>
            <Field label="Article">
              <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">—</option>
                {activeProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quantité">
              <Input value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Field label="Pour le">
              <Input
                type="date"
                value={plannedFor}
                onChange={(e) => setPlannedFor(e.target.value)}
              />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}
      {orders.length === 0 ? (
        <EmptyState title="Aucune production" description="Planifiez une fournée." />
      ) : (
        <ul className="space-y-2">
          {[...orders].sort((a, b) => b.createdAt - a.createdAt).map((o) => (
            <li
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2"
            >
              <div>
                <p className="text-[13px] font-semibold">
                  {o.reference} · {o.plannedFor}
                </p>
                <p className="text-[11px] text-ink-muted">
                  {o.lines
                    .map((l) => `${l.productName} ×${l.qtyPlanned}`)
                    .join(', ')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={o.status === 'done' ? 'success' : 'warning'}>
                  {o.status}
                </Badge>
                {canManage && o.status !== 'done' && o.status !== 'cancelled' ? (
                  <Button size="sm" onClick={() => void complete(o)}>
                    Terminer (+ stock)
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
