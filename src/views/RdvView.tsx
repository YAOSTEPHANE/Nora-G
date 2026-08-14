import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { Appointment, AppointmentStatus } from '../db/types'
import { Badge, type BadgeTone } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Textarea } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconPointage } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

function tone(s: AppointmentStatus): BadgeTone {
  switch (s) {
    case 'booked':
      return 'info'
    case 'confirmed':
      return 'accent'
    case 'done':
      return 'success'
    case 'no_show':
      return 'warning'
    case 'cancelled':
      return 'danger'
    default: {
      const _e: never = s
      return _e
    }
  }
}

export function RdvView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const rows =
    useLiveQuery(
      () => db.appointments.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [service, setService] = useState('')
  const [staffName, setStaffName] = useState('')
  const [when, setWhen] = useState('')
  const [duration, setDuration] = useState('30')
  const [notes, setNotes] = useState('')

  const upcoming = useMemo(
    () =>
      [...rows]
        .filter((r) => r.status === 'booked' || r.status === 'confirmed')
        .sort((a, b) => a.startAt - b.startAt),
    [rows],
  )

  const book = async () => {
    if (!canManage) return
    if (!name.trim() || !service.trim() || !when) {
      toast.error('Client, service et horaire requis')
      return
    }
    const startAt = Date.parse(when)
    if (!Number.isFinite(startAt)) {
      toast.error('Date invalide')
      return
    }
    const row: Appointment = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      customerName: name.trim(),
      customerPhone: phone.trim() || undefined,
      serviceLabel: service.trim(),
      staffName: staffName.trim() || undefined,
      startAt,
      durationMin: Math.max(5, Math.round(Number(duration) || 30)),
      status: 'booked',
      notes: notes.trim() || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.appointments.add(row)
    setName('')
    setPhone('')
    setService('')
    setNotes('')
    toast.success('RDV créé')
  }

  const setStatus = async (row: Appointment, status: AppointmentStatus) => {
    if (!canManage) return
    await db.appointments.update(row.id, { status, updatedAt: Date.now() })
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconPointage />}
        title="Rendez-vous"
        subtitle="Agenda salon / conseil / services"
      />
      <Kpi label="À venir" value={String(upcoming.length)} tone="accent" />
      {canManage ? (
        <FormPanel
          eyebrow="Agenda"
          title="Réserver un rendez-vous"
          description="Client, service, collaborateur et créneau."
          actions={
            <Button variant="accent" onClick={() => void book()}>
              Réserver
            </Button>
          }
        >
          <FormGrid>
            <Field label="Client">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Téléphone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Service">
              <Input value={service} onChange={(e) => setService(e.target.value)} />
            </Field>
            <Field label="Collaborateur">
              <Input value={staffName} onChange={(e) => setStaffName(e.target.value)} />
            </Field>
            <Field label="Date & heure">
              <Input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </Field>
            <Field label="Durée (min)">
              <Input value={duration} onChange={(e) => setDuration(e.target.value)} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}
      {upcoming.length === 0 ? (
        <EmptyState title="Aucun RDV" description="Planifiez un rendez-vous." />
      ) : (
        <ul className="space-y-2">
          {upcoming.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2"
            >
              <div>
                <p className="text-[13px] font-semibold">
                  {r.customerName} · {r.serviceLabel}
                </p>
                <p className="text-[11px] text-ink-muted">
                  {new Date(r.startAt).toLocaleString('fr-FR')} · {r.durationMin} min
                  {r.staffName ? ` · ${r.staffName}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={tone(r.status)}>{r.status}</Badge>
                {canManage ? (
                  <>
                    <Button size="sm" onClick={() => void setStatus(r, 'confirmed')}>
                      Confirmer
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void setStatus(r, 'done')}>
                      Terminé
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void setStatus(r, 'cancelled')}>
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
