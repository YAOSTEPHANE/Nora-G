import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../db/db'
import type { Promotion } from '../db/types'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { PageHeader } from '../ui/PageHeader'
import { IconTag } from '../ui/icons'
import { useToast } from '../ui/Toast'

type Props = {
  activeStoreId: string
  canManagePromotions: boolean
}

function nowInRange(p: Promotion, now: number): boolean {
  if (!p.active) return false
  if (p.startAt != null && now < p.startAt) return false
  if (p.endAt != null && now > p.endAt) return false
  if (p.maxUsage != null && p.usageCount >= p.maxUsage) return false
  return true
}

export function PromotionsView({ activeStoreId, canManagePromotions }: Props) {
  const toast = useToast()
  const promotions = useLiveQuery(() => db.promotions.toArray(), [], []) ?? []
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [discountPct, setDiscountPct] = useState('10')
  const [minCartTTC, setMinCartTTC] = useState('')
  const [scope, setScope] = useState<'all' | 'store'>('all')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [maxUsage, setMaxUsage] = useState('')
  const [busy, setBusy] = useState(false)

  const now = Date.now()
  const ordered = useMemo(
    () =>
      [...promotions].sort(
        (a, b) =>
          (nowInRange(b, now) ? 1 : 0) - (nowInRange(a, now) ? 1 : 0) ||
          b.updatedAt - a.updatedAt,
      ),
    [promotions, now],
  )

  const createPromotion = async (): Promise<void> => {
    const cleanCode = code.trim().toUpperCase()
    const cleanLabel = label.trim()
    const pct = Number.parseInt(discountPct.trim(), 10)
    const min = minCartTTC.trim() ? Number.parseInt(minCartTTC.trim(), 10) : undefined
    const max =
      maxUsage.trim() !== '' ? Number.parseInt(maxUsage.trim(), 10) : undefined
    const startTs = startAt ? new Date(startAt).getTime() : undefined
    const endTs = endAt ? new Date(endAt).getTime() : undefined
    if (!cleanCode || !cleanLabel) {
      toast.error('Informations manquantes', 'Code et libellé sont obligatoires.')
      return
    }
    if (!/^[A-Z0-9_-]{3,24}$/.test(cleanCode)) {
      toast.error('Code invalide', 'Utilisez 3-24 caractères: A-Z, 0-9, _, -')
      return
    }
    if (!Number.isFinite(pct) || pct <= 0 || pct > 80) {
      toast.error('Remise invalide', 'La remise doit être entre 1 et 80%.')
      return
    }
    if (max != null && (!Number.isFinite(max) || max <= 0)) {
      toast.error('Limite invalide')
      return
    }
    if (startTs != null && endTs != null && endTs <= startTs) {
      toast.error('Période invalide', 'La date de fin doit être après le début.')
      return
    }
    if (promotions.some((p) => p.code.toUpperCase() === cleanCode)) {
      toast.error('Code déjà existant')
      return
    }
    setBusy(true)
    try {
      const nowTs = Date.now()
      await db.promotions.add({
        id: crypto.randomUUID(),
        code: cleanCode,
        label: cleanLabel,
        discountPct: pct,
        active: true,
        startAt: startTs,
        endAt: endTs,
        minCartTTC: Number.isFinite(min) ? min : undefined,
        storeId: scope === 'store' ? activeStoreId : undefined,
        usageCount: 0,
        maxUsage: Number.isFinite(max) ? max : undefined,
        createdAt: nowTs,
        updatedAt: nowTs,
      })
      setCode('')
      setLabel('')
      setDiscountPct('10')
      setMinCartTTC('')
      setStartAt('')
      setEndAt('')
      setMaxUsage('')
      setScope('all')
      toast.success('Promotion créée', cleanCode)
    } finally {
      setBusy(false)
    }
  }

  const togglePromotion = async (p: Promotion): Promise<void> => {
    if (!canManagePromotions) return
    await db.promotions.update(p.id, { active: !p.active, updatedAt: Date.now() })
  }

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconTag />}
        eyebrow="Marketing"
        title="Offres"
        subtitle="Créez des codes promo et pilotez leur activation en caisse"
      />

      {canManagePromotions ? (
        <Card>
          <CardHeader
            eyebrow="Création"
            title="Nouvelle offre"
            subtitle="Code, remise et période d’activation"
          />
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7 lg:items-end">
              <Field label="Code" required>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="PROMO15"
                  className="uppercase"
                />
              </Field>
              <Field label="Libellé" required>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Offre weekend"
                />
              </Field>
              <Field label="Remise (%)" required hint="1–80">
                <Input
                  inputMode="numeric"
                  value={discountPct}
                  onChange={(e) => setDiscountPct(e.target.value)}
                />
              </Field>
              <Field label="Panier min (FCFA)">
                <Input
                  inputMode="numeric"
                  value={minCartTTC}
                  onChange={(e) => setMinCartTTC(e.target.value)}
                />
              </Field>
              <Field label="Portée">
                <Select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as 'all' | 'store')}
                >
                  <option value="all">Tous magasins</option>
                  <option value="store">Magasin actif</option>
                </Select>
              </Field>
              <Field label="Début">
                <Input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
              </Field>
              <Field label="Fin">
                <Input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                />
              </Field>
              <Field label="Limite usages">
                <Input
                  inputMode="numeric"
                  value={maxUsage}
                  onChange={(e) => setMaxUsage(e.target.value)}
                  placeholder="Illimité"
                />
              </Field>
            </div>
            <div className="mt-3">
              <Button variant="accent" loading={busy} onClick={() => void createPromotion()}>
                Ajouter la promotion
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {ordered.length === 0 ? (
        <EmptyState
          title="Aucune promotion"
          description="Créez un premier code promo pour vos campagnes."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ordered.map((p) => {
            const available = nowInRange(p, now)
            return (
              <Card key={p.id}>
                <CardContent className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] text-zinc-500">Code</p>
                      <p className="font-mono text-[14px] font-semibold text-zinc-900">
                        {p.code}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        available
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-zinc-200 text-zinc-700'
                      }`}
                    >
                      {available ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                  <p className="text-[12px] text-zinc-700">{p.label}</p>
                  <p className="text-[12px] text-zinc-600">
                    Remise: <strong>{p.discountPct}%</strong>
                    {p.minCartTTC ? ` · Min panier ${p.minCartTTC} FCFA` : ''}
                    {p.storeId ? ' · Magasin spécifique' : ' · Tous magasins'}
                    {p.maxUsage ? ` · Limite ${p.maxUsage}` : ''}
                  </p>
                  <p className="text-[11px] text-zinc-500">Utilisations: {p.usageCount}</p>
                  {canManagePromotions ? (
                    <Button size="sm" variant="ghost" onClick={() => void togglePromotion(p)}>
                      {p.active ? 'Désactiver' : 'Activer'}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
