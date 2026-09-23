import { useLiveQuery } from 'dexie-react-hooks'
import { useDomainProducts } from '../hooks/useDomainProducts'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import { downloadTextFile, toCsvSemicolon } from '../lib/analyticsExport'
import {
  buildCustomerProfiles,
  filterCustomerProfiles,
  segmentKpis,
  SEGMENT_LABELS,
  type CustomerSegmentId,
} from '../lib/customerSegmentation'
import { formatFCFA } from '../lib/money'
import { productIsActive } from '../lib/productFilters'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader, SectionHeader } from '../ui/PageHeader'
import { Tabs } from '../ui/Tabs'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import {
  MobileDataCard,
  ResponsiveData,
  TableScrollHint,
} from '../ui/ResponsiveData'
import {
  IconDownload,
  IconMail,
  IconSparkles,
  IconSpreadsheet,
} from '../ui/icons'

const VIP_TIER_LABEL = {
  gold: 'Gold',
  platinum: 'Platinum',
  black: 'Black',
} as const

export function SegmentationView() {
  const { activeStoreId, activeStore } = useActiveStore()
  const customers =
    useLiveQuery(
      () => db.loyaltyCustomers.orderBy('updatedAt').reverse().toArray(),
      [],
      [],
    ) ?? []
  const sales = useLiveQuery(() => db.sales.toArray(), [], []) ?? []
  const { products } = useDomainProducts()
  const stores =
    useLiveQuery(() => db.stores.orderBy('sortOrder').toArray(), [], []) ?? []
  const vipClients = useLiveQuery(() => db.vipClients.toArray(), [], []) ?? []

  const [segment, setSegment] = useState<CustomerSegmentId>('all')
  const [inactiveDays, setInactiveDays] = useState(60)
  const [productId, setProductId] = useState<string>('all')
  const [storeId, setStoreId] = useState<string>('all')
  const [minSpend, setMinSpend] = useState('100000')
  const [minFreq, setMinFreq] = useState('2')
  const [query, setQuery] = useState('')
  const [now] = useState(Date.now)

  const activeProducts = useMemo(
    () =>
      [...products]
        .filter(productIsActive)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [products],
  )
  const activeStores = useMemo(
    () => stores.filter((s) => !s.archived),
    [stores],
  )

  const profiles = useMemo(
    () =>
      buildCustomerProfiles({
        customers,
        sales,
        products,
        stores: activeStores,
        vipClients,
        now,
      }),
    [customers, sales, products, activeStores, vipClients, now],
  )

  const kpis = useMemo(() => segmentKpis(profiles), [profiles])

  const filtered = useMemo(
    () =>
      filterCustomerProfiles(profiles, {
        segment,
        inactiveDays,
        productId,
        storeId,
        minSpendTTC: Math.max(0, Number(minSpend.replace(/\s/g, '')) || 0),
        minFrequency: Math.max(0, Number(minFreq.replace(',', '.')) || 0),
        query,
      }),
    [
      profiles,
      segment,
      inactiveDays,
      productId,
      storeId,
      minSpend,
      minFreq,
      query,
    ],
  )

  const exportCsv = () => {
    const header = [
      'Nom',
      'Téléphone',
      'VIP',
      'Palier',
      'CA TTC',
      'Achats',
      'Panier moy.',
      'Fréq./mois',
      'Dernier achat (j)',
      'Boutique dominante',
      'Produits',
    ]
    const body = filtered.map((p) => [
      p.displayName,
      p.phone,
      p.isVip ? 'oui' : 'non',
      p.vipTier ? VIP_TIER_LABEL[p.vipTier] : '',
      String(p.totalSpentTTC),
      String(p.purchaseCount),
      String(p.avgBasketTTC),
      String(p.frequencyPerMonth),
      p.daysSinceLastPurchase != null ? String(p.daysSinceLastPurchase) : '',
      p.dominantStoreName ?? '',
      p.productNames.join(' | '),
    ])
    downloadTextFile(
      `segmentation-clientes-${segment}.csv`,
      toCsvSemicolon([header, ...body]),
    )
  }

  const promoteHint =
    segment === 'vip'
      ? 'Carnet VIP (module VIP) + rapprochement téléphone'
      : null

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconMail />}
        eyebrow={`CRM · ${activeStore?.name ?? 'Réseau'}`}
        title="Segmentation clientes"
        subtitle="VIP, inactives, acheteuses d’un produit, boutique, montant et fréquence"
        actions={
          <Button
            size="sm"
            variant="secondary"
            iconLeft={<IconSpreadsheet />}
            onClick={exportCsv}
            disabled={filtered.length === 0}
          >
            Export CSV
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Clientes" value={String(kpis.total)} tone="accent" />
        <Kpi
          label="VIP"
          value={String(kpis.vip)}
          hint="Carnet VIP lié"
          tone="violet"
          icon={<IconSparkles className="h-4 w-4" />}
        />
        <Kpi
          label="Inactives (60 j)"
          value={String(kpis.inactive60)}
          tone="amber"
        />
        <Kpi
          label="Dépensé moy."
          value={formatFCFA(kpis.avgSpend)}
          tone="sky"
        />
        <Kpi
          label="Fréq. moy./mois"
          value={String(kpis.avgFrequency)}
          tone="rose"
        />
      </div>

      <Tabs
        variant="segmented"
        active={segment}
        onChange={setSegment}
        items={(
          Object.keys(SEGMENT_LABELS) as CustomerSegmentId[]
        ).map((id) => ({
          id,
          label: SEGMENT_LABELS[id],
        }))}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <Field label="Recherche" className="min-w-[180px] flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom ou téléphone…"
          />
        </Field>

        {segment === 'inactive' ? (
          <Field label="Inactives depuis (jours)" className="sm:w-44">
            <Select
              value={String(inactiveDays)}
              onChange={(e) => setInactiveDays(Number(e.target.value))}
            >
              <option value="30">30 jours</option>
              <option value="60">60 jours</option>
              <option value="90">90 jours</option>
              <option value="180">180 jours</option>
            </Select>
          </Field>
        ) : null}

        {segment === 'product' ? (
          <Field label="Produit acheté" className="sm:w-64">
            <Select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="all">— Tous —</option>
              {activeProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {segment === 'store' ? (
          <Field label="Boutique" className="sm:w-56">
            <Select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
            >
              <option value="all">— Toutes —</option>
              <option value={activeStoreId}>
                Active · {activeStore?.name ?? activeStoreId}
              </option>
              {activeStores
                .filter((s) => s.id !== activeStoreId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}

        {segment === 'spend' ? (
          <Field label="Montant min. TTC" className="sm:w-44">
            <Input
              inputMode="numeric"
              value={minSpend}
              onChange={(e) => setMinSpend(e.target.value)}
              className="font-mono-nums"
            />
          </Field>
        ) : null}

        {segment === 'frequency' ? (
          <Field label="Fréq. min. / mois" className="sm:w-40">
            <Input
              inputMode="decimal"
              value={minFreq}
              onChange={(e) => setMinFreq(e.target.value)}
              className="font-mono-nums"
            />
          </Field>
        ) : null}
      </div>

      <SectionHeader
        title={`${SEGMENT_LABELS[segment]} · ${filtered.length} cliente(s)`}
        subtitle={
          promoteHint ??
          'Basé sur le fichier fidélité, les ventes liées et le carnet VIP'
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="Aucune cliente dans ce segment"
          description="Élargissez les critères ou rattachez les ventes à une fiche fidélité."
        />
      ) : (
        <div className="min-w-0">
          <TableScrollHint />
          <ResponsiveData
            table={
              <Table minWidth={920}>
                <THead>
                  <Tr hover={false}>
                    <Th sticky>Cliente</Th>
                    <Th align="right">Dépensé</Th>
                    <Th align="right" hideBelow="md">
                      Achats
                    </Th>
                    <Th align="right" hideBelow="lg">
                      Panier
                    </Th>
                    <Th align="right" hideBelow="lg">
                      Fréq./mois
                    </Th>
                    <Th hideBelow="md">Boutique</Th>
                    <Th hideBelow="xl">Dernier achat</Th>
                    <Th>VIP</Th>
                  </Tr>
                </THead>
                <TBody>
                  {filtered.map((p) => (
                    <Tr key={p.customerId}>
                      <Td sticky className="font-medium text-zinc-900">
                        {p.displayName}
                        <span className="block font-mono-nums text-[10px] font-normal text-zinc-400">
                          {p.phone}
                        </span>
                        {segment === 'product' && p.productNames.length > 0 ? (
                          <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">
                            {p.productNames.slice(0, 3).join(' · ')}
                          </span>
                        ) : null}
                      </Td>
                      <Td align="right" mono className="font-semibold">
                        {formatFCFA(p.totalSpentTTC)}
                      </Td>
                      <Td align="right" mono hideBelow="md">
                        {p.purchaseCount}
                      </Td>
                      <Td align="right" mono hideBelow="lg">
                        {formatFCFA(p.avgBasketTTC)}
                      </Td>
                      <Td align="right" mono hideBelow="lg">
                        {p.frequencyPerMonth}
                      </Td>
                      <Td hideBelow="md" className="text-[12px] text-zinc-600">
                        {p.dominantStoreName ?? '—'}
                      </Td>
                      <Td hideBelow="xl" className="text-[12px] text-zinc-600">
                        {p.daysSinceLastPurchase != null
                          ? `il y a ${p.daysSinceLastPurchase} j`
                          : 'Jamais'}
                      </Td>
                      <Td>
                        {p.isVip && p.vipTier ? (
                          <Badge tone="violet">
                            {VIP_TIER_LABEL[p.vipTier]}
                          </Badge>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            }
            cards={
              <ul className="grid gap-2">
                {filtered.map((p) => (
                  <MobileDataCard
                    key={p.customerId}
                    title={p.displayName}
                    meta={
                      <span className="font-mono-nums">{p.phone}</span>
                    }
                    body={
                      <div className="space-y-1 text-[12px]">
                        <p>
                          Dépensé {formatFCFA(p.totalSpentTTC)} ·{' '}
                          {p.purchaseCount} achat(s)
                        </p>
                        <p>
                          Panier {formatFCFA(p.avgBasketTTC)} · Fréq.{' '}
                          {p.frequencyPerMonth}/mois
                        </p>
                        <p>
                          Boutique {p.dominantStoreName ?? '—'}
                          {p.daysSinceLastPurchase != null
                            ? ` · dernier achat ${p.daysSinceLastPurchase} j`
                            : ' · jamais acheté'}
                        </p>
                        {p.isVip && p.vipTier ? (
                          <Badge tone="violet">
                            VIP {VIP_TIER_LABEL[p.vipTier]}
                          </Badge>
                        ) : null}
                      </div>
                    }
                  />
                ))}
              </ul>
            }
          />
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 text-[11px] text-ink-subtle">
        <IconDownload className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Les ventes sans fiche fidélité (téléphone / id client) n’apparaissent
        pas. Inscrivez les VIP dans le module VIP pour le segment VIP.
      </p>
    </div>
  )
}
