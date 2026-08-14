import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { BusinessExpense, ExpenseCategory } from '../db/types'
import { formatFCFA } from '../lib/money'
import { saleLocalYmd } from '../lib/salesStats'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconCard } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

const CATEGORIES: { id: ExpenseCategory; label: string }[] = [
  { id: 'transport', label: 'Transport' },
  { id: 'utilities', label: 'Charges / factures' },
  { id: 'supplies', label: 'Fournitures' },
  { id: 'salaries', label: 'Salaires / avances' },
  { id: 'rent', label: 'Loyer' },
  { id: 'other', label: 'Autre' },
]

export function DepensesView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const today = saleLocalYmd(Date.now())
  const rows =
    useLiveQuery(
      () =>
        db.businessExpenses.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [category, setCategory] = useState<ExpenseCategory>('other')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [dateYmd, setDateYmd] = useState(today)
  const [notes, setNotes] = useState('')

  const todayTotal = useMemo(
    () =>
      rows
        .filter((r) => r.dateYmd === today)
        .reduce((m, r) => m + r.amountTTC, 0),
    [rows, today],
  )
  const monthPrefix = today.slice(0, 7)
  const monthTotal = useMemo(
    () =>
      rows
        .filter((r) => r.dateYmd.startsWith(monthPrefix))
        .reduce((m, r) => m + r.amountTTC, 0),
    [rows, monthPrefix],
  )

  const add = async () => {
    if (!canManage) return
    const amountTTC = Math.round(Number(amount))
    if (!label.trim() || !Number.isFinite(amountTTC) || amountTTC <= 0) {
      toast.error('Libellé et montant requis')
      return
    }
    const row: BusinessExpense = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      category,
      label: label.trim(),
      amountTTC,
      dateYmd,
      notes: notes.trim() || undefined,
      createdAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.businessExpenses.add(row)
    setLabel('')
    setAmount('')
    setNotes('')
    toast.success('Dépense enregistrée', formatFCFA(amountTTC))
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconCard />}
        title="Dépenses"
        subtitle="Sorties de caisse / frais magasin"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Kpi label="Aujourd’hui" value={formatFCFA(todayTotal)} tone="rose" />
        <Kpi label="Ce mois" value={formatFCFA(monthTotal)} tone="amber" />
      </div>
      {canManage ? (
        <FormPanel
          eyebrow="Caisse"
          title="Enregistrer une dépense"
          description="Sortie de caisse, catégorie et justificatif."
          actions={
            <Button variant="accent" onClick={() => void add()}>
              Enregistrer
            </Button>
          }
        >
          <FormGrid>
            <Field label="Catégorie">
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={dateYmd}
                onChange={(e) => setDateYmd(e.target.value)}
              />
            </Field>
            <Field label="Libellé">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
            <Field label="Montant (FCFA)">
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="Aucune dépense" description="Enregistrez un frais magasin." />
      ) : (
        <ul className="space-y-2">
          {[...rows]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 80)
            .map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2"
              >
                <div>
                  <p className="text-[13px] font-semibold">{r.label}</p>
                  <p className="text-[11px] text-ink-muted">
                    {r.dateYmd}
                    {r.createdByDisplayName ? ` · ${r.createdByDisplayName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">
                    {CATEGORIES.find((c) => c.id === r.category)?.label ?? r.category}
                  </Badge>
                  <span className="font-mono-nums text-[13px] font-semibold">
                    {formatFCFA(r.amountTTC)}
                  </span>
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
