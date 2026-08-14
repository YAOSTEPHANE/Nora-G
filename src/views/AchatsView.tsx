import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  Supplier,
} from '../db/types'
import { formatFCFA } from '../lib/money'
import { storeStockRowId } from '../lib/storeStockId'
import { enqueueStockSync } from '../lib/sync'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { IconStocks } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

type TabId = 'fournisseurs' | 'commandes'

function statusLabel(s: PurchaseOrderStatus): string {
  switch (s) {
    case 'draft':
      return 'Brouillon'
    case 'ordered':
      return 'Commandé'
    case 'partial':
      return 'Partiel'
    case 'received':
      return 'Reçu'
    case 'cancelled':
      return 'Annulé'
    default: {
      const _e: never = s
      return _e
    }
  }
}

function statusTone(
  s: PurchaseOrderStatus,
): 'neutral' | 'warning' | 'success' | 'danger' | 'info' {
  switch (s) {
    case 'draft':
      return 'neutral'
    case 'ordered':
      return 'info'
    case 'partial':
      return 'warning'
    case 'received':
      return 'success'
    case 'cancelled':
      return 'danger'
    default: {
      const _e: never = s
      return _e
    }
  }
}

function nextPoRef(): string {
  return `BC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 9000) + 1000}`
}

export function AchatsView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId, activeStore } = useActiveStore()
  const [tab, setTab] = useState<TabId>('commandes')

  const suppliers =
    useLiveQuery(() => db.suppliers.orderBy('name').toArray(), [], []) ?? []
  const orders =
    useLiveQuery(
      () =>
        db.purchaseOrders
          .where('storeId')
          .equals(activeStoreId)
          .reverse()
          .sortBy('createdAt'),
      [activeStoreId],
      [],
    ) ?? []
  const products =
    useLiveQuery(() => db.products.filter((p) => !p.archived).toArray(), [], []) ??
    []

  const [supName, setSupName] = useState('')
  const [supPhone, setSupPhone] = useState('')
  const [supNotes, setSupNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const [poSupplierId, setPoSupplierId] = useState('')
  const [poProductId, setPoProductId] = useState('')
  const [poQty, setPoQty] = useState('1')
  const [poCost, setPoCost] = useState('')
  const [poLines, setPoLines] = useState<PurchaseOrderLine[]>([])
  const [poNotes, setPoNotes] = useState('')

  const activeSuppliers = useMemo(
    () => suppliers.filter((s) => s.active),
    [suppliers],
  )
  const openOrders = orders.filter(
    (o) => o.status === 'ordered' || o.status === 'partial' || o.status === 'draft',
  ).length

  const saveSupplier = async () => {
    if (!canManage) return
    const name = supName.trim()
    if (!name) return toast.error('Nom requis', 'Indiquez le fournisseur.')
    setBusy(true)
    try {
      const now = Date.now()
      const row: Supplier = {
        id: crypto.randomUUID(),
        name,
        phone: supPhone.trim() || undefined,
        notes: supNotes.trim() || undefined,
        active: true,
        createdAt: now,
        updatedAt: now,
      }
      await db.suppliers.add(row)
      setSupName('')
      setSupPhone('')
      setSupNotes('')
      toast.success('Fournisseur ajouté', name)
    } finally {
      setBusy(false)
    }
  }

  const toggleSupplier = async (s: Supplier) => {
    if (!canManage) return
    await db.suppliers.update(s.id, {
      active: !s.active,
      updatedAt: Date.now(),
    })
  }

  const addPoLine = () => {
    const p = products.find((x) => x.id === poProductId)
    const qty = Number.parseFloat(poQty.replace(',', '.'))
    const cost = Number.parseInt(poCost.replace(/\s/g, ''), 10)
    if (!p) return toast.error('Article', 'Choisissez un produit.')
    if (!Number.isFinite(qty) || qty <= 0) {
      return toast.error('Quantité invalide', '')
    }
    if (!Number.isFinite(cost) || cost < 0) {
      return toast.error('Coût invalide', '')
    }
    setPoLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id)
      if (existing) {
        return prev.map((l) =>
          l.productId === p.id
            ? {
                ...l,
                qtyOrdered: l.qtyOrdered + qty,
                unitCostTTC: cost,
              }
            : l,
        )
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          qtyOrdered: qty,
          qtyReceived: 0,
          unitCostTTC: cost,
        },
      ]
    })
    setPoQty('1')
  }

  const createOrder = async (asOrdered: boolean) => {
    if (!canManage) return
    const supplier = suppliers.find((s) => s.id === poSupplierId)
    if (!supplier) return toast.error('Fournisseur', 'Sélectionnez un fournisseur.')
    if (poLines.length === 0) {
      return toast.error('Lignes vides', 'Ajoutez au moins un article.')
    }
    setBusy(true)
    try {
      const now = Date.now()
      const order: PurchaseOrder = {
        id: crypto.randomUUID(),
        reference: nextPoRef(),
        supplierId: supplier.id,
        supplierName: supplier.name,
        storeId: activeStoreId,
        storeName: activeStore?.name,
        status: asOrdered ? 'ordered' : 'draft',
        lines: poLines,
        notes: poNotes.trim() || undefined,
        orderedAt: asOrdered ? now : undefined,
        createdAt: now,
        updatedAt: now,
        createdByProfileId: actor.id,
        createdByDisplayName: actor.displayName,
      }
      await db.purchaseOrders.add(order)
      setPoLines([])
      setPoNotes('')
      setPoSupplierId('')
      toast.success(
        asOrdered ? 'Commande envoyée' : 'Brouillon enregistré',
        order.reference,
      )
    } finally {
      setBusy(false)
    }
  }

  const receiveOrder = async (order: PurchaseOrder) => {
    if (!canManage) return
    if (order.status === 'received' || order.status === 'cancelled') return
    setBusy(true)
    try {
      await db.transaction(
        'rw',
        [db.purchaseOrders, db.storeStocks, db.products, db.syncQueue],
        async () => {
          const prevById = new Map(
            order.lines.map((l) => [l.productId, l.qtyReceived] as const),
          )
          const lines = order.lines.map((l) => ({
            ...l,
            qtyReceived: l.qtyOrdered,
          }))
          for (const line of lines) {
            const already = prevById.get(line.productId) ?? 0
            const add = line.qtyOrdered - already
            if (add <= 0) continue
            const rid = storeStockRowId(order.storeId, line.productId)
            const row = await db.storeStocks.get(rid)
            const nextStock = (row?.stock ?? 0) + add
            await db.storeStocks.put({
              id: rid,
              storeId: order.storeId,
              productId: line.productId,
              stock: nextStock,
            })
            const product = await db.products.get(line.productId)
            if (product) {
              if (line.unitCostTTC > 0) {
                await db.products.update(line.productId, {
                  purchasePriceTTC: line.unitCostTTC,
                })
              }
              await enqueueStockSync({
                productId: line.productId,
                stock: nextStock,
                lowStockThreshold: product.lowStockThreshold,
                storeId: order.storeId,
              })
            }
          }
          await db.purchaseOrders.update(order.id, {
            lines,
            status: 'received',
            receivedAt: Date.now(),
            updatedAt: Date.now(),
          })
        },
      )
      toast.success('Réception enregistrée', order.reference)
    } catch (e) {
      toast.error(
        'Échec réception',
        e instanceof Error ? e.message : String(e),
      )
    } finally {
      setBusy(false)
    }
  }

  const cancelOrder = async (order: PurchaseOrder) => {
    if (!canManage) return
    await db.purchaseOrders.update(order.id, {
      status: 'cancelled',
      updatedAt: Date.now(),
    })
    toast.info('Commande annulée', order.reference)
  }

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconStocks />}
        eyebrow={`Magasin · ${activeStore?.name ?? '—'}`}
        title="Achats & fournisseurs"
        subtitle="Commandes, réceptions stock et fiches fournisseurs"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Fournisseurs actifs" value={String(activeSuppliers.length)} />
        <Kpi label="Commandes ouvertes" value={String(openOrders)} tone="amber" />
        <Kpi label="Total BC" value={String(orders.length)} tone="violet" />
      </div>

      <Tabs
        variant="segmented"
        active={tab}
        onChange={setTab}
        items={[
          { id: 'commandes', label: 'Bons de commande', count: orders.length || undefined },
          {
            id: 'fournisseurs',
            label: 'Fournisseurs',
            count: suppliers.length || undefined,
          },
        ]}
      />

      {tab === 'fournisseurs' ? (
        <div className="space-y-4">
          {canManage ? (
            <FormPanel
              eyebrow="Annuaire"
              title="Ajouter un fournisseur"
              description="Nom, téléphone et notes internes."
              actions={
                <Button variant="accent" loading={busy} onClick={() => void saveSupplier()}>
                  Ajouter
                </Button>
              }
            >
              <FormGrid columns={3}>
                <Field label="Nom" required>
                  <Input value={supName} onChange={(e) => setSupName(e.target.value)} />
                </Field>
                <Field label="Téléphone">
                  <Input value={supPhone} onChange={(e) => setSupPhone(e.target.value)} />
                </Field>
                <Field label="Notes">
                  <Input value={supNotes} onChange={(e) => setSupNotes(e.target.value)} />
                </Field>
              </FormGrid>
            </FormPanel>
          ) : null}

          {suppliers.length === 0 ? (
            <EmptyState
              title="Aucun fournisseur"
              description="Ajoutez vos fournisseurs pour créer des bons de commande."
            />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-white">
              {suppliers.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold text-ink">{s.name}</p>
                    <p className="text-[12px] text-ink-muted">
                      {s.phone ?? '—'} {s.notes ? `· ${s.notes}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={s.active ? 'success' : 'neutral'}>
                      {s.active ? 'Actif' : 'Inactif'}
                    </Badge>
                    {canManage ? (
                      <Button size="sm" variant="ghost" onClick={() => void toggleSupplier(s)}>
                        {s.active ? 'Désactiver' : 'Réactiver'}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {canManage ? (
            <FormPanel
              eyebrow="Commande"
              title="Nouveau bon de commande"
              description="Fournisseur, lignes et notes — brouillon ou envoi."
              actions={
                <>
                  <Button
                    variant="secondary"
                    loading={busy}
                    onClick={() => void createOrder(false)}
                  >
                    Brouillon
                  </Button>
                  <Button
                    variant="accent"
                    loading={busy}
                    onClick={() => void createOrder(true)}
                  >
                    Commander
                  </Button>
                </>
              }
            >
              <FormGrid columns={4}>
                <Field label="Fournisseur">
                  <Select
                    value={poSupplierId}
                    onChange={(e) => setPoSupplierId(e.target.value)}
                  >
                    <option value="">— Choisir —</option>
                    {activeSuppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Article">
                  <Select
                    value={poProductId}
                    onChange={(e) => {
                      setPoProductId(e.target.value)
                      const p = products.find((x) => x.id === e.target.value)
                      if (p?.purchasePriceTTC != null) {
                        setPoCost(String(p.purchasePriceTTC))
                      }
                    }}
                  >
                    <option value="">— Choisir —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Qté">
                  <Input
                    inputMode="decimal"
                    value={poQty}
                    onChange={(e) => setPoQty(e.target.value)}
                    className="font-mono-nums"
                  />
                </Field>
                <Field label="Coût unit. TTC">
                  <Input
                    inputMode="numeric"
                    value={poCost}
                    onChange={(e) => setPoCost(e.target.value)}
                    className="font-mono-nums"
                  />
                </Field>
              </FormGrid>
              <div className="mt-4 space-y-3">
                <Button size="sm" variant="secondary" onClick={addPoLine}>
                  Ajouter la ligne
                </Button>
                {poLines.length > 0 ? (
                  <ul className="space-y-1 text-[12px]">
                    {poLines.map((l) => (
                      <li key={l.productId} className="flex justify-between gap-2">
                        <span>
                          {l.name} × {l.qtyOrdered}
                        </span>
                        <span className="font-mono-nums">
                          {formatFCFA(l.unitCostTTC * l.qtyOrdered)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Field label="Notes">
                  <Textarea
                    rows={2}
                    value={poNotes}
                    onChange={(e) => setPoNotes(e.target.value)}
                  />
                </Field>
              </div>
            </FormPanel>
          ) : null}

          {orders.length === 0 ? (
            <EmptyState
              title="Aucune commande"
              description="Créez un bon de commande puis réceptionnez pour augmenter le stock."
            />
          ) : (
            <ul className="space-y-3">
              {[...orders].reverse().map((o) => {
                const total = o.lines.reduce(
                  (s, l) => s + l.qtyOrdered * l.unitCostTTC,
                  0,
                )
                return (
                  <li
                    key={o.id}
                    className="rounded-xl border border-border bg-white p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink">
                          {o.reference}{' '}
                          <span className="font-normal text-ink-muted">
                            · {o.supplierName}
                          </span>
                        </p>
                        <p className="text-[11px] text-ink-subtle">
                          {new Date(o.createdAt).toLocaleString('fr-FR')} ·{' '}
                          {formatFCFA(total)}
                        </p>
                      </div>
                      <Badge tone={statusTone(o.status)}>
                        {statusLabel(o.status)}
                      </Badge>
                    </div>
                    <ul className="mt-2 space-y-0.5 text-[12px] text-ink-muted">
                      {o.lines.map((l) => (
                        <li key={l.productId}>
                          {l.name} — cmd {l.qtyOrdered} / reçu {l.qtyReceived} ·{' '}
                          {formatFCFA(l.unitCostTTC)}
                        </li>
                      ))}
                    </ul>
                    {canManage &&
                    (o.status === 'ordered' ||
                      o.status === 'draft' ||
                      o.status === 'partial') ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="accent"
                          loading={busy}
                          onClick={() => void receiveOrder(o)}
                        >
                          Réceptionner tout
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void cancelOrder(o)}
                        >
                          Annuler
                        </Button>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
