import { useLiveQuery } from 'dexie-react-hooks'
import { useDomainProducts } from '../hooks/useDomainProducts'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { MarketingCampaign, MarketingCampaignAudience } from '../db/types'
import { buildCustomerProfiles } from '../lib/customerSegmentation'
import {
  MARKETING_AUDIENCE_LABELS,
  MARKETING_STATUS_LABELS,
  measureCampaignCa,
  resolveMarketingAudience,
  suggestPromoCode,
  type CampaignAttribution,
} from '../lib/marketingCampaigns'
import { productIsActive } from '../lib/productFilters'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader, SectionHeader } from '../ui/PageHeader'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { IconSparkles, IconStar } from '../ui/icons'
import { cn } from '../ui/cn'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

type TabId = 'vue' | 'campagnes' | 'creer' | 'promotions' | 'fidelite'

function fmtMoney(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`
}

function fmtDate(ts?: number): string {
  if (ts == null) return '—'
  return new Date(ts).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function statusTone(
  status: MarketingCampaign['status'],
): 'neutral' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'active':
      return 'success'
    case 'draft':
      return 'warning'
    case 'ended':
      return 'neutral'
    case 'cancelled':
      return 'danger'
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

export function MarketingView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId, activeStore } = useActiveStore()
  const [tab, setTab] = useState<TabId>('vue')
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const campaigns =
    useLiveQuery(
      () =>
        db.marketingCampaigns
          .where('storeId')
          .equals(activeStoreId)
          .reverse()
          .sortBy('createdAt'),
      [activeStoreId],
      [],
    ) ?? []
  const promotions = useLiveQuery(() => db.promotions.toArray(), [], []) ?? []
  const customers =
    useLiveQuery(() => db.loyaltyCustomers.toArray(), [], []) ?? []
  const sales = useLiveQuery(() => db.sales.toArray(), [], []) ?? []
  const { products } = useDomainProducts()
  const stores =
    useLiveQuery(() => db.stores.orderBy('sortOrder').toArray(), [], []) ?? []
  const vipClients = useLiveQuery(() => db.vipClients.toArray(), [], []) ?? []
  const loyaltyTxs =
    useLiveQuery(
      () => db.loyaltyTransactions.orderBy('createdAt').reverse().limit(30).toArray(),
      [],
      [],
    ) ?? []

  const profiles = useMemo(
    () =>
      buildCustomerProfiles({
        customers,
        sales,
        products,
        stores: stores.filter((s) => !s.archived),
        vipClients,
      }),
    [customers, sales, products, stores, vipClients],
  )

  const sortedCampaigns = useMemo(
    () => [...campaigns].sort((a, b) => b.createdAt - a.createdAt),
    [campaigns],
  )

  const selected =
    sortedCampaigns.find((c) => c.id === selectedId) ??
    sortedCampaigns.find((c) => c.status === 'active') ??
    sortedCampaigns[0] ??
    null

  const selectedMetrics: CampaignAttribution | null = useMemo(() => {
    if (!selected) return null
    return measureCampaignCa({ campaign: selected, sales, profiles })
  }, [selected, sales, profiles])

  const overview = useMemo(() => {
    const now = Date.now()
    const activePromos = promotions.filter((p) => {
      if (!p.active) return false
      if (p.startAt != null && now < p.startAt) return false
      if (p.endAt != null && now > p.endAt) return false
      return true
    }).length
    const activeCampaigns = campaigns.filter((c) => c.status === 'active').length
    const members = customers.filter((c) => !c.archived).length
    let totalCa = 0
    for (const c of campaigns) {
      if (c.status === 'draft' || c.status === 'cancelled') continue
      totalCa += measureCampaignCa({ campaign: c, sales, profiles }).attributedCaTTC
    }
    return { activePromos, activeCampaigns, members, totalCa }
  }, [promotions, campaigns, customers, sales, profiles])

  // --- Form création campagne ---
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [audience, setAudience] = useState<MarketingCampaignAudience>('vip')
  const [inactiveDays, setInactiveDays] = useState('60')
  const [productId, setProductId] = useState('')
  const [minSpend, setMinSpend] = useState('50000')
  const [minFreq, setMinFreq] = useState('3')
  const [promoCode, setPromoCode] = useState('')
  const [discountPct, setDiscountPct] = useState('10')
  const [createPromo, setCreatePromo] = useState(true)
  const [windowDays, setWindowDays] = useState('14')
  const [minCart, setMinCart] = useState('')

  // --- Form promo rapide ---
  const [pCode, setPCode] = useState('')
  const [pLabel, setPLabel] = useState('')
  const [pPct, setPPct] = useState('10')
  const [pMin, setPMin] = useState('')

  const draftAudienceCount = useMemo(() => {
    const draft: Pick<
      MarketingCampaign,
      | 'audience'
      | 'inactiveDays'
      | 'productId'
      | 'minSpendTTC'
      | 'minFrequency'
      | 'manualCustomerIds'
      | 'storeId'
    > = {
      audience,
      inactiveDays: Number.parseInt(inactiveDays, 10) || 60,
      productId: productId || undefined,
      minSpendTTC: Number.parseInt(minSpend, 10) || 0,
      minFrequency: Number.parseInt(minFreq, 10) || 0,
      storeId: activeStoreId,
    }
    return resolveMarketingAudience(draft, profiles).length
  }, [
    audience,
    inactiveDays,
    productId,
    minSpend,
    minFreq,
    activeStoreId,
    profiles,
  ])

  const createCampaign = async (): Promise<void> => {
    if (!canManage) return
    const cleanName = name.trim()
    if (!cleanName) {
      toast.error('Nom requis')
      return
    }
    const pct = Number.parseInt(discountPct, 10)
    const win = Number.parseInt(windowDays, 10)
    if (!Number.isFinite(win) || win < 1 || win > 90) {
      toast.error('Fenêtre invalide', 'Entre 1 et 90 jours.')
      return
    }
    let code = promoCode.trim().toUpperCase()
    if (!code && createPromo) code = suggestPromoCode(cleanName)
    if (code && !/^[A-Z0-9_-]{3,24}$/.test(code)) {
      toast.error('Code promo invalide', '3-24 caractères A-Z, 0-9, _, -')
      return
    }
    if (createPromo && code) {
      if (!Number.isFinite(pct) || pct < 1 || pct > 80) {
        toast.error('Remise invalide', '1 à 80 %.')
        return
      }
      if (promotions.some((p) => p.code.toUpperCase() === code)) {
        toast.error('Code déjà existant')
        return
      }
    }

    setBusy(true)
    try {
      const now = Date.now()
      const audienceRows = resolveMarketingAudience(
        {
          audience,
          inactiveDays: Number.parseInt(inactiveDays, 10) || 60,
          productId: productId || undefined,
          minSpendTTC: Number.parseInt(minSpend, 10) || 0,
          minFrequency: Number.parseInt(minFreq, 10) || 0,
          storeId: activeStoreId,
        },
        profiles,
      )

      let promotionId: string | undefined
      if (createPromo && code) {
        promotionId = crypto.randomUUID()
        const minCartRaw = minCart.trim()
        const minCartN = minCartRaw
          ? Number.parseInt(minCartRaw, 10)
          : undefined
        await db.promotions.add({
          id: promotionId,
          code,
          label: cleanName,
          discountPct: pct,
          active: false,
          minCartTTC: Number.isFinite(minCartN) ? minCartN : undefined,
          storeId: activeStoreId,
          usageCount: 0,
          createdAt: now,
          updatedAt: now,
        })
      }

      const id = crypto.randomUUID()
      await db.marketingCampaigns.add({
        id,
        storeId: activeStoreId,
        storeName: activeStore?.name,
        name: cleanName,
        status: 'draft',
        description: description.trim() || undefined,
        audience,
        inactiveDays:
          audience === 'inactive'
            ? Number.parseInt(inactiveDays, 10) || 60
            : undefined,
        productId: audience === 'product' ? productId || undefined : undefined,
        minSpendTTC:
          audience === 'spend'
            ? Number.parseInt(minSpend, 10) || undefined
            : undefined,
        minFrequency:
          audience === 'frequency'
            ? Number.parseInt(minFreq, 10) || undefined
            : undefined,
        promoCode: code || undefined,
        promotionId,
        discountPct: createPromo ? pct : undefined,
        attributionWindowDays: win,
        targetedCount: audienceRows.length,
        createdAt: now,
        updatedAt: now,
        createdByProfileId: actor.id,
        createdByDisplayName: actor.displayName,
      })

      setName('')
      setDescription('')
      setPromoCode('')
      setSelectedId(id)
      setTab('campagnes')
      toast.success('Campagne créée', `${audienceRows.length} cliente(s) ciblée(s)`)
    } finally {
      setBusy(false)
    }
  }

  const activateCampaign = async (c: MarketingCampaign): Promise<void> => {
    if (!canManage) return
    const now = Date.now()
    if (c.promotionId) {
      await db.promotions.update(c.promotionId, {
        active: true,
        startAt: now,
        updatedAt: now,
      })
    } else if (c.promoCode) {
      const promo = promotions.find(
        (p) => p.code.toUpperCase() === c.promoCode!.toUpperCase(),
      )
      if (promo) {
        await db.promotions.update(promo.id, {
          active: true,
          startAt: now,
          updatedAt: now,
        })
      }
    }
    const metrics = measureCampaignCa({
      campaign: { ...c, startedAt: now },
      sales,
      profiles,
    })
    await db.marketingCampaigns.update(c.id, {
      status: 'active',
      startedAt: now,
      updatedAt: now,
      attributedCaTTC: metrics.attributedCaTTC,
      attributedSalesCount: metrics.attributedSalesCount,
      attributedCustomersCount: metrics.attributedCustomersCount,
      promoCaTTC: metrics.promoCaTTC,
      audienceCaTTC: metrics.audienceCaTTC,
      lastMetricsAt: now,
    })
    toast.success('Campagne activée', c.promoCode ? `Code ${c.promoCode}` : c.name)
  }

  const endCampaign = async (c: MarketingCampaign): Promise<void> => {
    if (!canManage) return
    const now = Date.now()
    if (c.promotionId) {
      await db.promotions.update(c.promotionId, { active: false, updatedAt: now })
    }
    const metrics = measureCampaignCa({
      campaign: { ...c, endedAt: now },
      sales,
      profiles,
    })
    await db.marketingCampaigns.update(c.id, {
      status: 'ended',
      endedAt: now,
      updatedAt: now,
      attributedCaTTC: metrics.attributedCaTTC,
      attributedSalesCount: metrics.attributedSalesCount,
      attributedCustomersCount: metrics.attributedCustomersCount,
      promoCaTTC: metrics.promoCaTTC,
      audienceCaTTC: metrics.audienceCaTTC,
      lastMetricsAt: now,
    })
    toast.success('Campagne terminée', `CA attribué : ${fmtMoney(metrics.attributedCaTTC)}`)
  }

  const refreshMetrics = async (c: MarketingCampaign): Promise<void> => {
    const metrics = measureCampaignCa({ campaign: c, sales, profiles })
    await db.marketingCampaigns.update(c.id, {
      attributedCaTTC: metrics.attributedCaTTC,
      attributedSalesCount: metrics.attributedSalesCount,
      attributedCustomersCount: metrics.attributedCustomersCount,
      promoCaTTC: metrics.promoCaTTC,
      audienceCaTTC: metrics.audienceCaTTC,
      lastMetricsAt: Date.now(),
      updatedAt: Date.now(),
    })
    toast.success('Métriques actualisées', fmtMoney(metrics.attributedCaTTC))
  }

  const createQuickPromo = async (): Promise<void> => {
    if (!canManage) return
    const code = pCode.trim().toUpperCase()
    const label = pLabel.trim()
    const pct = Number.parseInt(pPct, 10)
    if (!code || !label) {
      toast.error('Code et libellé requis')
      return
    }
    if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
      toast.error('Code invalide')
      return
    }
    if (!Number.isFinite(pct) || pct < 1 || pct > 80) {
      toast.error('Remise 1–80 %')
      return
    }
    if (promotions.some((p) => p.code.toUpperCase() === code)) {
      toast.error('Code déjà existant')
      return
    }
    const now = Date.now()
    const min = pMin.trim() ? Number.parseInt(pMin.trim(), 10) : undefined
    await db.promotions.add({
      id: crypto.randomUUID(),
      code,
      label,
      discountPct: pct,
      active: true,
      minCartTTC: Number.isFinite(min) ? min : undefined,
      storeId: activeStoreId,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    setPCode('')
    setPLabel('')
    setPPct('10')
    setPMin('')
    toast.success('Promotion créée', code)
  }

  const activeProducts = useMemo(
    () => products.filter((p) => productIsActive(p)).slice(0, 200),
    [products],
  )

  const loyaltyStats = useMemo(() => {
    const visible = customers.filter((c) => !c.archived)
    return visible.reduce(
      (acc, c) => {
        acc.members += 1
        acc.points += c.points
        acc.spent += c.totalSpentTTC
        return acc
      },
      { members: 0, points: 0, spent: 0 },
    )
  }, [customers])

  return (
    <div className="module-page space-y-6">
      <PageHeader
        title="Marketing / fidélisation"
        subtitle="Promotions, fidélité, campagnes par segment et CA généré"
        icon={<IconSparkles />}
      />

      <Tabs
        variant="segmented"
        active={tab}
        onChange={setTab}
        items={[
          { id: 'vue', label: 'Vue d’ensemble' },
          { id: 'campagnes', label: 'Campagnes' },
          { id: 'creer', label: 'Créer' },
          { id: 'promotions', label: 'Promotions' },
          { id: 'fidelite', label: 'Fidélité' },
        ]}
      />

      {tab === 'vue' ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Campagnes actives" value={String(overview.activeCampaigns)} />
            <Kpi label="Promos actives" value={String(overview.activePromos)} />
            <Kpi label="Membres fidélité" value={String(overview.members)} />
            <Kpi label="CA campagnes" value={fmtMoney(overview.totalCa)} />
          </div>

          <SectionHeader title="Dernières campagnes" />
          {sortedCampaigns.length === 0 ? (
            <EmptyState
              title="Aucune campagne"
              description="Créez une campagne par segment avec un code promo pour mesurer le CA."
              action={
                canManage ? (
                  <Button type="button" onClick={() => setTab('creer')}>
                    Créer une campagne
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
              {sortedCampaigns.slice(0, 8).map((c) => {
                const m = measureCampaignCa({ campaign: c, sales, profiles })
                return (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-zinc-900">{c.name}</p>
                      <p className="text-sm text-zinc-500">
                        {MARKETING_AUDIENCE_LABELS[c.audience]}
                        {c.promoCode ? ` · ${c.promoCode}` : ''} ·{' '}
                        {c.targetedCount} ciblée(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone={statusTone(c.status)}>
                        {MARKETING_STATUS_LABELS[c.status]}
                      </Badge>
                      <span className="text-sm font-semibold tabular-nums text-zinc-800">
                        {fmtMoney(m.attributedCaTTC)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedId(c.id)
                          setTab('campagnes')
                        }}
                      >
                        Détail
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'campagnes' ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-3">
            <SectionHeader title="Liste" />
            {sortedCampaigns.length === 0 ? (
              <EmptyState
                title="Aucune campagne"
                action={
                  canManage ? (
                    <Button type="button" onClick={() => setTab('creer')}>
                      Créer
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="space-y-2">
                {sortedCampaigns.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        'w-full rounded-xl border px-4 py-3 text-left transition',
                        selected?.id === c.id
                          ? 'border-rose-300 bg-rose-50'
                          : 'border-zinc-200 bg-white hover:border-zinc-300',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-zinc-900">{c.name}</span>
                        <Badge tone={statusTone(c.status)}>
                          {MARKETING_STATUS_LABELS[c.status]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {MARKETING_AUDIENCE_LABELS[c.audience]} ·{' '}
                        {fmtDate(c.startedAt ?? c.createdAt)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            {!selected ? (
              <EmptyState title="Sélectionnez une campagne" />
            ) : (
              <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900">
                      {selected.name}
                    </h3>
                    <p className="text-sm text-zinc-500">
                      {selected.description || MARKETING_AUDIENCE_LABELS[selected.audience]}
                    </p>
                  </div>
                  <Badge tone={statusTone(selected.status)}>
                    {MARKETING_STATUS_LABELS[selected.status]}
                  </Badge>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Kpi
                    label="CA attribué"
                    value={fmtMoney(selectedMetrics?.attributedCaTTC ?? 0)}
                  />
                  <Kpi
                    label="Ventes attribuées"
                    value={String(selectedMetrics?.attributedSalesCount ?? 0)}
                  />
                  <Kpi
                    label="CA via code promo"
                    value={fmtMoney(selectedMetrics?.promoCaTTC ?? 0)}
                  />
                  <Kpi
                    label="CA segment (hors promo)"
                    value={fmtMoney(selectedMetrics?.audienceCaTTC ?? 0)}
                  />
                </div>

                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-zinc-500">Segment</dt>
                    <dd className="font-medium">
                      {MARKETING_AUDIENCE_LABELS[selected.audience]} (
                      {selected.targetedCount})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Code promo</dt>
                    <dd className="font-mono font-medium">
                      {selected.promoCode ?? '—'}
                      {selected.discountPct != null
                        ? ` (−${selected.discountPct} %)`
                        : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Fenêtre d’attribution</dt>
                    <dd className="font-medium">
                      {selected.attributionWindowDays} jours
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Période mesurée</dt>
                    <dd className="font-medium">
                      {fmtDate(selectedMetrics?.windowFrom ?? undefined)} →{' '}
                      {fmtDate(selectedMetrics?.windowTo ?? undefined)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Clientes converties</dt>
                    <dd className="font-medium">
                      {selectedMetrics?.attributedCustomersCount ?? 0}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Créée par</dt>
                    <dd className="font-medium">
                      {selected.createdByDisplayName ?? '—'}
                    </dd>
                  </div>
                </dl>

                {canManage ? (
                  <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
                    {selected.status === 'draft' ? (
                      <Button
                        type="button"
                        onClick={() => void activateCampaign(selected)}
                      >
                        Activer
                      </Button>
                    ) : null}
                    {selected.status === 'active' ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void endCampaign(selected)}
                      >
                        Terminer
                      </Button>
                    ) : null}
                    {selected.status === 'active' || selected.status === 'ended' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void refreshMetrics(selected)}
                      >
                        Actualiser le CA
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'creer' ? (
        <FormPanel
          title="Nouvelle campagne par segment"
          description="Liez un code promo pour mesurer précisément le CA généré."
        >
          {!canManage ? (
            <p className="text-sm text-zinc-500">Droits insuffisants.</p>
          ) : (
            <div className="space-y-4">
              <FormGrid>
                <Field label="Nom">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Soldes VIP mars"
                  />
                </Field>
                <Field label="Fenêtre d’attribution (jours)">
                  <Input
                    value={windowDays}
                    onChange={(e) => setWindowDays(e.target.value)}
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Segment" className="sm:col-span-2">
                  <Select
                    value={audience}
                    onChange={(e) =>
                      setAudience(e.target.value as MarketingCampaignAudience)
                    }
                  >
                    {(
                      Object.keys(MARKETING_AUDIENCE_LABELS) as MarketingCampaignAudience[]
                    )
                      .filter((k) => k !== 'manual')
                      .map((k) => (
                        <option key={k} value={k}>
                          {MARKETING_AUDIENCE_LABELS[k]}
                        </option>
                      ))}
                  </Select>
                </Field>
                {audience === 'inactive' ? (
                  <Field label="Inactivité (jours)">
                    <Input
                      value={inactiveDays}
                      onChange={(e) => setInactiveDays(e.target.value)}
                      inputMode="numeric"
                    />
                  </Field>
                ) : null}
                {audience === 'product' ? (
                  <Field label="Produit" className="sm:col-span-2">
                    <Select
                      value={productId}
                      onChange={(e) => setProductId(e.target.value)}
                    >
                      <option value="">Choisir…</option>
                      {activeProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
                {audience === 'spend' ? (
                  <Field label="Dépense min. (FCFA)">
                    <Input
                      value={minSpend}
                      onChange={(e) => setMinSpend(e.target.value)}
                      inputMode="numeric"
                    />
                  </Field>
                ) : null}
                {audience === 'frequency' ? (
                  <Field label="Fréquence min. (visites)">
                    <Input
                      value={minFreq}
                      onChange={(e) => setMinFreq(e.target.value)}
                      inputMode="numeric"
                    />
                  </Field>
                ) : null}
                <Field label="Description" className="sm:col-span-2">
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Objectif et offre de la campagne…"
                  />
                </Field>
              </FormGrid>

              <div className="rounded-lg border border-rose-100 bg-rose-50/50 p-4">
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-800">
                  <input
                    type="checkbox"
                    checked={createPromo}
                    onChange={(e) => setCreatePromo(e.target.checked)}
                  />
                  Créer / lier un code promo (recommandé pour le CA)
                </label>
                {createPromo ? (
                  <FormGrid className="mt-3">
                    <Field label="Code promo">
                      <Input
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                        placeholder="Auto si vide"
                      />
                    </Field>
                    <Field label="Remise %">
                      <Input
                        value={discountPct}
                        onChange={(e) => setDiscountPct(e.target.value)}
                        inputMode="numeric"
                      />
                    </Field>
                    <Field label="Panier min. (FCFA)">
                      <Input
                        value={minCart}
                        onChange={(e) => setMinCart(e.target.value)}
                        inputMode="numeric"
                        placeholder="Optionnel"
                      />
                    </Field>
                  </FormGrid>
                ) : (
                  <Field label="Code promo existant (optionnel)" className="mt-3">
                    <Input
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      placeholder="Ex. VIP15"
                    />
                  </Field>
                )}
              </div>

              <p className="text-sm text-zinc-600">
                Audience estimée :{' '}
                <strong className="tabular-nums">{draftAudienceCount}</strong>{' '}
                cliente(s)
              </p>

              <Button
                type="button"
                disabled={busy}
                onClick={() => void createCampaign()}
              >
                {busy ? 'Création…' : 'Créer la campagne'}
              </Button>
            </div>
          )}
        </FormPanel>
      ) : null}

      {tab === 'promotions' ? (
        <div className="space-y-6">
          <SectionHeader
            title="Codes promo"
            subtitle="Utilisables en caisse ; liés aux campagnes pour mesurer le CA."
          />
          {canManage ? (
            <FormPanel title="Créer une promotion">
              <FormGrid>
                <Field label="Code">
                  <Input
                    value={pCode}
                    onChange={(e) => setPCode(e.target.value.toUpperCase())}
                    placeholder="SOLDES20"
                  />
                </Field>
                <Field label="Libellé">
                  <Input
                    value={pLabel}
                    onChange={(e) => setPLabel(e.target.value)}
                    placeholder="Soldes printemps"
                  />
                </Field>
                <Field label="Remise %">
                  <Input
                    value={pPct}
                    onChange={(e) => setPPct(e.target.value)}
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Panier min.">
                  <Input
                    value={pMin}
                    onChange={(e) => setPMin(e.target.value)}
                    inputMode="numeric"
                    placeholder="Optionnel"
                  />
                </Field>
              </FormGrid>
              <Button type="button" className="mt-3" onClick={() => void createQuickPromo()}>
                Créer la promotion
              </Button>
            </FormPanel>
          ) : null}

          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
            {[...promotions]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div>
                    <p className="font-mono font-semibold text-zinc-900">{p.code}</p>
                    <p className="text-sm text-zinc-500">
                      {p.label} · −{p.discountPct} % · {p.usageCount} usage(s)
                    </p>
                  </div>
                  <Badge tone={p.active ? 'success' : 'neutral'}>
                    {p.active ? 'Active' : 'Inactive'}
                  </Badge>
                </li>
              ))}
            {promotions.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-zinc-500">
                Aucune promotion
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {tab === 'fidelite' ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Membres" value={String(loyaltyStats.members)} />
            <Kpi
              label="Points en circulation"
              value={loyaltyStats.points.toLocaleString('fr-FR')}
            />
            <Kpi label="CA fidélité cumulé" value={fmtMoney(loyaltyStats.spent)} />
          </div>

          <SectionHeader
            title="Top membres"
            subtitle="Programme points — gestion fine aussi dans Fidélité."
          />
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
            {[...customers]
              .filter((c) => !c.archived)
              .sort((a, b) => b.totalSpentTTC - a.totalSpentTTC)
              .slice(0, 12)
              .map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <IconStar />
                    <div>
                      <p className="font-medium text-zinc-900">
                        {c.displayName || c.phone}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {c.visitCount} visite(s) · {c.points} pts
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    {fmtMoney(c.totalSpentTTC)}
                  </span>
                </li>
              ))}
            {loyaltyStats.members === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-zinc-500">
                Aucun membre fidélité
              </li>
            ) : null}
          </ul>

          {loyaltyTxs.length > 0 ? (
            <>
              <SectionHeader title="Derniers mouvements points" />
              <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white text-sm">
                {loyaltyTxs.slice(0, 10).map((t) => (
                  <li
                    key={t.id}
                    className="flex justify-between px-4 py-2 text-zinc-700"
                  >
                    <span>
                      {t.type} · {fmtDate(t.createdAt)}
                    </span>
                    <span
                      className={cn(
                        'font-semibold tabular-nums',
                        t.points >= 0 ? 'text-emerald-700' : 'text-rose-700',
                      )}
                    >
                      {t.points >= 0 ? '+' : ''}
                      {t.points} pts
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
