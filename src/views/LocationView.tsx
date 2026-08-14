import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { RentalContract, RentalContractStatus, RentalLine } from '../db/types'
import { formatFCFA } from '../lib/money'
import { productIsActive } from '../lib/productFilters'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconKey } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

function statusLabel(s: RentalContractStatus): string {
  switch (s) {
    case 'draft':
      return 'Brouillon'
    case 'active':
      return 'En location'
    case 'overdue':
      return 'En retard'
    case 'returned':
      return 'Retourné'
    case 'cancelled':
      return 'Annulé'
    default: {
      const _e: never = s
      return _e
    }
  }
}

function statusTone(
  s: RentalContractStatus,
): 'neutral' | 'info' | 'warning' | 'success' | 'danger' {
  switch (s) {
    case 'draft':
      return 'neutral'
    case 'active':
      return 'info'
    case 'overdue':
      return 'danger'
    case 'returned':
      return 'success'
    case 'cancelled':
      return 'warning'
    default: {
      const _e: never = s
      return _e
    }
  }
}

function nextRef(): string {
  return `LOC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 900) + 100}`
}

export function LocationView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId, activeStore } = useActiveStore()
  const now = Date.now()
  const products =
    useLiveQuery(() => db.products.toArray(), [], []) ?? []
  const contracts =
    useLiveQuery(
      () =>
        db.rentalContracts.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []

  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('1')
  const [deposit, setDeposit] = useState('')
  const [dailyRate, setDailyRate] = useState('')
  const [days, setDays] = useState('1')
  const [notes, setNotes] = useState('')

  const activeProducts = useMemo(
    () => products.filter(productIsActive),
    [products],
  )

  const enriched = useMemo(
    () =>
      contracts
        .map((c) => {
          if (c.status === 'active' && c.dueBackAt < now) {
            return { ...c, status: 'overdue' as const }
          }
          return c
        })
        .sort((a, b) => b.createdAt - a.createdAt),
    [contracts, now],
  )

  const openCount = enriched.filter(
    (c) => c.status === 'active' || c.status === 'overdue',
  ).length

  const createContract = async () => {
    if (!canManage) return
    const product = activeProducts.find((p) => p.id === productId)
    if (!customerName.trim() || !product) {
      toast.error('Client et article requis')
      return
    }
    const q = Math.max(1, Math.round(Number(qty) || 1))
    const depositTTC = Math.max(0, Math.round(Number(deposit) || 0))
    const dailyRateTTC = Math.max(0, Math.round(Number(dailyRate) || 0))
    const dayCount = Math.max(1, Math.round(Number(days) || 1))
    const line: RentalLine = {
      productId: product.id,
      productName: product.name,
      qty: q,
      conditionOut: 'ok',
    }
    const startAt = Date.now()
    const row: RentalContract = {
      id: crypto.randomUUID(),
      reference: nextRef(),
      storeId: activeStoreId,
      storeName: activeStore?.name,
      customerName: customerName.trim(),
      customerPhone: phone.trim() || undefined,
      status: 'active',
      depositTTC,
      dailyRateTTC,
      startAt,
      dueBackAt: startAt + dayCount * 24 * 60 * 60 * 1000,
      lines: [line],
      notes: notes.trim() || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.rentalContracts.add(row)
    setCustomerName('')
    setPhone('')
    setProductId('')
    setQty('1')
    setDeposit('')
    setDailyRate('')
    setDays('1')
    setNotes('')
    toast.success('Contrat de location créé', row.reference)
  }

  const markReturned = async (c: RentalContract) => {
    if (!canManage) return
    await db.rentalContracts.update(c.id, {
      status: 'returned',
      returnedAt: Date.now(),
      updatedAt: Date.now(),
      lines: c.lines.map((l) => ({ ...l, conditionIn: l.conditionIn ?? 'ok' })),
    })
    toast.success('Retour enregistré', c.reference)
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconKey />}
        title="Location matériel"
        subtitle="Contrats, cautions et retours"
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Kpi label="En cours" value={String(openCount)} tone="accent" />
        <Kpi
          label="En retard"
          value={String(enriched.filter((c) => c.status === 'overdue').length)}
          tone="rose"
        />
        <Kpi label="Total contrats" value={String(contracts.length)} tone="neutral" />
      </div>

      {canManage ? (
        <FormPanel
          eyebrow="Contrat"
          title="Nouvelle location"
          description="Caution, tarif journalier et durée."
          actions={
            <Button variant="accent" onClick={() => void createContract()}>
              Créer le contrat
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
                <option value="">— Choisir —</option>
                {activeProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quantité">
              <Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Field label="Caution (FCFA)">
              <Input inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
            </Field>
            <Field label="Tarif / jour (FCFA)">
              <Input
                inputMode="numeric"
                value={dailyRate}
                onChange={(e) => setDailyRate(e.target.value)}
              />
            </Field>
            <Field label="Durée (jours)">
              <Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
            </Field>
            <Field label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}

      {enriched.length === 0 ? (
        <EmptyState
          title="Aucune location"
          description="Créez un contrat pour outils, échafaudage, etc."
        />
      ) : (
        <ul className="space-y-2">
          {enriched.map((c) => {
            const daysOut = Math.max(
              1,
              Math.ceil((Math.min(c.returnedAt ?? now, now) - c.startAt) / (24 * 60 * 60 * 1000)),
            )
            const rent = daysOut * c.dailyRateTTC
            return (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2.5"
              >
                <div>
                  <p className="text-[13px] font-semibold">
                    {c.reference} · {c.customerName}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {c.lines.map((l) => `${l.productName} ×${l.qty}`).join(', ')} · retour prévu{' '}
                    {new Date(c.dueBackAt).toLocaleDateString('fr-FR')}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    Caution {formatFCFA(c.depositTTC)} · location estimée {formatFCFA(rent)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={statusTone(c.status)}>{statusLabel(c.status)}</Badge>
                  {canManage && (c.status === 'active' || c.status === 'overdue') ? (
                    <Button size="sm" onClick={() => void markReturned(c)}>
                      Retour
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
