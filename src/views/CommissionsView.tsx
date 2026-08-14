import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { StaffCommission } from '../db/types'
import { formatFCFA } from '../lib/money'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconCash } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

export function CommissionsView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const rows =
    useLiveQuery(
      () => db.staffCommissions.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [staffName, setStaffName] = useState('')
  const [saleLabel, setSaleLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [ratePct, setRatePct] = useState('5')

  const accrued = useMemo(
    () =>
      rows
        .filter((r) => r.status === 'accrued')
        .reduce((m, r) => m + r.commissionTTC, 0),
    [rows],
  )
  const paid = useMemo(
    () =>
      rows
        .filter((r) => r.status === 'paid')
        .reduce((m, r) => m + r.commissionTTC, 0),
    [rows],
  )

  const create = async () => {
    if (!canManage) return
    const amountTTC = Math.round(Number(amount.replace(/\s/g, '')))
    const rate = Number(ratePct.replace(',', '.'))
    if (!staffName.trim() || !saleLabel.trim()) {
      toast.error('Vendeur et vente requis')
      return
    }
    if (!Number.isFinite(amountTTC) || amountTTC <= 0 || !Number.isFinite(rate) || rate < 0) {
      toast.error('Montant ou taux invalide')
      return
    }
    const commissionTTC = Math.round((amountTTC * rate) / 100)
    const row: StaffCommission = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      staffName: staffName.trim(),
      saleLabel: saleLabel.trim(),
      amountTTC,
      ratePct: rate,
      commissionTTC,
      status: 'accrued',
      createdAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.staffCommissions.add(row)
    setSaleLabel('')
    setAmount('')
    toast.success('Commission provisionnée', formatFCFA(commissionTTC))
  }

  const pay = async (id: string) => {
    if (!canManage) return
    await db.staffCommissions.update(id, { status: 'paid', paidAt: Date.now() })
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconCash />}
        title="Commissions"
        subtitle="Provisions vendeurs et règlements"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Kpi label="À verser" value={formatFCFA(accrued)} tone="amber" />
        <Kpi label="Versé" value={formatFCFA(paid)} tone="accent" />
      </div>
      {canManage ? (
        <FormPanel
          eyebrow="Vendeurs"
          title="Provisionner une commission"
          description="CA, taux et dossier à verser."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Provisionner
            </Button>
          }
        >
          <FormGrid>
            <Field label="Vendeur">
              <Input
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
              />
            </Field>
            <Field label="Vente / dossier">
              <Input
                value={saleLabel}
                onChange={(e) => setSaleLabel(e.target.value)}
              />
            </Field>
            <Field label="CA (FCFA)">
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Taux %">
              <Input value={ratePct} onChange={(e) => setRatePct(e.target.value)} />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title="Aucune commission"
          description="Alignez les vendeurs sur le CA réalisé."
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
                    {r.staffName} · {formatFCFA(r.commissionTTC)}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {r.saleLabel} · {r.ratePct}% sur {formatFCFA(r.amountTTC)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={r.status === 'paid' ? 'success' : 'warning'}>
                    {r.status === 'paid' ? 'Versée' : 'Due'}
                  </Badge>
                  {canManage && r.status === 'accrued' ? (
                    <Button size="sm" onClick={() => void pay(r.id)}>
                      Verser
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
