import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  PurchasePriceHistoryEntry,
  Supplier,
} from '../db/types'
import { formatFCFA } from '../lib/money'
import { productIsActive } from '../lib/productFilters'
import {
  buildProductCostSnapshots,
  landedCostTTC,
  merchandiseTotalTTC,
  spendBySupplier,
  supplyCostKpis,
  supplyExtrasTTC,
  unitLandedCostTTC,
} from '../lib/purchaseCosts'
import { storeStockRowId } from '../lib/storeStockId'
import { enqueueStockSync } from '../lib/sync'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader, SectionHeader } from '../ui/PageHeader'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { IconStocks, IconTruck } from '../ui/icons'
import { cn } from '../ui/cn'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

type TabId =
  | 'commandes'
  | 'receptions'
  | 'fournisseurs'
  | 'prix'
  | 'couts'

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
  const [busy, setBusy] = useState(false)

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
    useLiveQuery(() => db.products.toArray(), [], []) ?? []
  const priceHistory =
    useLiveQuery(
      () =>
        db.purchasePriceHistory.orderBy('createdAt').reverse().toArray(),
      [],
      [],
    ) ?? []

  const activeProducts = useMemo(
    () => products.filter(productIsActive),
    [products],
  )
  const activeSuppliers = useMemo(
    () => suppliers.filter((s) => s.active),
    [suppliers],
  )
  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => b.createdAt - a.createdAt),
    [orders],
  )
  const pendingReceptions = useMemo(
    () =>
      sortedOrders.filter(
        (o) =>
          o.status === 'ordered' ||
          o.status === 'partial' ||
          o.status === 'draft',
      ),
    [sortedOrders],
  )
  const costKpis = useMemo(() => supplyCostKpis(orders), [orders])
  const supplierSpend = useMemo(
    () => spendBySupplier(orders, suppliers),
    [orders, suppliers],
  )
  const costSnapshots = useMemo(
    () => buildProductCostSnapshots(activeProducts, priceHistory),
    [activeProducts, priceHistory],
  )

  // —— Fournisseurs ——
  const [supName, setSupName] = useState('')
  const [supPhone, setSupPhone] = useState('')
  const [supEmail, setSupEmail] = useState('')
  const [supAddress, setSupAddress] = useState('')
  const [supNotes, setSupNotes] = useState('')

  // —— Commande ——
  const [poSupplierId, setPoSupplierId] = useState('')
  const [poProductId, setPoProductId] = useState('')
  const [poQty, setPoQty] = useState('1')
  const [poCost, setPoCost] = useState('')
  const [poLines, setPoLines] = useState<PurchaseOrderLine[]>([])
  const [poNotes, setPoNotes] = useState('')
  const [poShipping, setPoShipping] = useState('')
  const [poOther, setPoOther] = useState('')

  // —— Réception partielle ——
  const [recvOrderId, setRecvOrderId] = useState<string | null>(null)
  const [recvQtys, setRecvQtys] = useState<Record<string, string>>({})

  // —— Prix manuel ——
  const [priceProductId, setPriceProductId] = useState('')
  const [priceValue, setPriceValue] = useState('')
  const [priceSupplierId, setPriceSupplierId] = useState('')
  const [priceNote, setPriceNote] = useState('')
  const [priceQuery, setPriceQuery] = useState('')

  const filteredSnapshots = useMemo(() => {
    const q = priceQuery.trim().toLowerCase()
    if (!q) return costSnapshots
    return costSnapshots.filter(
      (s) =>
        s.product.name.toLowerCase().includes(q) ||
        s.product.barcode.toLowerCase().includes(q),
    )
  }, [costSnapshots, priceQuery])

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
        email: supEmail.trim() || undefined,
        address: supAddress.trim() || undefined,
        notes: supNotes.trim() || undefined,
        active: true,
        createdAt: now,
        updatedAt: now,
      }
      await db.suppliers.add(row)
      setSupName('')
      setSupPhone('')
      setSupEmail('')
      setSupAddress('')
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
    const p = activeProducts.find((x) => x.id === poProductId)
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
    const shipping = Number.parseInt(poShipping.replace(/\s/g, '') || '0', 10)
    const other = Number.parseInt(poOther.replace(/\s/g, '') || '0', 10)
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
        shippingCostTTC:
          Number.isFinite(shipping) && shipping > 0 ? shipping : undefined,
        otherCostTTC: Number.isFinite(other) && other > 0 ? other : undefined,
        orderedAt: asOrdered ? now : undefined,
        createdAt: now,
        updatedAt: now,
        createdByProfileId: actor.id,
        createdByDisplayName: actor.displayName,
      }
      await db.purchaseOrders.add(order)
      setPoLines([])
      setPoNotes('')
      setPoShipping('')
      setPoOther('')
      setPoSupplierId('')
      toast.success(
        asOrdered ? 'Commande envoyée' : 'Brouillon enregistré',
        order.reference,
      )
      if (asOrdered) setTab('receptions')
    } finally {
      setBusy(false)
    }
  }

  const markOrdered = async (order: PurchaseOrder) => {
    if (!canManage || order.status !== 'draft') return
    await db.purchaseOrders.update(order.id, {
      status: 'ordered',
      orderedAt: Date.now(),
      updatedAt: Date.now(),
    })
    toast.success('Commande confirmée', order.reference)
  }

  const openPartialReceive = (order: PurchaseOrder) => {
    const init: Record<string, string> = {}
    for (const l of order.lines) {
      const remaining = Math.max(0, l.qtyOrdered - l.qtyReceived)
      init[l.productId] = remaining > 0 ? String(remaining) : '0'
    }
    setRecvQtys(init)
    setRecvOrderId(order.id)
  }

  const applyReception = async (
    order: PurchaseOrder,
    receiveMap: Map<string, number>,
  ) => {
    if (!canManage) return
    if (order.status === 'received' || order.status === 'cancelled') return

    setBusy(true)
    try {
      await db.transaction(
        'rw',
        [
          db.purchaseOrders,
          db.storeStocks,
          db.products,
          db.syncQueue,
          db.purchasePriceHistory,
        ],
        async () => {
          const historyBatch: PurchasePriceHistoryEntry[] = []
          const lines = order.lines.map((l) => {
            const add = receiveMap.get(l.productId) ?? 0
            return {
              ...l,
              qtyReceived: l.qtyReceived + Math.max(0, add),
            }
          })

          for (const line of order.lines) {
            const add = receiveMap.get(line.productId) ?? 0
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
              const previous = product.purchasePriceTTC
              const landedUnit = unitLandedCostTTC(order, line)
              if (landedUnit > 0) {
                await db.products.update(line.productId, {
                  purchasePriceTTC: landedUnit,
                })
                if (previous !== landedUnit) {
                  historyBatch.push({
                    id: crypto.randomUUID(),
                    productId: line.productId,
                    productName: line.name,
                    supplierId: order.supplierId,
                    supplierName: order.supplierName,
                    purchaseOrderId: order.id,
                    purchaseOrderRef: order.reference,
                    storeId: order.storeId,
                    unitCostTTC: landedUnit,
                    previousUnitCostTTC: previous,
                    qty: add,
                    source: 'reception',
                    createdAt: Date.now(),
                    createdByProfileId: actor.id,
                    createdByDisplayName: actor.displayName,
                  })
                }
              }
              await enqueueStockSync({
                productId: line.productId,
                stock: nextStock,
                lowStockThreshold: product.lowStockThreshold,
                storeId: order.storeId,
              })
            }
          }

          if (historyBatch.length > 0) {
            await db.purchasePriceHistory.bulkAdd(historyBatch)
          }

          const allReceived = lines.every(
            (l) => l.qtyReceived >= l.qtyOrdered,
          )
          const anyReceived = lines.some((l) => l.qtyReceived > 0)
          const status: PurchaseOrderStatus = allReceived
            ? 'received'
            : anyReceived
              ? 'partial'
              : order.status === 'draft'
                ? 'ordered'
                : order.status

          await db.purchaseOrders.update(order.id, {
            lines,
            status,
            receivedAt: allReceived ? Date.now() : order.receivedAt,
            updatedAt: Date.now(),
            orderedAt: order.orderedAt ?? Date.now(),
          })
        },
      )
      toast.success('Réception enregistrée', order.reference)
      setRecvOrderId(null)
    } catch (e) {
      toast.error(
        'Échec réception',
        e instanceof Error ? e.message : String(e),
      )
    } finally {
      setBusy(false)
    }
  }

  const receiveAll = async (order: PurchaseOrder) => {
    const map = new Map<string, number>()
    for (const l of order.lines) {
      const rem = Math.max(0, l.qtyOrdered - l.qtyReceived)
      if (rem > 0) map.set(l.productId, rem)
    }
    if (map.size === 0) {
      toast.info('Rien à réceptionner', order.reference)
      return
    }
    await applyReception(order, map)
  }

  const receivePartial = async (order: PurchaseOrder) => {
    const map = new Map<string, number>()
    for (const l of order.lines) {
      const rem = Math.max(0, l.qtyOrdered - l.qtyReceived)
      const raw = Number.parseFloat(
        (recvQtys[l.productId] ?? '0').replace(',', '.'),
      )
      if (!Number.isFinite(raw) || raw <= 0) continue
      map.set(l.productId, Math.min(rem, raw))
    }
    if (map.size === 0) {
      return toast.error('Quantités', 'Indiquez au moins une quantité à réceptionner.')
    }
    await applyReception(order, map)
  }

  const cancelOrder = async (order: PurchaseOrder) => {
    if (!canManage) return
    await db.purchaseOrders.update(order.id, {
      status: 'cancelled',
      updatedAt: Date.now(),
    })
    toast.info('Commande annulée', order.reference)
  }

  const saveManualPrice = async () => {
    if (!canManage) return
    const product = activeProducts.find((p) => p.id === priceProductId)
    if (!product) return toast.error('Article', 'Choisissez un produit.')
    const cost = Number.parseInt(priceValue.replace(/\s/g, ''), 10)
    if (!Number.isFinite(cost) || cost < 0) {
      return toast.error('Prix invalide', '')
    }
    const supplier = suppliers.find((s) => s.id === priceSupplierId)
    setBusy(true)
    try {
      const previous = product.purchasePriceTTC
      await db.transaction('rw', db.products, db.purchasePriceHistory, async () => {
        await db.products.update(product.id, { purchasePriceTTC: cost })
        if (previous !== cost) {
          const entry: PurchasePriceHistoryEntry = {
            id: crypto.randomUUID(),
            productId: product.id,
            productName: product.name,
            supplierId: supplier?.id,
            supplierName: supplier?.name,
            storeId: activeStoreId,
            unitCostTTC: cost,
            previousUnitCostTTC: previous,
            source: 'manual',
            note: priceNote.trim() || undefined,
            createdAt: Date.now(),
            createdByProfileId: actor.id,
            createdByDisplayName: actor.displayName,
          }
          await db.purchasePriceHistory.add(entry)
        }
      })
      setPriceValue('')
      setPriceNote('')
      toast.success('Prix d’achat mis à jour', product.name)
    } finally {
      setBusy(false)
    }
  }

  const draftMerch = merchandiseTotalTTC({
    id: '',
    reference: '',
    supplierId: '',
    supplierName: '',
    storeId: '',
    status: 'draft',
    lines: poLines,
    createdAt: 0,
    updatedAt: 0,
  })
  const draftShip = Number.parseInt(poShipping.replace(/\s/g, '') || '0', 10) || 0
  const draftOther = Number.parseInt(poOther.replace(/\s/g, '') || '0', 10) || 0

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconStocks />}
        eyebrow={`Magasin · ${activeStore?.name ?? '—'}`}
        title="Achats"
        subtitle="Fournisseurs, commandes, réceptions, prix d’achat et coûts d’approvisionnement"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Fournisseurs actifs"
          value={String(activeSuppliers.length)}
          tone="accent"
        />
        <Kpi
          label="Commandes ouvertes"
          value={String(costKpis.openCount)}
          tone="amber"
        />
        <Kpi
          label="Marchandises (BC)"
          value={formatFCFA(costKpis.merchandiseTTC)}
          tone="violet"
        />
        <Kpi
          label="Coût appro. total"
          value={formatFCFA(costKpis.landedTTC)}
          hint={
            costKpis.extrasTTC > 0
              ? `dont ${formatFCFA(costKpis.extrasTTC)} de frais`
              : 'Marchandises + frais'
          }
          tone="sky"
        />
      </div>

      <Tabs
        variant="segmented"
        active={tab}
        onChange={setTab}
        items={[
          {
            id: 'commandes',
            label: 'Commandes',
            count: orders.length || undefined,
          },
          {
            id: 'receptions',
            label: 'Réceptions',
            count: pendingReceptions.length || undefined,
          },
          {
            id: 'fournisseurs',
            label: 'Fournisseurs',
            count: suppliers.length || undefined,
          },
          { id: 'prix', label: 'Prix d’achat' },
          { id: 'couts', label: 'Coûts appro.' },
        ]}
      />

      {tab === 'fournisseurs' ? (
        <div className="space-y-4">
          {canManage ? (
            <FormPanel
              eyebrow="Annuaire"
              title="Ajouter un fournisseur"
              description="Coordonnées, adresse et notes internes."
              actions={
                <Button
                  variant="accent"
                  loading={busy}
                  onClick={() => void saveSupplier()}
                >
                  Ajouter
                </Button>
              }
            >
              <FormGrid columns={3}>
                <Field label="Nom" required>
                  <Input
                    value={supName}
                    onChange={(e) => setSupName(e.target.value)}
                  />
                </Field>
                <Field label="Téléphone">
                  <Input
                    value={supPhone}
                    onChange={(e) => setSupPhone(e.target.value)}
                  />
                </Field>
                <Field label="E-mail">
                  <Input
                    type="email"
                    value={supEmail}
                    onChange={(e) => setSupEmail(e.target.value)}
                  />
                </Field>
                <Field label="Adresse" className="sm:col-span-2">
                  <Input
                    value={supAddress}
                    onChange={(e) => setSupAddress(e.target.value)}
                  />
                </Field>
                <Field label="Notes">
                  <Input
                    value={supNotes}
                    onChange={(e) => setSupNotes(e.target.value)}
                  />
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
              {suppliers.map((s) => {
                const spend = supplierSpend.find((x) => x.supplierId === s.id)
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{s.name}</p>
                      <p className="text-[12px] text-ink-muted">
                        {[s.phone, s.email, s.address]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </p>
                      {s.notes ? (
                        <p className="text-[11px] text-ink-subtle">{s.notes}</p>
                      ) : null}
                      {spend ? (
                        <p className="mt-0.5 font-mono-nums text-[11px] text-zinc-500">
                          {spend.orderCount} BC · {formatFCFA(spend.landedTTC)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={s.active ? 'success' : 'neutral'}>
                        {s.active ? 'Actif' : 'Inactif'}
                      </Badge>
                      {canManage ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void toggleSupplier(s)}
                        >
                          {s.active ? 'Désactiver' : 'Réactiver'}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'commandes' ? (
        <div className="space-y-4">
          {canManage ? (
            <FormPanel
              eyebrow="Commande"
              title="Nouveau bon de commande"
              description="Fournisseur, lignes, frais de transport et autres coûts."
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
                <Field label="Fournisseur" required>
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
                      const p = activeProducts.find(
                        (x) => x.id === e.target.value,
                      )
                      if (p?.purchasePriceTTC != null) {
                        setPoCost(String(p.purchasePriceTTC))
                      }
                    }}
                  >
                    <option value="">— Choisir —</option>
                    {activeProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.purchasePriceTTC != null
                          ? ` (${formatFCFA(p.purchasePriceTTC)})`
                          : ''}
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
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={addPoLine}>
                  Ajouter la ligne
                </Button>
                {poLines.length > 0 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPoLines([])}
                  >
                    Vider les lignes
                  </Button>
                ) : null}
              </div>
              {poLines.length > 0 ? (
                <ul className="mt-3 space-y-1 rounded-lg border border-border/70 bg-zinc-50/80 px-3 py-2 text-[12px]">
                  {poLines.map((l) => (
                    <li
                      key={l.productId}
                      className="flex justify-between gap-2"
                    >
                      <span>
                        {l.name} × {l.qtyOrdered} · {formatFCFA(l.unitCostTTC)}
                      </span>
                      <span className="font-mono-nums font-medium">
                        {formatFCFA(l.unitCostTTC * l.qtyOrdered)}
                      </span>
                    </li>
                  ))}
                  <li className="flex justify-between border-t border-border/60 pt-1.5 font-semibold">
                    <span>Marchandises</span>
                    <span className="font-mono-nums">
                      {formatFCFA(draftMerch)}
                    </span>
                  </li>
                </ul>
              ) : null}
              <FormGrid columns={3} className="mt-3">
                <Field label="Transport / livraison TTC">
                  <Input
                    inputMode="numeric"
                    value={poShipping}
                    onChange={(e) => setPoShipping(e.target.value)}
                    className="font-mono-nums"
                    placeholder="0"
                  />
                </Field>
                <Field label="Autres frais TTC">
                  <Input
                    inputMode="numeric"
                    value={poOther}
                    onChange={(e) => setPoOther(e.target.value)}
                    className="font-mono-nums"
                    placeholder="0"
                  />
                </Field>
                <Field label="Coût appro. estimé">
                  <Input
                    readOnly
                    value={formatFCFA(draftMerch + draftShip + draftOther)}
                    className="font-mono-nums"
                  />
                </Field>
              </FormGrid>
              <Field label="Notes" className="mt-3">
                <Textarea
                  rows={2}
                  value={poNotes}
                  onChange={(e) => setPoNotes(e.target.value)}
                />
              </Field>
            </FormPanel>
          ) : null}

          <SectionHeader title="Historique des bons de commande" />
          {sortedOrders.length === 0 ? (
            <EmptyState
              title="Aucune commande"
              description="Créez un bon de commande puis réceptionnez pour augmenter le stock."
            />
          ) : (
            <ul className="space-y-3">
              {sortedOrders.map((o) => {
                const merch = merchandiseTotalTTC(o)
                const extras = supplyExtrasTTC(o)
                const landed = landedCostTTC(o)
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
                          {new Date(o.createdAt).toLocaleString('fr-FR')} ·
                          Marchandises {formatFCFA(merch)}
                          {extras > 0
                            ? ` · Frais ${formatFCFA(extras)} · Total ${formatFCFA(landed)}`
                            : ''}
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
                          {extras > 0 ? (
                            <span className="text-ink-subtle">
                              {' '}
                              (landed ~{formatFCFA(unitLandedCostTTC(o, l))})
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {canManage &&
                    (o.status === 'draft' ||
                      o.status === 'ordered' ||
                      o.status === 'partial') ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {o.status === 'draft' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void markOrdered(o)}
                          >
                            Confirmer commande
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="accent"
                          loading={busy}
                          onClick={() => void receiveAll(o)}
                        >
                          Réceptionner tout
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            openPartialReceive(o)
                            setTab('receptions')
                          }}
                        >
                          Réception partielle…
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
      ) : null}

      {tab === 'receptions' ? (
        <div className="space-y-4">
          <SectionHeader
            title="Réceptions en attente"
            subtitle="Augmente le stock magasin et met à jour le prix d’achat"
          />
          {pendingReceptions.length === 0 ? (
            <EmptyState
              title="Rien à réceptionner"
              description="Les commandes ouvertes apparaîtront ici."
              variant="flat"
            />
          ) : (
            <ul className="space-y-3">
              {pendingReceptions.map((o) => {
                const isEditing = recvOrderId === o.id
                return (
                  <li
                    key={o.id}
                    className="rounded-xl border border-border bg-white p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <IconTruck className="h-4 w-4 text-zinc-500" />
                        <div>
                          <p className="font-semibold text-ink">
                            {o.reference} · {o.supplierName}
                          </p>
                          <p className="text-[11px] text-ink-subtle">
                            {formatFCFA(landedCostTTC(o))} ·{' '}
                            {statusLabel(o.status)}
                          </p>
                        </div>
                      </div>
                      <Badge tone={statusTone(o.status)}>
                        {statusLabel(o.status)}
                      </Badge>
                    </div>

                    {isEditing ? (
                      <div className="mt-3 space-y-2 rounded-lg border border-border/70 bg-zinc-50/80 p-3">
                        {o.lines.map((l) => {
                          const rem = Math.max(0, l.qtyOrdered - l.qtyReceived)
                          return (
                            <div
                              key={l.productId}
                              className="flex flex-wrap items-center justify-between gap-2 text-[12px]"
                            >
                              <span className="min-w-0 flex-1">
                                {l.name}{' '}
                                <span className="text-ink-subtle">
                                  (reste {rem})
                                </span>
                              </span>
                              <Input
                                className="w-24 font-mono-nums"
                                inputMode="decimal"
                                disabled={rem <= 0}
                                value={recvQtys[l.productId] ?? '0'}
                                onChange={(e) =>
                                  setRecvQtys((prev) => ({
                                    ...prev,
                                    [l.productId]: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          )
                        })}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="accent"
                            loading={busy}
                            onClick={() => void receivePartial(o)}
                          >
                            Valider réception
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRecvOrderId(null)}
                          >
                            Annuler
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <ul className="mt-2 space-y-0.5 text-[12px] text-ink-muted">
                          {o.lines.map((l) => (
                            <li key={l.productId}>
                              {l.name} — {l.qtyReceived}/{l.qtyOrdered} ·{' '}
                              {formatFCFA(l.unitCostTTC)}
                            </li>
                          ))}
                        </ul>
                        {canManage ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="accent"
                              loading={busy}
                              onClick={() => void receiveAll(o)}
                            >
                              Tout réceptionner
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openPartialReceive(o)}
                            >
                              Quantités partielles
                            </Button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'prix' ? (
        <div className="space-y-4">
          {canManage ? (
            <FormPanel
              eyebrow="Prix d’achat"
              title="Mettre à jour un coût"
              description="Enregistre l’historique pour le suivi des marges."
              actions={
                <Button
                  variant="accent"
                  loading={busy}
                  onClick={() => void saveManualPrice()}
                >
                  Enregistrer
                </Button>
              }
            >
              <FormGrid columns={4}>
                <Field label="Article" required>
                  <Select
                    value={priceProductId}
                    onChange={(e) => {
                      setPriceProductId(e.target.value)
                      const p = activeProducts.find(
                        (x) => x.id === e.target.value,
                      )
                      if (p?.purchasePriceTTC != null) {
                        setPriceValue(String(p.purchasePriceTTC))
                      }
                    }}
                  >
                    <option value="">— Choisir —</option>
                    {activeProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Nouveau prix TTC" required>
                  <Input
                    inputMode="numeric"
                    value={priceValue}
                    onChange={(e) => setPriceValue(e.target.value)}
                    className="font-mono-nums"
                  />
                </Field>
                <Field label="Fournisseur (opt.)">
                  <Select
                    value={priceSupplierId}
                    onChange={(e) => setPriceSupplierId(e.target.value)}
                  >
                    <option value="">—</option>
                    {activeSuppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Note">
                  <Input
                    value={priceNote}
                    onChange={(e) => setPriceNote(e.target.value)}
                  />
                </Field>
              </FormGrid>
            </FormPanel>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeader
              title="Catalogue — prix de revient"
              subtitle="Prix courant et écart vs précédent"
            />
            <Field label="Recherche" className="sm:w-56">
              <Input
                value={priceQuery}
                onChange={(e) => setPriceQuery(e.target.value)}
                placeholder="Nom ou code…"
              />
            </Field>
          </div>

          {filteredSnapshots.length === 0 ? (
            <EmptyState title="Aucun article" />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-white">
              {filteredSnapshots.map((snap) => (
                <li
                  key={snap.product.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">
                      {snap.product.name}
                    </p>
                    <p className="font-mono-nums text-[11px] text-ink-subtle">
                      {snap.product.barcode}
                      {snap.lastHistory
                        ? ` · maj ${new Date(snap.lastHistory.createdAt).toLocaleDateString('fr-FR')}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono-nums font-semibold text-ink">
                      {snap.purchasePriceTTC != null
                        ? formatFCFA(snap.purchasePriceTTC)
                        : '—'}
                    </span>
                    {snap.deltaVsPrevious != null &&
                    snap.deltaVsPrevious !== 0 ? (
                      <span
                        className={cn(
                          'font-mono-nums text-[11px]',
                          snap.deltaVsPrevious > 0
                            ? 'text-rose-600'
                            : 'text-emerald-600',
                        )}
                      >
                        {snap.deltaVsPrevious > 0 ? '+' : ''}
                        {formatFCFA(snap.deltaVsPrevious)}
                      </span>
                    ) : null}
                    {snap.historyCount > 0 ? (
                      <Badge tone="neutral">{snap.historyCount} hist.</Badge>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <SectionHeader title="Historique des prix" />
          {priceHistory.length === 0 ? (
            <EmptyState
              title="Aucun historique"
              description="Les réceptions et mises à jour manuelles apparaissent ici."
              variant="flat"
            />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-white">
              {priceHistory.slice(0, 40).map((h) => (
                <li
                  key={h.id}
                  className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-[13px]"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{h.productName}</p>
                    <p className="text-[11px] text-ink-muted">
                      {h.source === 'reception'
                        ? 'Réception'
                        : h.source === 'manual'
                          ? 'Saisie manuelle'
                          : 'Commande'}
                      {h.supplierName ? ` · ${h.supplierName}` : ''}
                      {h.purchaseOrderRef ? ` · ${h.purchaseOrderRef}` : ''}
                      {h.note ? ` · ${h.note}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono-nums font-semibold text-ink">
                      {formatFCFA(h.unitCostTTC)}
                    </p>
                    {h.previousUnitCostTTC != null ? (
                      <p className="font-mono-nums text-[11px] text-ink-subtle">
                        avant {formatFCFA(h.previousUnitCostTTC)}
                      </p>
                    ) : null}
                    <p className="text-[10px] text-ink-subtle">
                      {new Date(h.createdAt).toLocaleString('fr-FR')}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'couts' ? (
        <div className="space-y-5">
          <SectionHeader
            title="Coûts d’approvisionnement"
            subtitle="Marchandises, frais et répartition par fournisseur"
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Coût landed total"
              value={formatFCFA(costKpis.landedTTC)}
              tone="accent"
            />
            <Kpi
              label="Dont marchandises"
              value={formatFCFA(costKpis.merchandiseTTC)}
              tone="violet"
            />
            <Kpi
              label="Dont frais"
              value={formatFCFA(costKpis.extrasTTC)}
              hint="Transport + autres"
              tone="amber"
            />
            <Kpi
              label="Moyenne / BC"
              value={formatFCFA(costKpis.avgLandedPerOrder)}
              tone="sky"
            />
          </div>

          <SectionHeader title="Dépenses par fournisseur" />
          {supplierSpend.length === 0 ? (
            <EmptyState
              title="Pas encore de dépenses"
              description="Les bons de commande non annulés alimentent ce tableau."
              variant="flat"
            />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-white">
              {supplierSpend.map((row) => (
                <li
                  key={row.supplierId}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold text-ink">{row.supplierName}</p>
                    <p className="text-[11px] text-ink-muted">
                      {row.orderCount} bon(s) de commande
                    </p>
                  </div>
                  <div className="text-right text-[12px]">
                    <p className="font-mono-nums font-semibold text-ink">
                      {formatFCFA(row.landedTTC)}
                    </p>
                    <p className="text-ink-muted">
                      March. {formatFCFA(row.merchandiseTTC)}
                      {row.extrasTTC > 0
                        ? ` · Frais ${formatFCFA(row.extrasTTC)}`
                        : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <SectionHeader title="Détail des BC (coût landed)" />
          {sortedOrders.filter((o) => o.status !== 'cancelled').length === 0 ? (
            <EmptyState title="Aucun BC" variant="flat" />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-white">
              {sortedOrders
                .filter((o) => o.status !== 'cancelled')
                .map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]"
                  >
                    <div>
                      <p className="font-medium text-ink">
                        {o.reference} · {o.supplierName}
                      </p>
                      <p className="text-[11px] text-ink-muted">
                        {statusLabel(o.status)} ·{' '}
                        {new Date(o.createdAt).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <div className="text-right font-mono-nums">
                      <p className="font-semibold">
                        {formatFCFA(landedCostTTC(o))}
                      </p>
                      {supplyExtrasTTC(o) > 0 ? (
                        <p className="text-[11px] text-ink-subtle">
                          +{formatFCFA(supplyExtrasTTC(o))} frais
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
