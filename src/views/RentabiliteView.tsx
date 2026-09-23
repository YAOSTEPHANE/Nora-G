import { useLiveQuery } from 'dexie-react-hooks'
import { useDomainProducts } from '../hooks/useDomainProducts'
import { useMemo, useState } from 'react'
import { db } from '../db/db'
import { downloadTextFile, toCsvSemicolon } from '../lib/analyticsExport'
import { formatFCFA } from '../lib/money'
import {
  aggregateProfitability,
  filterSalesByPeriodDays,
  filterSalesByStore,
  profitabilityTotals,
  type ProfitabilityDimension,
  type ProfitabilityRow,
} from '../lib/marginAnalytics'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Field, Select } from '../ui/Input'
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
  IconSpreadsheet,
  IconTrendingUp,
} from '../ui/icons'
import { cn } from '../ui/cn'

type Period = 7 | 14 | 30 | 90

type TabId = ProfitabilityDimension

function rateLabel(v: number | null, suffix = ' %'): string {
  if (v == null) return '—'
  return `${v}${suffix}`
}

function coverageHint(row: ProfitabilityRow | { linesWithCost: number; linesWithoutCost: number }): string {
  const known = row.linesWithCost
  const unknown = row.linesWithoutCost
  const total = known + unknown
  if (total === 0) return 'Aucune ligne'
  const pct = Math.round((known / total) * 100)
  return `${pct} % des lignes avec coût d’achat`
}

