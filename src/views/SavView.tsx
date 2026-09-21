import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { RepairTicket, RepairTicketStatus } from '../db/types'
import { formatFCFA } from '../lib/money'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Textarea } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { Switch } from '../ui/Switch'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { IconAlert } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

function statusLabel(s: RepairTicketStatus): string {
  switch (s) {
    case 'received':
      return 'Réceptionné'
    case 'diagnosing':
      return 'Diagnostic'
    case 'waiting_parts':
      return 'Attente pièces'
    case 'in_progress':
      return 'En cours'
    case 'ready':
      return 'Prêt'
    case 'delivered':
      return 'Livré'
    case 'cancelled':
      return 'Annulé'
    default: {
      const _e: never = s
      return _e
    }
  }
}

function statusTone(
  s: RepairTicketStatus,
): 'neutral' | 'info' | 'warning' | 'accent' | 'success' | 'danger' {
  switch (s) {
    case 'received':
      return 'neutral'
    case 'diagnosing':
      return 'info'
    case 'waiting_parts':
      return 'warning'
    case 'in_progress':
      return 'accent'
    case 'ready':
      return 'success'
    case 'delivered':
      return 'success'
    case 'cancelled':
      return 'danger'
    default: {
      const _e: never = s
      return _e
    }
  }
}

const PIPELINE: RepairTicketStatus[] = [
  'received',
  'diagnosing',
  'waiting_parts',
  'in_progress',
  'ready',
  'delivered',
]

function nextRepairRef(): string {
  return `SAV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 9000) + 1000}`
}

