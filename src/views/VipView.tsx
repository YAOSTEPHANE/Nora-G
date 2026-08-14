import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { VipClient, VipTier } from '../db/types'
import { formatFCFA } from '../lib/money'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconSparkles } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

const TIER_LABEL: Record<VipTier, string> = {
  gold: 'Gold',
  platinum: 'Platinum',
  black: 'Black',
}

export function VipView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const rows =
    useLiveQuery(
      () => db.vipClients.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [tier, setTier] = useState<VipTier>('gold')
  const [preferences, setPreferences] = useState('')
  const [personalShopper, setPersonalShopper] = useState('')

  const black = useMemo(() => rows.filter((r) => r.tier === 'black').length, [rows])
  const lifetime = rows.reduce((m, r) => m + r.lifetimeTTC, 0)

  const create = async () => {
    if (!canManage) return
    if (!name.trim()) {
      toast.error('Nom du client VIP requis')
      return
    }
    const row: VipClient = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      name: name.trim(),
      phone: phone.trim() || undefined,
      tier,
      preferences: preferences.trim() || undefined,
      personalShopper: personalShopper.trim() || undefined,
      lifetimeTTC: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.vipClients.add(row)
    setName('')
    setPhone('')
    setPreferences('')
    toast.success('Client VIP inscrit', TIER_LABEL[tier])
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconSparkles />}
        title="Conciergerie VIP"
        subtitle="Paliers, préférences et personal shopper"
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Kpi label="Carnet VIP" value={String(rows.length)} tone="accent" />
        <Kpi label="Black" value={String(black)} tone="violet" />
        <Kpi label="Lifetime" value={formatFCFA(lifetime)} tone="amber" />
      </div>
      {canManage ? (
        <FormPanel
          eyebrow="Carnet privé"
          title="Inscrire un client VIP"
          description="Palier, préférences et personal shopper dédié."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Inscrire
            </Button>
          }
        >
          <FormGrid>
            <Field label="Client">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Téléphone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Palier">
              <Select
                value={tier}
                onChange={(e) => setTier(e.target.value as VipTier)}
              >
                <option value="gold">Gold</option>
                <option value="platinum">Platinum</option>
                <option value="black">Black</option>
              </Select>
            </Field>
            <Field label="Personal shopper">
              <Input
                value={personalShopper}
                onChange={(e) => setPersonalShopper(e.target.value)}
              />
            </Field>
            <Field label="Préférences" className="sm:col-span-2">
              <Input
                value={preferences}
                onChange={(e) => setPreferences(e.target.value)}
                placeholder="Taille, parfum, table, allergie…"
              />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title="Aucun VIP"
          description="Constituez le carnet privé de la maison."
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
                  <p className="text-[13px] font-semibold">{r.name}</p>
                  <p className="text-[11px] text-ink-muted">
                    {r.personalShopper ? `Shopper ${r.personalShopper} · ` : ''}
                    {r.preferences ?? 'Sans préférence notée'}
                  </p>
                </div>
                <Badge tone={r.tier === 'black' ? 'violet' : 'accent'}>
                  {TIER_LABEL[r.tier]}
                </Badge>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
