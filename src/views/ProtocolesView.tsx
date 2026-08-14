import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { CareProtocol } from '../db/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconFile } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

export function ProtocolesView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const rows =
    useLiveQuery(
      () => db.careProtocols.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [clientName, setClientName] = useState('')
  const [phone, setPhone] = useState('')
  const [protocolLabel, setProtocolLabel] = useState('Cure éclat 6 séances')
  const [sessionsTotal, setSessionsTotal] = useState('6')

  const active = useMemo(
    () => rows.filter((r) => r.status === 'active'),
    [rows],
  )

  const create = async () => {
    if (!canManage) return
    const n = Number(sessionsTotal)
    if (!clientName.trim() || !protocolLabel.trim() || !Number.isFinite(n) || n <= 0) {
      toast.error('Client, protocole et séances requis')
      return
    }
    const row: CareProtocol = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      status: 'active',
      clientName: clientName.trim(),
      clientPhone: phone.trim() || undefined,
      protocolLabel: protocolLabel.trim(),
      sessionsDone: 0,
      sessionsTotal: n,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.careProtocols.add(row)
    setClientName('')
    setPhone('')
    toast.success('Protocole ouvert', row.protocolLabel)
  }

  const session = async (row: CareProtocol) => {
    if (!canManage) return
    const sessionsDone = row.sessionsDone + 1
    await db.careProtocols.update(row.id, {
      sessionsDone,
      status: sessionsDone >= row.sessionsTotal ? 'completed' : 'active',
      updatedAt: Date.now(),
    })
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconFile />}
        title="Protocoles de soins"
        subtitle="Cures, séances et suivi cabine"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Kpi label="Cures actives" value={String(active.length)} tone="violet" />
        <Kpi label="Dossiers" value={String(rows.length)} tone="accent" />
      </div>
      {canManage ? (
        <FormPanel
          eyebrow="Cabine"
          title="Ouvrir un protocole"
          description="Cure multi-séances, cliente et suivi."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Ouvrir la cure
            </Button>
          }
        >
          <FormGrid>
            <Field label="Cliente">
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            </Field>
            <Field label="Téléphone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Protocole">
              <Input
                value={protocolLabel}
                onChange={(e) => setProtocolLabel(e.target.value)}
              />
            </Field>
            <Field label="Séances">
              <Input
                value={sessionsTotal}
                onChange={(e) => setSessionsTotal(e.target.value)}
              />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title="Aucun protocole"
          description="Suivez les cures multi-séances du salon."
        />
      ) : (
        <ul className="space-y-2">
          {[...rows]
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2"
              >
                <div>
                  <p className="text-[13px] font-semibold">
                    {r.clientName} · {r.protocolLabel}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {r.sessionsDone}/{r.sessionsTotal} séances
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={r.status === 'completed' ? 'success' : 'accent'}>
                    {r.status === 'completed' ? 'Terminé' : 'En cours'}
                  </Badge>
                  {canManage && r.status === 'active' ? (
                    <Button size="sm" onClick={() => void session(r)}>
                      Séance
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
