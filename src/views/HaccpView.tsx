import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { HaccpLog, HaccpLogKind } from '../db/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { Switch } from '../ui/Switch'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { IconCheckCircle } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

type Filter = 'today' | 'alerts' | 'all'

const KIND_LABEL: Record<HaccpLogKind, string> = {
  temperature: 'Température',
  cleaning: 'Nettoyage',
  reception: 'Réception',
}

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function HaccpView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId, activeStore } = useActiveStore()
  const logs =
    useLiveQuery(
      () => db.haccpLogs.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [kind, setKind] = useState<HaccpLogKind>('temperature')
  const [label, setLabel] = useState('Frigo 1')
  const [value, setValue] = useState('4')
  const [ok, setOk] = useState(true)
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('today')

  const today = todayYmd()
  const todayLogs = useMemo(
    () => logs.filter((l) => l.dateYmd === today),
    [logs, today],
  )
  const alerts = logs.filter((l) => !l.ok)
  const todayAlerts = todayLogs.filter((l) => !l.ok).length

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...logs]
      .filter((l) => {
        if (filter === 'today') return l.dateYmd === today
        if (filter === 'alerts') return !l.ok
        return true
      })
      .filter((l) => {
        if (!q) return true
        return (
          l.label.toLowerCase().includes(q) ||
          KIND_LABEL[l.kind].toLowerCase().includes(q) ||
          (l.notes?.toLowerCase().includes(q) ?? false) ||
          (l.value?.toLowerCase().includes(q) ?? false)
        )
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 120)
  }, [logs, filter, search, today])

  const create = async () => {
    if (!canManage) return
    if (!label.trim()) {
      toast.error('Libellé requis')
      return
    }
    const row: HaccpLog = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      kind,
      dateYmd: today,
      label: label.trim(),
      value: value.trim() || undefined,
      ok,
      notes: notes.trim() || undefined,
      createdAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.haccpLogs.add(row)
    setNotes('')
    toast.success('Contrôle enregistré', row.label)
  }

  const remove = async (row: HaccpLog) => {
    if (!canManage) return
    await db.haccpLogs.delete(row.id)
    toast.info('Contrôle retiré', row.label)
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconCheckCircle />}
        eyebrow={`Magasin · ${activeStore?.name ?? '—'}`}
        title="Hygiène HACCP"
        subtitle="Températures, nettoyage et réceptions — traçabilité du jour"
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Kpi
          label="Contrôles du jour"
          value={String(todayLogs.length)}
          tone="accent"
        />
        <Kpi label="Écarts du jour" value={String(todayAlerts)} tone="amber" />
        <Kpi label="Écarts totaux" value={String(alerts.length)} tone="rose" />
      </div>
      {canManage ? (
        <FormPanel
          eyebrow="Traçabilité"
          title="Nouveau contrôle"
          description="Température, nettoyage ou réception — conforme ou écart."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Enregistrer
            </Button>
          }
        >
          <FormGrid>
            <Field label="Type">
              <Select
                value={kind}
                onChange={(e) => setKind(e.target.value as HaccpLogKind)}
              >
                {(Object.keys(KIND_LABEL) as HaccpLogKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Point de contrôle" required>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
            <Field label="Valeur (ex. °C)">
              <Input value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
            <Field label="Notes">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Switch
                checked={ok}
                onChange={(e) => setOk(e.target.checked)}
                label="Conforme"
              />
            </div>
          </FormGrid>
        </FormPanel>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          variant="segmented"
          active={filter}
          onChange={setFilter}
          items={[
            { id: 'today', label: 'Aujourd’hui', count: todayLogs.length },
            { id: 'alerts', label: 'Écarts', count: alerts.length || undefined },
            { id: 'all', label: 'Historique' },
          ]}
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Point, type, note…"
          className="sm:max-w-xs"
        />
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title="Aucun contrôle"
          description="Tracez les relevés HACCP du jour."
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((l) => (
            <li
              key={l.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2"
            >
              <div>
                <p className="text-[13px] font-semibold">
                  {KIND_LABEL[l.kind]} · {l.label}
                </p>
                <p className="text-[11px] text-ink-muted">
                  {l.dateYmd}
                  {l.value ? ` · ${l.value}` : ''}
                  {l.notes ? ` · ${l.notes}` : ''}
                  {l.createdByDisplayName ? ` · ${l.createdByDisplayName}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={l.ok ? 'success' : 'warning'}>
                  {l.ok ? 'Conforme' : 'Écart'}
                </Badge>
                {canManage ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void remove(l)}
                  >
                    Supprimer
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
