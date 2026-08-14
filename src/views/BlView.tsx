import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { DeliveryNote } from '../db/types'
import { formatFCFA } from '../lib/money'
import { productIsActive } from '../lib/productFilters'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconArchive } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

export function BlView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const products =
    useLiveQuery(() => db.products.toArray(), [], []) ?? []
  const notes =
    useLiveQuery(
      () => db.deliveryNotes.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('1')

  const activeProducts = useMemo(
    () => products.filter(productIsActive),
    [products],
  )
  const sorted = useMemo(
    () => [...notes].sort((a, b) => b.createdAt - a.createdAt),
    [notes],
  )

  const create = async () => {
    if (!canManage) return
    const product = activeProducts.find((p) => p.id === productId)
    if (!customerName.trim() || !product) {
      toast.error('Client et article requis')
      return
    }
    const q = Math.max(1, Math.round(Number(qty) || 1))
    const unitPriceTTC = product.priceTTC
    const row: DeliveryNote = {
      id: crypto.randomUUID(),
      reference: `BL-${Date.now().toString(36).toUpperCase()}`,
      storeId: activeStoreId,
      customerName: customerName.trim(),
      customerPhone: phone.trim() || undefined,
      status: 'draft',
      lines: [
        {
          productId: product.id,
          productName: product.name,
          qty: q,
          unitPriceTTC,
        },
      ],
      totalTTC: q * unitPriceTTC,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.deliveryNotes.add(row)
    setCustomerName('')
    setPhone('')
    setQty('1')
    toast.success('BL créé', row.reference)
  }

  const markDelivered = async (row: DeliveryNote) => {
    if (!canManage) return
    await db.deliveryNotes.update(row.id, {
      status: 'delivered',
      deliveredAt: Date.now(),
      updatedAt: Date.now(),
    })
    toast.success('BL livré')
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconArchive />}
        title="Bons de livraison"
        subtitle="BL clients (gros / BTP / pro)"
      />
      {canManage ? (
        <FormPanel
          eyebrow="Expédition"
          title="Créer un bon de livraison"
          description="Client, article et quantité à livrer."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Créer le BL
            </Button>
          }
        >
          <FormGrid>
            <Field label="Client">
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </Field>
            <Field label="Téléphone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
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
          </FormGrid>
        </FormPanel>
      ) : null}
      {sorted.length === 0 ? (
        <EmptyState title="Aucun BL" description="Créez un bon de livraison." />
      ) : (
        <ul className="space-y-2">
          {sorted.map((n) => (
            <li
              key={n.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2"
            >
              <div>
                <p className="text-[13px] font-semibold">
                  {n.reference} · {n.customerName}
                </p>
                <p className="text-[11px] text-ink-muted">
                  {n.lines.map((l) => `${l.productName}×${l.qty}`).join(', ')} ·{' '}
                  {formatFCFA(n.totalTTC)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={n.status === 'delivered' ? 'success' : 'neutral'}>
                  {n.status}
                </Badge>
                {canManage && n.status === 'draft' ? (
                  <Button size="sm" onClick={() => void markDelivered(n)}>
                    Marquer livré
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