export function RentabiliteView() {
  const sales = useLiveQuery(() => db.sales.toArray(), [], []) ?? []
  const { products } = useDomainProducts()
  const stores =
    useLiveQuery(() => db.stores.orderBy('sortOrder').toArray(), [], []) ?? []
  const history =
    useLiveQuery(
      () => db.purchasePriceHistory.orderBy('createdAt').reverse().toArray(),
      [],
      [],
    ) ?? []

  const [period, setPeriod] = useState<Period>(30)
  const [storeFilter, setStoreFilter] = useState<string>('all')
  const [tab, setTab] = useState<TabId>('product')
  const [now] = useState(Date.now)

  const activeStores = useMemo(
    () => stores.filter((s) => !s.archived),
    [stores],
  )

  const rangeSales = useMemo(() => {
    const byPeriod = filterSalesByPeriodDays(sales, period, now)
    return filterSalesByStore(byPeriod, storeFilter)
  }, [sales, period, storeFilter, now])

  const totals = useMemo(
    () => profitabilityTotals(rangeSales, products, history),
    [rangeSales, products, history],
  )

  const rows = useMemo(
    () =>
      aggregateProfitability({
        sales: rangeSales,
        products,
        history,
        stores: activeStores,
        dimension: tab,
      }),
    [rangeSales, products, history, activeStores, tab],
  )

  const missingCostCount = useMemo(
    () => products.filter((p) => p.purchasePriceTTC == null && !p.archived).length,
    [products],
  )

  const exportCsv = () => {
    const header = [
      'Libellé',
      'Qté',
      'CA TTC',
      'CA avec coût',
      'Coût d’achat',
      'Marge TTC',
      'Taux marge %',
      'Taux marque %',
      'Coeff.',
    ]
    const body = rows.map((r) => [
      r.label,
      String(r.qty),
      String(r.revenueTTC),
      String(r.revenueWithCostTTC),
      String(r.costTTC),
      String(r.marginTTC),
      r.marginRatePct != null ? String(r.marginRatePct) : '',
      r.markupRatePct != null ? String(r.markupRatePct) : '',
      r.multiplier != null ? String(r.multiplier) : '',
    ])
    downloadTextFile(
      `rentabilite-${tab}-${period}j.csv`,
      toCsvSemicolon([header, ...body]),
    )
  }

  const periodLabel =
    period === 7
      ? '7 jours'
      : period === 14
        ? '14 jours'
        : period === 30
          ? '30 jours'
          : '90 jours'

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconTrendingUp />}
        eyebrow="Rentabilité"
        title="Marge & rentabilité"
        subtitle="Marge par produit, catégorie, boutique, période et vendeuse — coût d’achat réel, taux de marge et de marque"
        actions={
          <Button
            size="sm"
            variant="secondary"
            iconLeft={<IconSpreadsheet />}
            onClick={exportCsv}
            disabled={rows.length === 0}
          >
            Export CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <Field label="Période" className="sm:w-40">
          <Select
            value={String(period)}
            onChange={(e) =>
              setPeriod(Number(e.target.value) as Period)
            }
          >
            <option value="7">7 jours</option>
            <option value="14">14 jours</option>
            <option value="30">30 jours</option>
            <option value="90">90 jours</option>
          </Select>
        </Field>
        <Field label="Boutique" className="sm:w-56">
          <Select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
          >
            <option value="all">Tout le réseau</option>
            {activeStores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <p className="pb-2 text-[12px] text-ink-muted">
          {rangeSales.length} vente(s) · {periodLabel}
          {storeFilter !== 'all'
            ? ` · ${activeStores.find((s) => s.id === storeFilter)?.name ?? ''}`
            : ''}
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="CA net période"
          value={formatFCFA(totals.revenueTTC)}
          hint={coverageHint(totals)}
          tone="accent"
        />
        <Kpi
          label="Coût d’achat réel"
          value={formatFCFA(totals.costTTC)}
          hint="Historique achats puis prix catalogue"
          tone="amber"
        />
        <Kpi
          label="Marge TTC"
          value={formatFCFA(totals.marginTTC)}
          hint={
            totals.marginRatePct != null
              ? `Taux de marge ${totals.marginRatePct} %`
              : 'Renseignez les prix d’achat'
          }
          tone="violet"
        />
        <Kpi
          label="Taux de marque"
          value={rateLabel(totals.markupRatePct)}
          hint={
            totals.multiplier != null
              ? `Coeff. ×${totals.multiplier}`
              : 'Marge / coût d’achat'
          }
          tone="sky"
        />
      </div>

      {missingCostCount > 0 ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          {missingCostCount} article(s) sans prix d’achat catalogue. La marge
          s’appuie sur l’historique des réceptions Achats quand il existe.
        </p>
      ) : null}

      <Tabs
        variant="segmented"
        active={tab}
        onChange={setTab}
        items={[
          { id: 'product', label: 'Produits', count: rows.length || undefined },
          { id: 'category', label: 'Catégories' },
          { id: 'store', label: 'Boutiques' },
          { id: 'cashier', label: 'Vendeuses' },
          { id: 'day', label: 'Par jour' },
        ]}
      />

      <SectionHeader
        title={
          tab === 'product'
            ? 'Marge par produit'
            : tab === 'category'
              ? 'Marge par catégorie'
              : tab === 'store'
                ? 'Marge par boutique'
                : tab === 'cashier'
                  ? 'Marge par vendeuse / caissier'
                  : 'Marge par jour'
        }
        subtitle="Taux de marge = marge÷CA · Taux de marque = marge÷coût · Coeff. = CA÷coût"
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Aucune vente sur la période"
          description="Élargissez la période ou changez de boutique."
        />
      ) : (
        <div className="min-w-0">
          <TableScrollHint />
          <ResponsiveData
            table={
              <Table minWidth={820}>
                <THead>
                  <Tr hover={false}>
                    <Th sticky>
                      {tab === 'product'
                        ? 'Article'
                        : tab === 'category'
                          ? 'Catégorie'
                          : tab === 'store'
                            ? 'Boutique'
                            : tab === 'cashier'
                              ? 'Vendeuse'
                              : 'Jour'}
                    </Th>
                    <Th align="right">Qté</Th>
                    <Th align="right" hideBelow="lg">
                      CA TTC
                    </Th>
                    <Th align="right">Coût</Th>
                    <Th align="right">Marge</Th>
                    <Th align="right">Marge %</Th>
                    <Th align="right" hideBelow="md">
                      Marque %
                    </Th>
                    <Th align="right" hideBelow="xl">
                      Coeff.
                    </Th>
                  </Tr>
                </THead>
                <TBody>
                  {rows.map((r) => (
                    <Tr key={r.key}>
                      <Td sticky className="font-medium text-zinc-900">
                        {r.label}
                        {tab === 'product' && r.category ? (
                          <span className="block text-[10px] font-normal text-zinc-400">
                            {r.category}
                          </span>
                        ) : null}
                        {r.linesWithoutCost > 0 ? (
                          <Badge tone="warning" className="mt-0.5">
                            {r.linesWithoutCost} s/ coût
                          </Badge>
                        ) : null}
                      </Td>
                      <Td align="right" mono>
                        {r.qty}
                      </Td>
                      <Td align="right" mono hideBelow="lg">
                        {formatFCFA(r.revenueTTC)}
                      </Td>
                      <Td align="right" mono>
                        {r.revenueWithCostTTC > 0
                          ? formatFCFA(r.costTTC)
                          : '—'}
                      </Td>
                      <Td
                        align="right"
                        mono
                        className={cn(
                          'font-semibold',
                          r.marginTTC < 0
                            ? 'text-rose-600'
                            : 'text-zinc-900',
                        )}
                      >
                        {r.revenueWithCostTTC > 0
                          ? formatFCFA(r.marginTTC)
                          : '—'}
                      </Td>
                      <Td align="right" mono>
                        {rateLabel(r.marginRatePct)}
                      </Td>
                      <Td align="right" mono hideBelow="md">
                        {rateLabel(r.markupRatePct)}
                      </Td>
                      <Td align="right" mono hideBelow="xl">
                        {r.multiplier != null ? `×${r.multiplier}` : '—'}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            }
            cards={
              <ul className="grid gap-2">
                {rows.map((r) => (
                  <MobileDataCard
                    key={r.key}
                    title={r.label}
                    meta={
                      tab === 'product' && r.category ? r.category : undefined
                    }
                    body={
                      <div className="space-y-1 text-[12px]">
                        <p>
                          Qté {r.qty} · CA {formatFCFA(r.revenueTTC)}
                        </p>
                        <p>
                          Coût{' '}
                          {r.revenueWithCostTTC > 0
                            ? formatFCFA(r.costTTC)
                            : '—'}{' '}
                          · Marge{' '}
                          {r.revenueWithCostTTC > 0
                            ? formatFCFA(r.marginTTC)
                            : '—'}
                        </p>
                        <p>
                          Marge {rateLabel(r.marginRatePct)} · Marque{' '}
                          {rateLabel(r.markupRatePct)}
                          {r.multiplier != null
                            ? ` · ×${r.multiplier}`
                            : ''}
                        </p>
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
        Coût d’achat réel : prix à la date de vente (historique Achats /
        réceptions), à défaut le prix de revient catalogue actuel.
      </p>
    </div>
  )
}
