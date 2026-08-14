import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { AllergenCard } from '../db/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconAlert } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

export function AllergenesView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const rows =
    useLiveQuery(
      () => db.allergenCards.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [dishName, setDishName] = useState('')
  const [allergens, setAllergens] = useState('gluten, lait')
  const [traces, setTraces] = useState('')

  const active = useMemo(() => rows.filter((r) => r.active), [rows])

  const create = async () => {
    if (!canManage) return
    if (!dishName.trim() || !allergens.trim()) {
      toast.error('Plat et allergènes requis')
      return
    }
    const row: AllergenCard = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      dishName: dishName.trim(),
      allergens: allergens.trim(),
      traces: traces.trim() || undefined,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.allergenCards.add(row)
    setDishName('')
    toast.success('Fiche allergène', row.dishName)
  }

  const toggle = async (row: AllergenCard) => {
    if (!canManage) return
    await db.allergenCards.update(row.id, {
      active: !row.active,
      updatedAt: Date.now(),
    })
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconAlert />}
        title="Allergènes"
        subtitle="Fiches plats, traces et service en salle"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Kpi label="Fiches actives" value={String(active.length)} tone="amber" />
        <Kpi label="Carte" value={String(rows.length)} tone="neutral" />
      </div>
      {canManage ? (
        <FormPanel
          eyebrow="Carte"
          title="Publier une fiche allergènes"
          description="Plat, traces et mentions de service."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Publier la fiche
            </Button>
          }
        >
          <FormGrid>
            <Field label="Plat / produit">
              <Input
                value={dishName}
                onChange={(e) => setDishName(e.target.value)}
              />
            </Field>
            <Field label="Allergènes">
              <Input
                value={allergens}
                onChange={(e) => setAllergens(e.target.value)}
              />
            </Field>
            <Field label="Traces (opt.)" className="sm:col-span-2">
              <Input value={traces} onChange={(e) => setTraces(e.target.value)} />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title="Aucune fiche"
          description="Sécurisez le service (gluten, arachide, lait…)."
        />
      ) : (
        <ul className="space-y-2">
          {[...rows]
            .sort((a, b) => a.dishName.localeCompare(b.dishName, 'fr'))
            .map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2"
              >
                <div>
                  <p className="text-[13px] font-semibold">{r.dishName}</p>
                  <p className="text-[11px] text-ink-muted">
                    {r.allergens}
                    {r.traces ? ` · traces ${r.traces}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={r.active ? 'success' : 'neutral'}>
                    {r.active ? 'Carte' : 'Masquée'}
                  </Badge>
                  {canManage ? (
                    <Button size="sm" variant="ghost" onClick={() => void toggle(r)}>
                      {r.active ? 'Masquer' : 'Publier'}
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
