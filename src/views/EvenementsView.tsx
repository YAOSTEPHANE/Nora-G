import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { VenueEvent, VenueEventStatus } from '../db/types'
import { formatFCFA } from '../lib/money'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconStar } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

const STATUS: Record<VenueEventStatus, string> = {
  inquiry: 'Demande',
  confirmed: 'Confirmé',
  done: 'Réalisé',
  cancelled: 'Annulé',
}

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function EvenementsView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const rows =
    useLiveQuery(
      () => db.venueEvents.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [title, setTitle] = useState('')
  const [clientName, setClientName] = useState('')
  const [phone, setPhone] = useState('')
  const [covers, setCovers] = useState('20')
  const [dateYmd, setDateYmd] = useState(todayYmd)
  const [budget, setBudget] = useState('')

  const pipeline = useMemo(
    () => rows.filter((r) => r.status === 'inquiry' || r.status === 'confirmed'),
    [rows],
  )

  const create = async () => {
    if (!canManage) return
    const n = Number(covers)
    let budgetTTC: number | undefined
    const raw = budget.replace(/\s/g, '').trim()
    if (raw) {
      budgetTTC = Math.round(Number(raw))
      if (!Number.isFinite(budgetTTC) || budgetTTC < 0) {
        toast.error('Budget invalide')
        return
      }
    }
    if (!title.trim() || !clientName.trim() || !Number.isFinite(n) || n <= 0) {
      toast.error('Événement, client et couverts requis')
      return
    }
    const row: VenueEvent = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      status: 'inquiry',
      title: title.trim(),
      clientName: clientName.trim(),
      clientPhone: phone.trim() || undefined,
      covers: n,
      dateYmd,
      budgetTTC,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.venueEvents.add(row)
    setTitle('')
    setClientName('')
    setPhone('')
    toast.success('Demande enregistrée', row.title)
  }

  const confirm = async (id: string) => {
    if (!canManage) return
    await db.venueEvents.update(id, { status: 'confirmed', updatedAt: Date.now() })
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconStar />}
        title="Événements"
        subtitle="Privatisations, traiteur, banquet"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Kpi label="Pipeline" value={String(pipeline.length)} tone="violet" />
        <Kpi label="Dossiers" value={String(rows.length)} tone="accent" />
      </div>
      {canManage ? (
        <FormPanel
          eyebrow="Traiteur"
          title="Nouvelle demande"
          description="Privatisation, couverts, date et budget."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Nouvelle demande
            </Button>
          }
        >
          <FormGrid>
            <Field label="Événement">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Client">
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            </Field>
            <Field label="Téléphone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Couverts">
              <Input value={covers} onChange={(e) => setCovers(e.target.value)} />
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={dateYmd}
                onChange={(e) => setDateYmd(e.target.value)}
              />
            </Field>
            <Field label="Budget (opt.)">
              <Input value={budget} onChange={(e) => setBudget(e.target.value)} />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title="Aucun événement"
          description="Mariages, séminaires, afterworks."
        />
      ) : (
        <ul className="space-y-2">
          {[...rows]
            .sort((a, b) => a.dateYmd.localeCompare(b.dateYmd))
            .map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2"
              >
                <div>
                  <p className="text-[13px] font-semibold">{r.title}</p>
                  <p className="text-[11px] text-ink-muted">
                    {r.clientName} · {r.covers} couverts · {r.dateYmd}
                    {r.budgetTTC != null ? ` · ${formatFCFA(r.budgetTTC)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      r.status === 'confirmed'
                        ? 'success'
                        : r.status === 'inquiry'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {STATUS[r.status]}
                  </Badge>
                  {canManage && r.status === 'inquiry' ? (
                    <Button size="sm" onClick={() => void confirm(r.id)}>
                      Confirmer
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
