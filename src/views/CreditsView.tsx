import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { CreditSchedule, CreditScheduleStatus } from '../db/types'
import {
  customerCreditBalance,
  customerCreditLimit,
  recordCustomerCreditPayment,
} from '../lib/customerCredit'
import { formatFCFA } from '../lib/money'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconCash } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

function statusLabel(s: CreditScheduleStatus): string {
  switch (s) {
    case 'open':
      return 'Ouvert'
    case 'partial':
      return 'Partiel'
    case 'paid':
      return 'Soldé'
    case 'overdue':
      return 'En retard'
    case 'cancelled':
      return 'Annulé'
    default: {
      const _e: never = s
      return _e
    }
  }
}

function statusTone(
  s: CreditScheduleStatus,
): 'neutral' | 'warning' | 'success' | 'danger' | 'info' {
  switch (s) {
    case 'open':
      return 'info'
    case 'partial':
      return 'warning'
    case 'paid':
      return 'success'
    case 'overdue':
      return 'danger'
    case 'cancelled':
      return 'neutral'
    default: {
      const _e: never = s
      return _e
    }
  }
}

function deriveStatus(row: CreditSchedule, now: number): CreditScheduleStatus {
  if (row.status === 'cancelled' || row.status === 'paid') return row.status
  const remaining = Math.max(0, row.amountTTC - row.paidTTC)
  if (remaining <= 0) return 'paid'
  if (row.dueDate < now) return 'overdue'
  if (row.paidTTC > 0) return 'partial'
  return 'open'
}

export function CreditsView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const now = Date.now()
  const customers =
    useLiveQuery(() => db.loyaltyCustomers.toArray(), [], []) ?? []
  const schedules =
    useLiveQuery(
      () =>
        db.creditSchedules.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []

  const [customerId, setCustomerId] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDays, setDueDays] = useState('30')
  const [notes, setNotes] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payCustomerId, setPayCustomerId] = useState('')

  const withBalance = useMemo(
    () =>
      customers
        .filter((c) => !c.archived)
        .map((c) => ({
          ...c,
          balance: customerCreditBalance(c),
          limit: customerCreditLimit(c),
        }))
        .sort((a, b) => b.balance - a.balance),
    [customers],
  )

  const enriched = useMemo(
    () =>
      schedules
        .map((s) => ({ ...s, status: deriveStatus(s, now) }))
        .sort((a, b) => a.dueDate - b.dueDate),
    [schedules, now],
  )

  const totalOpen = enriched
    .filter((s) => s.status !== 'paid' && s.status !== 'cancelled')
    .reduce((m, s) => m + Math.max(0, s.amountTTC - s.paidTTC), 0)
  const overdueCount = enriched.filter((s) => s.status === 'overdue').length

  const createSchedule = async () => {
    if (!canManage) return
    const customer = customers.find((c) => c.id === customerId)
    if (!customer) {
      toast.error('Sélectionnez un client')
      return
    }
    const amountTTC = Math.round(Number(amount))
    const days = Math.max(1, Math.round(Number(dueDays) || 30))
    if (!Number.isFinite(amountTTC) || amountTTC <= 0) {
      toast.error('Montant invalide')
      return
    }
    const row: CreditSchedule = {
      id: crypto.randomUUID(),
      customerId: customer.id,
      customerName: customer.displayName || 'Client',
      customerPhone: customer.phone,
      storeId: activeStoreId,
      amountTTC,
      paidTTC: 0,
      dueDate: Date.now() + days * 24 * 60 * 60 * 1000,
      status: 'open',
      notes: notes.trim() || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.creditSchedules.add(row)
    setAmount('')
    setNotes('')
    toast.success('Échéance créée', formatFCFA(amountTTC))
  }

  const recordPayment = async () => {
    if (!canManage || !payCustomerId) return
    try {
      await recordCustomerCreditPayment({
        customerId: payCustomerId,
        amountTTC: Math.round(Number(payAmount)),
        actor: { profileId: actor.id, displayName: actor.displayName },
        storeId: activeStoreId,
      })
      const open = enriched.filter(
        (s) =>
          s.customerId === payCustomerId &&
          s.status !== 'paid' &&
          s.status !== 'cancelled',
      )
      let remaining = Math.round(Number(payAmount))
      for (const s of open) {
        if (remaining <= 0) break
        const due = Math.max(0, s.amountTTC - s.paidTTC)
        const apply = Math.min(due, remaining)
        const paidTTC = s.paidTTC + apply
        const status: CreditScheduleStatus =
          paidTTC >= s.amountTTC ? 'paid' : 'partial'
        await db.creditSchedules.update(s.id, {
          paidTTC,
          status,
          updatedAt: Date.now(),
        })
        remaining -= apply
      }
      setPayAmount('')
      toast.success('Règlement enregistré')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec règlement')
    }
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconCash />}
        title="Crédits clients"
        subtitle="Encours, échéances et règlements (livre)"
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Kpi label="Encours échéances" value={formatFCFA(totalOpen)} tone="amber" />
        <Kpi label="En retard" value={String(overdueCount)} tone="rose" />
        <Kpi
          label="Clients à crédit"
          value={String(withBalance.filter((c) => c.balance > 0).length)}
          tone="neutral"
        />
      </div>

      {canManage ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-3">
              <p className="text-[13px] font-semibold">Nouvelle échéance</p>
              <Field label="Client">
                <Select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  <option value="">— Choisir —</option>
                  {withBalance.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName} ({c.phone})
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Montant (FCFA)">
                  <Input
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </Field>
                <Field label="Délai (jours)">
                  <Input
                    inputMode="numeric"
                    value={dueDays}
                    onChange={(e) => setDueDays(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Note">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              <Button onClick={() => void createSchedule()}>Créer</Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3">
              <p className="text-[13px] font-semibold">Encaisser un règlement</p>
              <Field label="Client">
                <Select
                  value={payCustomerId}
                  onChange={(e) => setPayCustomerId(e.target.value)}
                >
                  <option value="">— Choisir —</option>
                  {withBalance
                    .filter((c) => c.balance > 0)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.displayName} — {formatFCFA(c.balance)}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Montant (FCFA)">
                <Input
                  inputMode="numeric"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </Field>
              <Button variant="accent" onClick={() => void recordPayment()}>
                Enregistrer le paiement
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {enriched.length === 0 ? (
        <EmptyState title="Aucune échéance" description="Créez une échéance pour suivre les dettes clients." />
      ) : (
        <ul className="space-y-2">
          {enriched.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2.5"
            >
              <div>
                <p className="text-[13px] font-semibold text-ink">{s.customerName}</p>
                <p className="text-[11px] text-ink-muted">
                  Échéance {new Date(s.dueDate).toLocaleDateString('fr-FR')} · reste{' '}
                  {formatFCFA(Math.max(0, s.amountTTC - s.paidTTC))}
                </p>
              </div>
              <Badge tone={statusTone(s.status)}>{statusLabel(s.status)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
