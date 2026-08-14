import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { DeliveryRider, DeliveryRun, DeliveryRunStatus } from '../db/types'
import { formatFCFA } from '../lib/money'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { IconTruck } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

function statusLabel(s: DeliveryRunStatus): string {
  switch (s) {
    case 'pending':
      return 'En attente'
    case 'assigned':
      return 'Assigné'
    case 'picked_up':
      return 'En route'
    case 'delivered':
      return 'Livré'
    case 'failed':
      return 'Échec'
    case 'cancelled':
      return 'Annulé'
    default: {
      const _e: never = s
      return _e
    }
  }
}

function statusTone(
  s: DeliveryRunStatus,
): 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'accent' {
  switch (s) {
    case 'pending':
      return 'neutral'
    case 'assigned':
      return 'info'
    case 'picked_up':
      return 'accent'
    case 'delivered':
      return 'success'
    case 'failed':
      return 'danger'
    case 'cancelled':
      return 'warning'
    default: {
      const _e: never = s
      return _e
    }
  }
}

const PIPELINE: DeliveryRunStatus[] = [
  'pending',
  'assigned',
  'picked_up',
  'delivered',
]

export function LivraisonsView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const [tab, setTab] = useState<'courses' | 'livreurs'>('courses')
  const riders =
    useLiveQuery(
      () => db.deliveryRiders.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const runs =
    useLiveQuery(
      () => db.deliveryRuns.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []

  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [fee, setFee] = useState('')
  const [riderName, setRiderName] = useState('')
  const [riderPhone, setRiderPhone] = useState('')

  const openRuns = useMemo(
    () =>
      runs
        .filter((r) => r.status !== 'delivered' && r.status !== 'cancelled')
        .sort((a, b) => b.createdAt - a.createdAt),
    [runs],
  )

  const addRider = async () => {
    if (!canManage || !riderName.trim()) return
    const row: DeliveryRider = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      name: riderName.trim(),
      phone: riderPhone.trim() || undefined,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await db.deliveryRiders.add(row)
    setRiderName('')
    setRiderPhone('')
    toast.success('Livreur ajouté')
  }

  const createRun = async () => {
    if (!canManage) return
    if (!customerName.trim() || !address.trim()) {
      toast.error('Client et adresse requis')
      return
    }
    const row: DeliveryRun = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      customerName: customerName.trim(),
      customerPhone: phone.trim() || undefined,
      address: address.trim(),
      status: 'pending',
      feeTTC: fee.trim() ? Math.round(Number(fee)) : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.deliveryRuns.add(row)
    setCustomerName('')
    setPhone('')
    setAddress('')
    setFee('')
    toast.success('Course créée')
  }

  const assignRider = async (run: DeliveryRun, riderId: string) => {
    if (!canManage) return
    const rider = riders.find((r) => r.id === riderId)
    if (!rider) return
    await db.deliveryRuns.update(run.id, {
      riderId: rider.id,
      riderName: rider.name,
      status: 'assigned',
      assignedAt: Date.now(),
      updatedAt: Date.now(),
    })
  }

  const advance = async (run: DeliveryRun) => {
    if (!canManage) return
    const idx = PIPELINE.indexOf(run.status as (typeof PIPELINE)[number])
    if (idx < 0 || idx >= PIPELINE.length - 1) return
    const next = PIPELINE[idx + 1]!
    await db.deliveryRuns.update(run.id, {
      status: next,
      deliveredAt: next === 'delivered' ? Date.now() : run.deliveredAt,
      updatedAt: Date.now(),
    })
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconTruck />}
        title="Livraisons"
        subtitle="Livreurs et suivi des courses"
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Kpi label="Courses ouvertes" value={String(openRuns.length)} tone="accent" />
        <Kpi
          label="Livreurs actifs"
          value={String(riders.filter((r) => r.active).length)}
          tone="neutral"
        />
        <Kpi
          label="Livrées"
          value={String(runs.filter((r) => r.status === 'delivered').length)}
          tone="violet"
        />
      </div>

      <Tabs
        variant="segmented"
        active={tab}
        onChange={setTab}
        items={[
          { id: 'courses', label: 'Courses', count: openRuns.length || undefined },
          { id: 'livreurs', label: 'Livreurs', count: riders.length || undefined },
        ]}
      />

      {tab === 'livreurs' ? (
        <div className="space-y-3">
          {canManage ? (
            <FormPanel
              eyebrow="Équipe"
              title="Ajouter un livreur"
              description="Nom et téléphone pour dispatcher les courses."
              actions={<Button onClick={() => void addRider()}>Ajouter</Button>}
            >
              <FormGrid>
                <Field label="Nom">
                  <Input value={riderName} onChange={(e) => setRiderName(e.target.value)} />
                </Field>
                <Field label="Téléphone">
                  <Input value={riderPhone} onChange={(e) => setRiderPhone(e.target.value)} />
                </Field>
              </FormGrid>
            </FormPanel>
          ) : null}
          {riders.length === 0 ? (
            <EmptyState title="Aucun livreur" description="Ajoutez un livreur pour assigner les courses." />
          ) : (
            <ul className="space-y-2">
              {riders.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-xl border border-border/70 bg-white px-3 py-2"
                >
                  <div>
                    <p className="text-[13px] font-semibold">{r.name}</p>
                    <p className="text-[11px] text-ink-muted">{r.phone || '—'}</p>
                  </div>
                  <Badge tone={r.active ? 'success' : 'neutral'}>
                    {r.active ? 'Actif' : 'Inactif'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {canManage ? (
            <FormPanel
              eyebrow="Course"
              title="Créer une livraison"
              description="Client, adresse et frais de course."
              actions={
                <Button variant="accent" onClick={() => void createRun()}>
                  Créer la course
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
                <Field label="Adresse" className="sm:col-span-2">
                  <Textarea value={address} onChange={(e) => setAddress(e.target.value)} />
                </Field>
                <Field label="Frais livraison (FCFA)" className="sm:col-span-2">
                  <Input inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} />
                </Field>
              </FormGrid>
            </FormPanel>
          ) : null}
          {openRuns.length === 0 ? (
            <EmptyState title="Aucune course ouverte" description="Créez une livraison à dispatcher." />
          ) : (
            <ul className="space-y-2">
              {openRuns.map((run) => (
                <li
                  key={run.id}
                  className="space-y-2 rounded-xl border border-border/70 bg-white px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-semibold">{run.customerName}</p>
                      <p className="text-[11px] text-ink-muted">{run.address}</p>
                      {run.feeTTC != null ? (
                        <p className="text-[11px] text-ink-muted">
                          Frais {formatFCFA(run.feeTTC)}
                        </p>
                      ) : null}
                    </div>
                    <Badge tone={statusTone(run.status)}>{statusLabel(run.status)}</Badge>
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      {run.status === 'pending' ? (
                        <Select
                          value=""
                          onChange={(e) => void assignRider(run, e.target.value)}
                        >
                          <option value="">Assigner un livreur…</option>
                          {riders
                            .filter((r) => r.active)
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                        </Select>
                      ) : null}
                      {PIPELINE.includes(run.status as (typeof PIPELINE)[number]) &&
                      run.status !== 'delivered' ? (
                        <Button size="sm" onClick={() => void advance(run)}>
                          Avancer
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {run.riderName ? (
                    <p className="text-[11px] text-ink-muted">Livreur : {run.riderName}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
