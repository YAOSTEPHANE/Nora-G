import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type {
  CustomerSubscription,
  CustomerSubscriptionStatus,
  SubscriptionCycle,
} from '../db/types'
import { formatFCFA } from '../lib/money'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { IconStar } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

type Filter = 'due' | 'active' | 'all'

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addCycle(ymd: string, cycle: SubscriptionCycle): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1)
  if (cycle === 'weekly') dt.setDate(dt.getDate() + 7)
  else dt.setMonth(dt.getMonth() + 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function statusLabel(s: CustomerSubscriptionStatus): string {
  switch (s) {
    case 'active':
      return 'Actif'
    case 'paused':
      return 'En pause'
    case 'expired':
      return 'Expiré'
    case 'cancelled':
      return 'Annulé'
    default: {
      const _e: never = s
      return _e
    }
  }
}

function statusTone(
  s: CustomerSubscriptionStatus,
): 'success' | 'warning' | 'neutral' | 'danger' {
  switch (s) {
    case 'active':
      return 'success'
    case 'paused':
      return 'warning'
    case 'expired':
      return 'danger'
    case 'cancelled':
      return 'neutral'
    default: {
      const _e: never = s
      return _e
    }
  }
}

export function AbonnementsView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId, activeStore } = useActiveStore()
  const rows =
    useLiveQuery(
      () =>
        db.customerSubscriptions.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [planLabel, setPlanLabel] = useState('Forfait mensuel')
  const [amount, setAmount] = useState('15000')
  const [cycle, setCycle] = useState<SubscriptionCycle>('monthly')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('due')

  const today = todayYmd()
  const active = useMemo(
    () => rows.filter((r) => r.status === 'active'),
    [rows],
  )
  const dueSoon = useMemo(
    () => active.filter((r) => r.nextDueYmd <= today),
    [active, today],
  )
  const mrr = active
    .filter((r) => r.cycle === 'monthly')
    .reduce((m, r) => m + r.amountTTC, 0)
  const weekly = active
    .filter((r) => r.cycle === 'weekly')
    .reduce((m, r) => m + r.amountTTC, 0)

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...rows]
      .filter((r) => {
        if (filter === 'due') return r.status === 'active' && r.nextDueYmd <= today
        if (filter === 'active') return r.status === 'active'
        return true
      })
      .filter((r) => {
        if (!q) return true
        return (
          r.customerName.toLowerCase().includes(q) ||
          r.planLabel.toLowerCase().includes(q) ||
          (r.customerPhone?.includes(q) ?? false)
        )
      })
      .sort((a, b) => a.nextDueYmd.localeCompare(b.nextDueYmd))
  }, [rows, filter, search, today])

  const create = async () => {
    if (!canManage) return
    const amt = Math.round(Number(amount.replace(/\s/g, '')))
    if (!customerName.trim() || !planLabel.trim()) {
      toast.error('Client et forfait requis')
      return
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Montant invalide')
      return
    }
    const row: CustomerSubscription = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      status: 'active',
      customerName: customerName.trim(),
      customerPhone: phone.trim() || undefined,
      planLabel: planLabel.trim(),
      amountTTC: amt,
      cycle,
      nextDueYmd: addCycle(todayYmd(), cycle),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.customerSubscriptions.add(row)
    setCustomerName('')
    setPhone('')
    toast.success('Abonnement créé', row.planLabel)
  }

  const setStatus = async (id: string, status: CustomerSubscriptionStatus) => {
    if (!canManage) return
    await db.customerSubscriptions.update(id, {
      status,
      updatedAt: Date.now(),
    })
    toast.info('Abonnement', statusLabel(status))
  }

  const markPaid = async (row: CustomerSubscription) => {
    if (!canManage) return
    await db.customerSubscriptions.update(row.id, {
      nextDueYmd: addCycle(row.nextDueYmd, row.cycle),
      status: 'active',
      updatedAt: Date.now(),
    })
    toast.success('Échéance encaissée', formatFCFA(row.amountTTC))
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconStar />}
        eyebrow={`Magasin · ${activeStore?.name ?? '—'}`}
        title="Abonnements"
        subtitle="Forfaits récurrents, prochaines échéances et encaissement"
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Kpi label="Actifs" value={String(active.length)} tone="accent" />
        <Kpi label="À encaisser" value={String(dueSoon.length)} tone="amber" />
        <Kpi
          label="Récurrent"
          value={formatFCFA(mrr + Math.round(weekly * 4.3))}
          hint={weekly > 0 ? `${formatFCFA(mrr)} / mois + hebdo` : 'Mensuel'}
          tone="violet"
        />
      </div>
      {canManage ? (
        <FormPanel
          eyebrow="Récurrent"
          title="Nouvel abonnement"
          description="Forfait, cycle et montant à encaisser."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Créer l’abonnement
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
            <Field label="Forfait" required>
              <Input
                value={planLabel}
                onChange={(e) => setPlanLabel(e.target.value)}
              />
            </Field>
            <Field label="Cycle">
              <Select
                value={cycle}
                onChange={(e) =>
                  setCycle(e.target.value as SubscriptionCycle)
                }
              >
                <option value="weekly">Hebdomadaire</option>
                <option value="monthly">Mensuel</option>
              </Select>
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
            { id: 'due', label: 'À encaisser', count: dueSoon.length },
            { id: 'active', label: 'Actifs', count: active.length },
            { id: 'all', label: 'Tous', count: rows.length },
          ]}
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Client ou forfait…"
          className="sm:max-w-xs"
        />
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title="Aucun abonnement"
          description="Forfaits salon, maintenance IT ou clients gros."
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
                  {r.customerName} · {r.planLabel}
                </p>
                <p className="text-[11px] text-ink-muted">
                  {formatFCFA(r.amountTTC)} /{' '}
                  {r.cycle === 'weekly' ? 'semaine' : 'mois'} · prochain{' '}
                  {r.nextDueYmd}
                  {r.customerPhone ? ` · ${r.customerPhone}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
                {canManage && r.status === 'active' ? (
                  <>
                    <Button size="sm" onClick={() => void markPaid(r)}>
                      Encaisser
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void setStatus(r.id, 'paused')}
                    >
                      Pause
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void setStatus(r.id, 'cancelled')}
                    >
                      Résilier
                    </Button>
                  </>
                ) : null}
                {canManage && r.status === 'paused' ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => void setStatus(r.id, 'active')}
                    >
                      Reprendre
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void setStatus(r.id, 'cancelled')}
                    >
                      Résilier
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
