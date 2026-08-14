import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { DepositSlip, DepositSlipStatus } from '../db/types'
import { formatFCFA } from '../lib/money'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { IconArchive } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

type Filter = 'open' | 'all' | 'closed'

function statusLabel(s: DepositSlipStatus): string {
  switch (s) {
    case 'open':
      return 'Ouverte'
    case 'returned':
      return 'Restituée'
    case 'forfeited':
      return 'Perdue'
    default: {
      const _e: never = s
      return _e
    }
  }
}

function statusTone(s: DepositSlipStatus): 'warning' | 'success' | 'neutral' {
  switch (s) {
    case 'open':
      return 'warning'
    case 'returned':
      return 'success'
    case 'forfeited':
      return 'neutral'
    default: {
      const _e: never = s
      return _e
    }
  }
}

export function ConsignesView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId, activeStore } = useActiveStore()
  const slips =
    useLiveQuery(
      () => db.depositSlips.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [itemLabel, setItemLabel] = useState('Bouteille vide')
  const [qty, setQty] = useState('12')
  const [unit, setUnit] = useState('200')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('open')

  const open = useMemo(() => slips.filter((s) => s.status === 'open'), [slips])
  const float = open.reduce((m, s) => m + s.qty * s.unitDepositTTC, 0)
  const returnedSum = slips
    .filter((s) => s.status === 'returned')
    .reduce((m, s) => m + s.qty * s.unitDepositTTC, 0)

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...slips]
      .filter((s) => {
        if (filter === 'open') return s.status === 'open'
        if (filter === 'closed') return s.status !== 'open'
        return true
      })
      .filter((s) => {
        if (!q) return true
        return (
          s.customerName.toLowerCase().includes(q) ||
          s.itemLabel.toLowerCase().includes(q) ||
          (s.customerPhone?.includes(q) ?? false)
        )
      })
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [slips, filter, search])

  const create = async () => {
    if (!canManage) return
    const q = Number(qty.replace(',', '.'))
    const u = Math.round(Number(unit.replace(/\s/g, '')))
    if (!customerName.trim() || !itemLabel.trim()) {
      toast.error('Client et article requis')
      return
    }
    if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(u) || u < 0) {
      toast.error('Quantité ou caution invalide')
      return
    }
    const row: DepositSlip = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      status: 'open',
      customerName: customerName.trim(),
      customerPhone: phone.trim() || undefined,
      itemLabel: itemLabel.trim(),
      qty: q,
      unitDepositTTC: u,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.depositSlips.add(row)
    setCustomerName('')
    setPhone('')
    toast.success('Consigne ouverte', `${q} × ${itemLabel.trim()}`)
  }

  const close = async (id: string, status: DepositSlipStatus) => {
    if (!canManage) return
    await db.depositSlips.update(id, {
      status,
      updatedAt: Date.now(),
      returnedAt: Date.now(),
    })
    toast.info(
      status === 'returned' ? 'Caution restituée' : 'Consigne perdue',
      statusLabel(status),
    )
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconArchive />}
        eyebrow={`Magasin · ${activeStore?.name ?? '—'}`}
        title="Consignes"
        subtitle="Cautions bouteilles et emballages — restitution ou perte de caution"
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Kpi label="Ouvertes" value={String(open.length)} tone="amber" />
        <Kpi label="Caution en cours" value={formatFCFA(float)} tone="violet" />
        <Kpi label="Restitué" value={formatFCFA(returnedSum)} tone="accent" />
      </div>
      {canManage ? (
        <FormPanel
          eyebrow="Caution"
          title="Nouvelle consigne"
          description="Emballage, quantité et caution unitaire."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Ouvrir la consigne
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
            <Field label="Article consignable" required>
              <Input
                value={itemLabel}
                onChange={(e) => setItemLabel(e.target.value)}
              />
            </Field>
            <Field label="Quantité">
              <Input
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="font-mono-nums"
              />
            </Field>
            <Field label="Caution unitaire (FCFA)" className="sm:col-span-2">
              <Input
                inputMode="numeric"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
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
            { id: 'open', label: 'Ouvertes', count: open.length },
            { id: 'closed', label: 'Clôturées' },
            { id: 'all', label: 'Toutes', count: slips.length },
          ]}
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Client ou article…"
          className="sm:max-w-xs"
        />
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title="Aucune consigne"
          description="Enregistrez les cautions d’emballages."
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2"
            >
              <div>
                <p className="text-[13px] font-semibold">
                  {s.itemLabel} × {s.qty}
                </p>
                <p className="text-[11px] text-ink-muted">
                  {s.customerName}
                  {s.customerPhone ? ` · ${s.customerPhone}` : ''} ·{' '}
                  {formatFCFA(s.qty * s.unitDepositTTC)}
                  {s.returnedAt
                    ? ` · ${new Date(s.returnedAt).toLocaleDateString('fr-FR')}`
                    : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(s.status)}>{statusLabel(s.status)}</Badge>
                {canManage && s.status === 'open' ? (
                  <>
                    <Button size="sm" onClick={() => void close(s.id, 'returned')}>
                      Restituer
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void close(s.id, 'forfeited')}
                    >
                      Perdue
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
