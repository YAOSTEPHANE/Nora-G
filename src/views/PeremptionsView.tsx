import { useLiveQuery } from 'dexie-react-hooks'
import { useDomainProducts } from '../hooks/useDomainProducts'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { LotDisposalReason, ProductLot } from '../db/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Select, Textarea } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconCalendar } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

const DAY_MS = 24 * 60 * 60 * 1000

function expiryToMs(expiryDate: string): number {
  const t = Date.parse(`${expiryDate}T23:59:59`)
  return Number.isFinite(t) ? t : 0
}

function daysUntil(expiryDate: string, now: number): number {
  return Math.ceil((expiryToMs(expiryDate) - now) / DAY_MS)
}

export function PeremptionsView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const now = Date.now()
  const lots =
    useLiveQuery(
      () => db.productLots.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const { products } = useDomainProducts()
  const disposals =
    useLiveQuery(
      () =>
        db.lotDisposals
          .where('storeId')
          .equals(activeStoreId)
          .reverse()
          .sortBy('disposedAt'),
      [activeStoreId],
      [],
    ) ?? []

  const [reason, setReason] = useState<LotDisposalReason>('expired')
  const [notes, setNotes] = useState('')

  const productName = useMemo(() => {
    const m = new Map(products.map((p) => [p.id, p.name]))
    return (id: string) => m.get(id) ?? 'Produit'
  }, [products])

  const buckets = useMemo(() => {
    const active = lots.filter((l) => l.qty > 0)
    const expired: ProductLot[] = []
    const d30: ProductLot[] = []
    const d60: ProductLot[] = []
    const d90: ProductLot[] = []
    for (const lot of active) {
      const d = daysUntil(lot.expiryDate, now)
      if (d < 0) expired.push(lot)
      else if (d <= 30) d30.push(lot)
      else if (d <= 60) d60.push(lot)
      else if (d <= 90) d90.push(lot)
    }
    const byDate = (a: ProductLot, b: ProductLot) =>
      a.expiryDate.localeCompare(b.expiryDate)
    return {
      expired: expired.sort(byDate),
      d30: d30.sort(byDate),
      d60: d60.sort(byDate),
      d90: d90.sort(byDate),
    }
  }, [lots, now])

  const disposeLot = async (lot: ProductLot) => {
    if (!canManage || lot.qty <= 0) return
    const qty = lot.qty
    await db.productLots.update(lot.id, { qty: 0 })
    await db.lotDisposals.add({
      id: crypto.randomUUID(),
      lotId: lot.id,
      productId: lot.productId,
      productName: productName(lot.productId),
      storeId: activeStoreId,
      lotNumber: lot.lotNumber,
      qty,
      reason,
      notes: notes.trim() || undefined,
      disposedAt: Date.now(),
      actorProfileId: actor.id,
      actorDisplayName: actor.displayName,
    })
    setNotes('')
    toast.success('Lot détruit / sorti', `${qty} unité(s)`)
  }

  const renderLotList = (
    title: string,
    rows: ProductLot[],
    tone: 'danger' | 'warning' | 'info',
  ) => (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold">{title}</p>
          <Badge tone={tone}>{rows.length}</Badge>
        </div>
        {rows.length === 0 ? (
          <p className="text-[12px] text-ink-muted">Aucun lot</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((lot) => {
              const d = daysUntil(lot.expiryDate, now)
              return (
                <li
                  key={lot.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-2 py-2"
                >
                  <div>
                    <p className="text-[12px] font-medium">
                      {productName(lot.productId)}
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      Lot {lot.lotNumber} · {lot.qty} u. · DLC {lot.expiryDate} (
                      {d < 0 ? `expiré ${Math.abs(d)} j` : `J-${d}`})
                    </p>
                  </div>
                  {canManage ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void disposeLot(lot)}
                    >
                      Sortir
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconCalendar />}
        title="Péremptions"
        subtitle="Alertes DLC 30 / 60 / 90 jours et destructions"
      />
      <div className="grid gap-2 sm:grid-cols-4">
        <Kpi label="Expirés" value={String(buckets.expired.length)} tone="rose" />
        <Kpi label="≤ 30 j" value={String(buckets.d30.length)} tone="amber" />
        <Kpi label="≤ 60 j" value={String(buckets.d60.length)} tone="amber" />
        <Kpi label="≤ 90 j" value={String(buckets.d90.length)} tone="neutral" />
      </div>

      {canManage ? (
        <FormPanel
          eyebrow="Sortie"
          title="Motif de destruction"
          description="Appliqué lors de la sortie d’un lot périmé ou abîmé."
        >
          <FormGrid>
            <Field label="Motif de sortie">
              <Select
                value={reason}
                onChange={(e) => setReason(e.target.value as LotDisposalReason)}
              >
                <option value="expired">Périmé</option>
                <option value="damaged">Abîmé</option>
                <option value="recall">Rappel</option>
                <option value="other">Autre</option>
              </Select>
            </Field>
            <Field label="Note (optionnel)">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {renderLotList('Expirés', buckets.expired, 'danger')}
        {renderLotList('Dans 30 jours', buckets.d30, 'warning')}
        {renderLotList('Dans 60 jours', buckets.d60, 'warning')}
        {renderLotList('Dans 90 jours', buckets.d90, 'info')}
      </div>

      <Card>
        <CardContent className="space-y-2">
          <p className="text-[13px] font-semibold">Historique des sorties</p>
          {disposals.length === 0 ? (
            <EmptyState
              title="Aucune sortie"
              description="Les destructions apparaîtront ici."
            />
          ) : (
            <ul className="space-y-1">
              {disposals.slice(0, 40).map((d) => (
                <li key={d.id} className="text-[12px] text-ink-muted">
                  {new Date(d.disposedAt).toLocaleString('fr-FR')} · {d.productName}{' '}
                  · lot {d.lotNumber} · {d.qty} u. · {d.reason}
                  {d.actorDisplayName ? ` · ${d.actorDisplayName}` : ''}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
