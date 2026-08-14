import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { Layaway } from '../db/types'
import { formatFCFA } from '../lib/money'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconArchive } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

function plusDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function refGen(): string {
  return `MC-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
}

export function MisesDeCoteView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const rows =
    useLiveQuery(
      () => db.layaways.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [itemLabel, setItemLabel] = useState('')
  const [total, setTotal] = useState('')
  const [deposit, setDeposit] = useState('')

  const open = useMemo(() => rows.filter((r) => r.status === 'open'), [rows])
  const held = open.reduce((m, r) => m + r.depositTTC, 0)

  const create = async () => {
    if (!canManage) return
    const totalTTC = Math.round(Number(total.replace(/\s/g, '')))
    const depositTTC = Math.round(Number(deposit.replace(/\s/g, '')))
    if (!customerName.trim() || !itemLabel.trim()) {
      toast.error('Client et article requis')
      return
    }
    if (
      !Number.isFinite(totalTTC) ||
      totalTTC <= 0 ||
      !Number.isFinite(depositTTC) ||
      depositTTC < 0 ||
      depositTTC > totalTTC
    ) {
      toast.error('Montants invalides')
      return
    }
    const row: Layaway = {
      id: crypto.randomUUID(),
      reference: refGen(),
      storeId: activeStoreId,
      status: 'open',
      customerName: customerName.trim(),
      customerPhone: phone.trim() || undefined,
      itemLabel: itemLabel.trim(),
      totalTTC,
      depositTTC,
      dueYmd: plusDays(14),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.layaways.add(row)
    setCustomerName('')
    setPhone('')
    setItemLabel('')
    setTotal('')
    setDeposit('')
    toast.success('Mise de côté', row.reference)
  }

  const collect = async (id: string) => {
    if (!canManage) return
    await db.layaways.update(id, { status: 'collected', updatedAt: Date.now() })
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconArchive />}
        title="Mises de côté"
        subtitle="Acomptes, échéance 14 jours, retrait magasin"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Kpi label="Ouvertes" value={String(open.length)} tone="accent" />
        <Kpi label="Acomptes" value={formatFCFA(held)} tone="violet" />
      </div>
      {canManage ? (
        <FormPanel
          eyebrow="Réservation"
          title="Mettre de côté"
          description="Acompte, article et échéance de retrait."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Réserver
            </Button>
          }
        >
          <FormGrid>
            <Field label="Client">
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </Field>
            <Field label="Téléphone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Article">
              <Input
                value={itemLabel}
                onChange={(e) => setItemLabel(e.target.value)}
              />
            </Field>
            <Field label="Prix TTC">
              <Input value={total} onChange={(e) => setTotal(e.target.value)} />
            </Field>
            <Field label="Acompte" className="sm:col-span-2">
              <Input
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
              />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title="Aucune mise de côté"
          description="Idéal pour la mode, le gros et la quincaillerie."
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
                    {r.reference} · {r.itemLabel}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {r.customerName} · acompte {formatFCFA(r.depositTTC)} /{' '}
                    {formatFCFA(r.totalTTC)} · jusqu’au {r.dueYmd}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={r.status === 'open' ? 'warning' : 'success'}>
                    {r.status === 'open' ? 'En attente' : 'Retirée'}
                  </Badge>
                  {canManage && r.status === 'open' ? (
                    <Button size="sm" onClick={() => void collect(r.id)}>
                      Remettre
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