export function SavView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId, activeStore } = useActiveStore()
  const [filter, setFilter] = useState<'open' | 'all' | 'ready'>('open')

  const tickets =
    useLiveQuery(
      () =>
        db.repairTickets
          .where('storeId')
          .equals(activeStoreId)
          .reverse()
          .sortBy('createdAt'),
      [activeStoreId],
      [],
    ) ?? []

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [deviceLabel, setDeviceLabel] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [imei, setImei] = useState('')
  const [issue, setIssue] = useState('')
  const [estimate, setEstimate] = useState('')
  const [warrantyClaim, setWarrantyClaim] = useState(false)
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    if (filter === 'all') return tickets
    if (filter === 'ready') return tickets.filter((t) => t.status === 'ready')
    return tickets.filter(
      (t) => t.status !== 'delivered' && t.status !== 'cancelled',
    )
  }, [tickets, filter])

  const openCount = tickets.filter(
    (t) => t.status !== 'delivered' && t.status !== 'cancelled',
  ).length
  const readyCount = tickets.filter((t) => t.status === 'ready').length

  const createTicket = async () => {
    if (!canManage) return
    if (!customerName.trim()) return toast.error('Client requis', '')
    if (!deviceLabel.trim()) return toast.error('Appareil requis', '')
    if (!issue.trim()) return toast.error('Panne / symptôme requis', '')
    const est = estimate.trim()
      ? Number.parseInt(estimate.replace(/\s/g, ''), 10)
      : undefined
    if (estimate.trim() && (!Number.isFinite(est) || (est ?? 0) < 0)) {
      return toast.error('Devis SAV invalide', '')
    }
    setBusy(true)
    try {
      const now = Date.now()
      const row: RepairTicket = {
        id: crypto.randomUUID(),
        reference: nextRepairRef(),
        storeId: activeStoreId,
        storeName: activeStore?.name,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        deviceLabel: deviceLabel.trim(),
        serialNumber: serialNumber.trim() || undefined,
        imei: imei.trim() || undefined,
        issueDescription: issue.trim(),
        status: 'received',
        estimatedCostTTC: est,
        warrantyClaim,
        createdAt: now,
        updatedAt: now,
        createdByProfileId: actor.id,
        createdByDisplayName: actor.displayName,
      }
      await db.repairTickets.add(row)
      setCustomerName('')
      setCustomerPhone('')
      setDeviceLabel('')
      setSerialNumber('')
      setImei('')
      setIssue('')
      setEstimate('')
      setWarrantyClaim(false)
      toast.success('Ticket SAV créé', row.reference)
    } finally {
      setBusy(false)
    }
  }

  const advance = async (t: RepairTicket) => {
    const idx = PIPELINE.indexOf(t.status)
    if (idx < 0 || idx >= PIPELINE.length - 1) return
    const next = PIPELINE[idx + 1]
    if (!next) return
    const patch: Partial<RepairTicket> = {
      status: next,
      updatedAt: Date.now(),
    }
    if (next === 'ready') patch.readyAt = Date.now()
    if (next === 'delivered') patch.deliveredAt = Date.now()
    await db.repairTickets.update(t.id, patch)
    toast.info('Statut SAV', statusLabel(next))
  }

  const cancel = async (t: RepairTicket) => {
    await db.repairTickets.update(t.id, {
      status: 'cancelled',
      updatedAt: Date.now(),
    })
    toast.info('Ticket annulé', t.reference)
  }

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconAlert />}
        eyebrow={`Magasin · ${activeStore?.name ?? '—'}`}
        title="SAV / Atelier"
        subtitle="Réparations, diagnostic, pièces et restitution (informatique, électroménager…)"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Dossiers ouverts" value={String(openCount)} tone="amber" />
        <Kpi label="Prêts à restituer" value={String(readyCount)} tone="accent" />
        <Kpi label="Total tickets" value={String(tickets.length)} />
      </div>

      {canManage ? (
        <Card>
          <CardContent className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Nouveau ticket</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Client" required>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </Field>
              <Field label="Téléphone">
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </Field>
              <Field label="Appareil" required>
                <Input
                  value={deviceLabel}
                  onChange={(e) => setDeviceLabel(e.target.value)}
                  placeholder="ex. iPhone 12, PC Lenovo…"
                />
              </Field>
              <Field label="N° série">
                <Input
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  className="font-mono-nums"
                />
              </Field>
              <Field label="IMEI">
                <Input
                  value={imei}
                  onChange={(e) => setImei(e.target.value)}
                  className="font-mono-nums"
                />
              </Field>
              <Field label="Devis estimé (FCFA)">
                <Input
                  inputMode="numeric"
                  value={estimate}
                  onChange={(e) => setEstimate(e.target.value)}
                  className="font-mono-nums"
                />
              </Field>
            </div>
            <Field label="Panne / symptôme" required>
              <Textarea
                rows={3}
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
              />
            </Field>
            <label className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-ink-muted">
                Sous garantie constructeur / magasin
              </span>
              <Switch
                checked={warrantyClaim}
                onChange={(e) => setWarrantyClaim(e.target.checked)}
              />
            </label>
            <Button variant="accent" loading={busy} onClick={() => void createTicket()}>
              Créer le ticket
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Tabs
        variant="segmented"
        active={filter}
        onChange={setFilter}
        items={[
          { id: 'open', label: 'Ouverts', count: openCount || undefined },
          { id: 'ready', label: 'Prêts', count: readyCount || undefined },
          { id: 'all', label: 'Tous', count: tickets.length || undefined },
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="Aucun ticket"
          description="Enregistrez les appareils en réparation avec n° série / IMEI."
        />
      ) : (
        <ul className="space-y-3">
          {[...filtered].reverse().map((t) => (
            <li key={t.id} className="rounded-xl border border-border bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink">
                    {t.reference} · {t.deviceLabel}
                  </p>
                  <p className="text-[11px] text-ink-subtle">
                    {t.customerName}
                    {t.customerPhone ? ` · ${t.customerPhone}` : ''} ·{' '}
                    {new Date(t.createdAt).toLocaleString('fr-FR')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {t.warrantyClaim ? <Badge tone="violet">Garantie</Badge> : null}
                  <Badge tone={statusTone(t.status)}>{statusLabel(t.status)}</Badge>
                </div>
              </div>
              <p className="mt-2 text-[12px] text-ink-muted">{t.issueDescription}</p>
              <p className="mt-1 font-mono-nums text-[11px] text-ink-subtle">
                {t.serialNumber ? `S/N ${t.serialNumber}` : ''}
                {t.imei ? ` · IMEI ${t.imei}` : ''}
                {t.estimatedCostTTC != null
                  ? ` · Estimé ${formatFCFA(t.estimatedCostTTC)}`
                  : ''}
              </p>
              {canManage &&
              t.status !== 'delivered' &&
              t.status !== 'cancelled' ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="accent" onClick={() => void advance(t)}>
                    Étape suivante
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void cancel(t)}>
                    Annuler
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
