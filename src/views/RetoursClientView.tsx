import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { CustomerReturn, CustomerReturnStatus } from '../db/types'
import { formatFCFA } from '../lib/money'
import { productIsActive } from '../lib/productFilters'
import { storeStockRowId } from '../lib/storeStockId'
import { enqueueStockSync } from '../lib/sync'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { IconRefund } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

const REASONS = ['Défaut', 'Erreur caisse', 'Changement d’avis', 'Autre'] as const

type Filter = 'open' | 'all' | 'closed'

function refGen(): string {
  return `RC-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
}

function statusLabel(s: CustomerReturnStatus): string {
  switch (s) {
    case 'open':
      return 'Ouvert'
    case 'refunded':
      return 'Remboursé'
    case 'exchanged':
      return 'Échangé'
    case 'cancelled':
      return 'Annulé'
    default: {
      const _e: never = s
      return _e
    }
  }
}

function statusTone(
  s: CustomerReturnStatus,
): 'warning' | 'success' | 'info' | 'neutral' {
  switch (s) {
    case 'open':
      return 'warning'
    case 'refunded':
      return 'success'
    case 'exchanged':
      return 'info'
    case 'cancelled':
      return 'neutral'
    default: {
      const _e: never = s
      return _e
    }
  }
}

export function RetoursClientView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId, activeStore } = useActiveStore()
  const rows =
    useLiveQuery(
      () => db.customerReturns.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const products =
    useLiveQuery(() => db.products.toArray(), [], []) ?? []
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [productId, setProductId] = useState('')
  const [productName, setProductName] = useState('')
  const [qty, setQty] = useState('1')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState<string>(REASONS[0])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('open')

  const activeProducts = useMemo(
    () => products.filter(productIsActive),
    [products],
  )
  const open = useMemo(() => rows.filter((r) => r.status === 'open'), [rows])
  const refundedSum = rows
    .filter((r) => r.status === 'refunded')
    .reduce((m, r) => m + r.amountTTC, 0)

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...rows]
      .filter((r) => {
        if (filter === 'open') return r.status === 'open'
        if (filter === 'closed') return r.status !== 'open'
        return true
      })
      .filter((r) => {
        if (!q) return true
        return (
          r.reference.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.productName.toLowerCase().includes(q) ||
          (r.customerPhone?.includes(q) ?? false)
        )
      })
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [rows, filter, search])

  const create = async () => {
    if (!canManage) return
    const q = Number(qty.replace(',', '.'))
    const amt = Math.round(Number(amount.replace(/\s/g, '')))
    const selected = activeProducts.find((p) => p.id === productId)
    const name = selected?.name ?? productName.trim()
    if (!customerName.trim() || !name) {
      toast.error('Client et article requis')
      return
    }
    if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(amt) || amt < 0) {
      toast.error('Quantité ou montant invalide')
      return
    }
    const row: CustomerReturn = {
      id: crypto.randomUUID(),
      reference: refGen(),
      storeId: activeStoreId,
      status: 'open',
      customerName: customerName.trim(),
      customerPhone: phone.trim() || undefined,
      productId: selected?.id,
      productName: name,
      qty: q,
      amountTTC: amt,
      reason,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.customerReturns.add(row)
    setCustomerName('')
    setPhone('')
    setProductId('')
    setProductName('')
    setQty('1')
    setAmount('')
    toast.success('Retour enregistré', row.reference)
  }

  const restockIfNeeded = async (row: CustomerReturn) => {
    if (row.restocked || !row.productId) return
    const product = await db.products.get(row.productId)
    if (!product || product.trackLots || product.trackSerialNumbers) return
    const rid = storeStockRowId(activeStoreId, row.productId)
    const stock = await db.storeStocks.get(rid)
    const next = (stock?.stock ?? 0) + row.qty
    await db.storeStocks.put({
      id: rid,
      storeId: activeStoreId,
      productId: row.productId,
      stock: next,
    })
    await enqueueStockSync({
      productId: row.productId,
      stock: next,
      lowStockThreshold: product.lowStockThreshold,
      storeId: activeStoreId,
    })
    await db.customerReturns.update(row.id, { restocked: true })
  }

  const setStatus = async (row: CustomerReturn, status: CustomerReturnStatus) => {
    if (!canManage) return
    if (status === 'refunded' || status === 'exchanged') {
      await restockIfNeeded(row)
    }
    await db.customerReturns.update(row.id, { status, updatedAt: Date.now() })
    toast.info('Retour mis à jour', statusLabel(status))
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconRefund />}
        eyebrow={`Magasin · ${activeStore?.name ?? '—'}`}
        title="Retours client"
        subtitle="Échanges, avoirs et remboursements — le stock est recrédité si un article catalogue est lié"
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Kpi label="Ouverts" value={String(open.length)} tone="amber" />
        <Kpi label="Dossiers" value={String(rows.length)} tone="neutral" />
        <Kpi label="Remboursé" value={formatFCFA(refundedSum)} tone="violet" />
      </div>
      {canManage ? (
        <FormPanel
          eyebrow="SAV"
          title="Nouveau retour"
          description="Échange, avoir ou remboursement — stock recrédité si l’article est lié."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Enregistrer le retour
            </Button>
          }
        >
          <FormGrid>
            <Field label="Client" required>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </Field>
            <Field label="Téléphone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Article catalogue">
              <Select
                value={productId}
                onChange={(e) => {
                  const id = e.target.value
                  setProductId(id)
                  const p = activeProducts.find((x) => x.id === id)
                  if (p) {
                    setProductName(p.name)
                    if (!amount.trim()) setAmount(String(p.priceTTC))
                  }
                }}
              >
                <option value="">Saisie libre…</option>
                {activeProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Libellé article" required>
              <Input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                disabled={!!productId}
              />
            </Field>
            <Field label="Motif">
              <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Qté">
              <Input
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="font-mono-nums"
              />
            </Field>
            <Field label="Montant (FCFA)" className="sm:col-span-2">
              <Input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="font-mono-nums"
              />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          variant="segmented"
          active={filter}
          onChange={setFilter}
          items={[
            { id: 'open', label: 'Ouverts', count: open.length },
            { id: 'closed', label: 'Traités' },
            { id: 'all', label: 'Tous', count: rows.length },
          ]}
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Référence, client, article…"
          className="sm:max-w-xs"
        />
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title="Aucun retour"
          description="Les retours clients apparaissent ici."
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2"
            >
              <div>
                <p className="text-[13px] font-semibold">
                  {r.reference} · {r.productName}
                </p>
                <p className="text-[11px] text-ink-muted">
                  {r.customerName}
                  {r.customerPhone ? ` · ${r.customerPhone}` : ''} · {r.qty} ·{' '}
                  {formatFCFA(r.amountTTC)} · {r.reason}
                  {r.restocked ? ' · stock recrédité' : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
                {canManage && r.status === 'open' ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => void setStatus(r, 'refunded')}
                    >
                      Rembourser
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void setStatus(r, 'exchanged')}
                    >
                      Échanger
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void setStatus(r, 'cancelled')}
                    >
                      Annuler
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
