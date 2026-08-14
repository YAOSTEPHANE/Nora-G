import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { WineCellarLot } from '../db/types'
import { formatFCFA } from '../lib/money'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconCaisse } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

export function CaveView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const rows =
    useLiveQuery(
      () => db.wineCellarLots.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [cuvee, setCuvee] = useState('')
  const [vintage, setVintage] = useState('')
  const [bottles, setBottles] = useState('6')
  const [unitPrice, setUnitPrice] = useState('')

  const cellar = useMemo(
    () => rows.filter((r) => r.status !== 'depleted'),
    [rows],
  )
  const stock = cellar.reduce((m, r) => m + r.bottles, 0)

  const create = async () => {
    if (!canManage) return
    const n = Number(bottles)
    const unitPriceTTC = Math.round(Number(unitPrice.replace(/\s/g, '')))
    if (!cuvee.trim() || !Number.isFinite(n) || n <= 0 || !Number.isFinite(unitPriceTTC) || unitPriceTTC <= 0) {
      toast.error('Cuvée, bouteilles et prix requis')
      return
    }
    const row: WineCellarLot = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      status: 'cellar',
      cuvee: cuvee.trim(),
      vintage: vintage.trim() || undefined,
      bottles: n,
      unitPriceTTC,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.wineCellarLots.add(row)
    setCuvee('')
    setVintage('')
    toast.success('Entrée cave', row.cuvee)
  }

  const pour = async (row: WineCellarLot) => {
    if (!canManage) return
    const bottlesLeft = row.bottles - 1
    await db.wineCellarLots.update(row.id, {
      bottles: Math.max(0, bottlesLeft),
      status: bottlesLeft <= 0 ? 'depleted' : 'by_the_glass',
      updatedAt: Date.now(),
    })
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconCaisse />}
        title="Cave"
        subtitle="Millésimes, bouteilles et service au verre"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Kpi label="Références" value={String(cellar.length)} tone="rose" />
        <Kpi label="Bouteilles" value={String(stock)} tone="accent" />
      </div>
      {canManage ? (
        <FormPanel
          eyebrow="Cave"
          title="Entrer une cuvée"
          description="Millésime, stock bouteilles et tarif de service."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Entrer en cave
            </Button>
          }
        >
          <FormGrid>
            <Field label="Cuvée">
              <Input value={cuvee} onChange={(e) => setCuvee(e.target.value)} />
            </Field>
            <Field label="Millésime">
              <Input
                value={vintage}
                onChange={(e) => setVintage(e.target.value)}
              />
            </Field>
            <Field label="Bouteilles">
              <Input
                value={bottles}
                onChange={(e) => setBottles(e.target.value)}
              />
            </Field>
            <Field label="Prix TTC">
              <Input
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title="Cave vide"
          description="Gérez la carte des vins comme un stock noble."
        />
      ) : (
        <ul className="space-y-2">
          {[...rows]
            .sort((a, b) => a.cuvee.localeCompare(b.cuvee, 'fr'))
            .map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2"
              >
                <div>
                  <p className="text-[13px] font-semibold">
                    {r.cuvee}
                    {r.vintage ? ` ${r.vintage}` : ''}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {r.bottles} btl · {formatFCFA(r.unitPriceTTC)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={r.status === 'depleted' ? 'neutral' : 'accent'}>
                    {r.status === 'depleted'
                      ? 'Épuisé'
                      : r.status === 'by_the_glass'
                        ? 'Au verre'
                        : 'Cave'}
                  </Badge>
                  {canManage && r.status !== 'depleted' ? (
                    <Button size="sm" onClick={() => void pour(r)}>
                      Servir
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
