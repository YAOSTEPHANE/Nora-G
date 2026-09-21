import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { ShrinkageEvent, ShrinkageKind } from '../db/types'
import { formatFCFA } from '../lib/money'
import { appendAuditEvent } from '../lib/auditLog'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconWarning } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

const KIND_LABEL: Record<ShrinkageKind, string> = {
  breakage: 'Casse',
  theft: 'Vol',
  expiry: 'Péremption',
  error: 'Erreur',
}

export function PertesView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const rows =
    useLiveQuery(
      () => db.shrinkageEvents.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [kind, setKind] = useState<ShrinkageKind>('breakage')
  const [productName, setProductName] = useState('')
  const [qty, setQty] = useState('1')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')

  const total = useMemo(
    () => rows.reduce((m, r) => m + r.amountTTC, 0),
    [rows],
  )

  const create = async () => {
    if (!canManage) return
    const q = Number(qty.replace(',', '.'))
    const amountTTC = Math.round(Number(amount.replace(/\s/g, '')))
    if (!productName.trim()) {
      toast.error('Article requis')
      return
    }
    if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(amountTTC) || amountTTC < 0) {
      toast.error('Quantité ou montant invalide')
      return
    }
    const row: ShrinkageEvent = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      kind,
      productName: productName.trim(),
      qty: q,
      amountTTC,
      notes: notes.trim() || undefined,
      createdAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.shrinkageEvents.add(row)
    void appendAuditEvent({
      kind: 'shrinkage',
      actor: { profileId: actor.id, displayName: actor.displayName },
      reason: `${KIND_LABEL[kind]} — ${row.productName}`,
      payload: {
        shrinkageId: row.id,
        storeId: activeStoreId,
        kind,
        productName: row.productName,
        qty: row.qty,
        amountTTC: row.amountTTC,
        notes: row.notes,
      },
    })
    setProductName('')
    setAmount('')
    setNotes('')
    toast.success('Perte enregistrée', KIND_LABEL[kind])
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconWarning />}
        title="Pertes & casse"
        subtitle="Shrink, vols, erreurs de caisse"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Kpi label="Événements" value={String(rows.length)} tone="rose" />
        <Kpi label="Impact" value={formatFCFA(total)} tone="amber" />
      </div>
      {canManage ? (
        <FormPanel
          eyebrow="Shrink"
          title="Déclarer une perte"
          description="Casse, vol, erreur de caisse — impact marge."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Déclarer
            </Button>
          }
        >
          <FormGrid>
            <Field label="Nature">
              <Select
                value={kind}
                onChange={(e) => setKind(e.target.value as ShrinkageKind)}
              >
                {(Object.keys(KIND_LABEL) as ShrinkageKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Article">
              <Input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
              />
            </Field>
            <Field label="Qté">
              <Input value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Field label="Valeur (FCFA)">
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title="Aucune perte"
          description="Tracez la casse pour protéger la marge."
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
                    {r.productName} × {r.qty}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {formatFCFA(r.amountTTC)}
                    {r.notes ? ` · ${r.notes}` : ''}
                  </p>
                </div>
                <Badge tone="warning">{KIND_LABEL[r.kind]}</Badge>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
