import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { CompoundingOrder } from '../db/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconLayers } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function MagistralesView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const rows =
    useLiveQuery(
      () =>
        db.compoundingOrders.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [patientName, setPatientName] = useState('')
  const [formula, setFormula] = useState('')
  const [prescriberName, setPrescriberName] = useState('')
  const [dueYmd, setDueYmd] = useState(todayYmd)

  const queued = useMemo(
    () => rows.filter((r) => r.status === 'queued' || r.status === 'prepared'),
    [rows],
  )

  const create = async () => {
    if (!canManage) return
    if (!patientName.trim() || !formula.trim()) {
      toast.error('Patient et formule requis')
      return
    }
    const row: CompoundingOrder = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      status: 'queued',
      patientName: patientName.trim(),
      formula: formula.trim(),
      prescriberName: prescriberName.trim() || undefined,
      dueYmd,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.compoundingOrders.add(row)
    setPatientName('')
    setFormula('')
    setPrescriberName('')
    toast.success('Préparation en file', row.patientName)
  }

  const prepare = async (id: string) => {
    if (!canManage) return
    await db.compoundingOrders.update(id, {
      status: 'prepared',
      updatedAt: Date.now(),
    })
  }

  const dispense = async (id: string) => {
    if (!canManage) return
    await db.compoundingOrders.update(id, {
      status: 'dispensed',
      updatedAt: Date.now(),
    })
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconLayers />}
        title="Préparations magistrales"
        subtitle="Formules, file officine et délivrance"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Kpi label="En atelier" value={String(queued.length)} tone="sky" />
        <Kpi label="Dossiers" value={String(rows.length)} tone="accent" />
      </div>
      {canManage ? (
        <FormPanel
          eyebrow="Officine"
          title="Nouvelle magistrale"
          description="Formule, patient et échéance de délivrance."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Mettre en préparation
            </Button>
          }
        >
          <FormGrid>
            <Field label="Patient">
              <Input
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
              />
            </Field>
            <Field label="Prescripteur">
              <Input
                value={prescriberName}
                onChange={(e) => setPrescriberName(e.target.value)}
              />
            </Field>
            <Field label="Formule">
              <Input
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
              />
            </Field>
            <Field label="Échéance">
              <Input
                type="date"
                value={dueYmd}
                onChange={(e) => setDueYmd(e.target.value)}
              />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title="Aucune magistrale"
          description="File des préparations sur ordonnance."
        />
      ) : (
        <ul className="space-y-2">
          {[...rows]
            .sort((a, b) => a.dueYmd.localeCompare(b.dueYmd))
            .map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2"
              >
                <div>
                  <p className="text-[13px] font-semibold">{r.patientName}</p>
                  <p className="text-[11px] text-ink-muted">
                    {r.formula}
                    {r.prescriberName ? ` · ${r.prescriberName}` : ''} · {r.dueYmd}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      r.status === 'dispensed'
                        ? 'success'
                        : r.status === 'prepared'
                          ? 'accent'
                          : 'warning'
                    }
                  >
                    {r.status === 'queued'
                      ? 'File'
                      : r.status === 'prepared'
                        ? 'Prête'
                        : 'Délivrée'}
                  </Badge>
                  {canManage && r.status === 'queued' ? (
                    <Button size="sm" onClick={() => void prepare(r.id)}>
                      Préparer
                    </Button>
                  ) : null}
                  {canManage && r.status === 'prepared' ? (
                    <Button size="sm" onClick={() => void dispense(r.id)}>
                      Délivrer
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
