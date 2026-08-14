import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { TradeIn } from '../db/types'
import { formatFCFA } from '../lib/money'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconRefund } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

export function ReprisesView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const rows =
    useLiveQuery(
      () => db.tradeIns.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [deviceLabel, setDeviceLabel] = useState('')
  const [serialOrImei, setSerialOrImei] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [offer, setOffer] = useState('')

  const quoted = useMemo(
    () => rows.filter((r) => r.status === 'quoted').length,
    [rows],
  )
  const credited = useMemo(
    () =>
      rows
        .filter((r) => r.status === 'credited')
        .reduce((m, r) => m + r.offerTTC, 0),
    [rows],
  )

  const create = async () => {
    if (!canManage) return
    const offerTTC = Math.round(Number(offer.replace(/\s/g, '')))
    if (!deviceLabel.trim() || !customerName.trim()) {
      toast.error('Appareil et client requis')
      return
    }
    if (!Number.isFinite(offerTTC) || offerTTC <= 0) {
      toast.error('Offre invalide')
      return
    }
    const row: TradeIn = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      status: 'quoted',
      deviceLabel: deviceLabel.trim(),
      serialOrImei: serialOrImei.trim() || undefined,
      customerName: customerName.trim(),
      offerTTC,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.tradeIns.add(row)
    setDeviceLabel('')
    setSerialOrImei('')
    setCustomerName('')
    setOffer('')
    toast.success('Offre de reprise', formatFCFA(offerTTC))
  }

  const credit = async (id: string) => {
    if (!canManage) return
    await db.tradeIns.update(id, { status: 'credited', updatedAt: Date.now() })
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconRefund />}
        title="Reprises"
        subtitle="Trade-in, IMEI et avoirs d’achat"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Kpi label="Offres ouvertes" value={String(quoted)} tone="sky" />
        <Kpi label="Avoirs" value={formatFCFA(credited)} tone="accent" />
      </div>
      {canManage ? (
        <FormPanel
          eyebrow="Trade-in"
          title="Coter une reprise"
          description="Appareil, IMEI et offre d’avoir."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Coter
            </Button>
          }
        >
          <FormGrid>
            <Field label="Appareil">
              <Input
                value={deviceLabel}
                onChange={(e) => setDeviceLabel(e.target.value)}
              />
            </Field>
            <Field label="IMEI / série">
              <Input
                value={serialOrImei}
                onChange={(e) => setSerialOrImei(e.target.value)}
              />
            </Field>
            <Field label="Client">
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </Field>
            <Field label="Offre (FCFA)">
              <Input value={offer} onChange={(e) => setOffer(e.target.value)} />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title="Aucune reprise"
          description="Reprise smartphone, PC, console contre un nouvel achat."
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
                    {r.deviceLabel} · {formatFCFA(r.offerTTC)}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {r.customerName}
                    {r.serialOrImei ? ` · ${r.serialOrImei}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={r.status === 'credited' ? 'success' : 'warning'}>
                    {r.status === 'credited' ? 'Avoir' : 'Coté'}
                  </Badge>
                  {canManage && r.status === 'quoted' ? (
                    <Button size="sm" onClick={() => void credit(r.id)}>
                      Créditer
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
