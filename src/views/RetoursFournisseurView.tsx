import { useLiveQuery } from 'dexie-react-hooks'
import { useDomainProducts } from '../hooks/useDomainProducts'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { SupplierReturn, SupplierReturnStatus } from '../db/types'
import { formatFCFA } from '../lib/money'
import { productIsActive } from '../lib/productFilters'
import { storeStockRowId } from '../lib/storeStockId'
import { enqueueStockSync } from '../lib/sync'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconRefund } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

function nextRef(): string {
  return `RF-${Date.now().toString(36).toUpperCase()}`
}

export function RetoursFournisseurView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const suppliers =
    useLiveQuery(() => db.suppliers.toArray(), [], []) ?? []
  const { products } = useDomainProducts()
  const returns =
    useLiveQuery(
      () =>
        db.supplierReturns.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []

  const [supplierId, setSupplierId] = useState('')
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('1')
  const [cost, setCost] = useState('')
  const [reason, setReason] = useState('')

  const activeProducts = useMemo(
    () => products.filter(productIsActive),
    [products],
  )
  const sorted = useMemo(
    () => [...returns].sort((a, b) => b.createdAt - a.createdAt),
    [returns],
  )

  const create = async () => {
    if (!canManage) return
    const supplier = suppliers.find((s) => s.id === supplierId)
    const product = activeProducts.find((p) => p.id === productId)
    if (!supplier || !product) {
      toast.error('Fournisseur et article requis')
      return
    }
    const q = Math.max(1, Math.round(Number(qty) || 1))
    const unitCostTTC = Math.max(0, Math.round(Number(cost) || product.purchasePriceTTC || 0))
    const row: SupplierReturn = {
      id: crypto.randomUUID(),
      reference: nextRef(),
      storeId: activeStoreId,
      supplierId: supplier.id,
      supplierName: supplier.name,
      status: 'draft',
      lines: [
        {
          productId: product.id,
          productName: product.name,
          qty: q,
          unitCostTTC,
          reason: reason.trim() || undefined,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.supplierReturns.add(row)
    setQty('1')
    setReason('')
    toast.success('Retour créé', row.reference)
  }

  const send = async (row: SupplierReturn) => {
    if (!canManage || row.status !== 'draft') return
    await db.transaction('rw', db.supplierReturns, db.storeStocks, db.products, db.syncQueue, async () => {
      for (const line of row.lines) {
        const rid = storeStockRowId(activeStoreId, line.productId)
        const stock = await db.storeStocks.get(rid)
        const next = Math.max(0, (stock?.stock ?? 0) - line.qty)
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
      await db.supplierReturns.update(row.id, {
        status: 'sent' satisfies SupplierReturnStatus,
        updatedAt: Date.now(),
      })
    })
    toast.success('Retour envoyé', 'Stock débité')
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconRefund />}
        title="Retours fournisseurs"
        subtitle="Avoirs et retours vers les FRS"
      />
      {canManage ? (
        <FormPanel
          eyebrow="Avoir"
          title="Créer un retour fournisseur"
          description="Article, quantité, coût et motif."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Créer le retour
            </Button>
          }
        >
          <FormGrid>
            <Field label="Fournisseur">
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">—</option>
                {suppliers.filter((s) => s.active).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
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
            <Field label="Qté">
              <Input value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Field label="Coût unitaire">
              <Input value={cost} onChange={(e) => setCost(e.target.value)} />
            </Field>
            <Field label="Motif" className="sm:col-span-2">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}
      {sorted.length === 0 ? (
        <EmptyState title="Aucun retour" description="Créez un retour fournisseur." />
      ) : (
        <ul className="space-y-2">
          {sorted.map((r) => {
            const total = r.lines.reduce((m, l) => m + l.qty * l.unitCostTTC, 0)
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2"
              >
                <div>
                  <p className="text-[13px] font-semibold">
                    {r.reference} · {r.supplierName}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {r.lines.map((l) => `${l.productName}×${l.qty}`).join(', ')} ·{' '}
                    {formatFCFA(total)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={r.status === 'sent' ? 'success' : 'neutral'}>
                    {r.status}
                  </Badge>
                  {canManage && r.status === 'draft' ? (
                    <Button size="sm" onClick={() => void send(r)}>
                      Envoyer
                    </Button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
