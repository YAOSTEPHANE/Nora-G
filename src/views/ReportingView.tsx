import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import { downloadTextFile, toCsvSemicolon } from '../lib/analyticsExport'
import {
  filterSalesByPeriodDays,
  filterSalesByStore,
} from '../lib/marginAnalytics'
import { formatFCFA } from '../lib/money'
import {
  buildPilotageOverview,
  buildProductPilotage,
  buildSellerPilotage,
  buildStorePilotage,
  daysCoverLabel,
  rateLabel,
  turnoverLabel,
  type PilotagePeriod,
  type ProductPilotageRow,
} from '../lib/reportingPilotage'
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
import { IconAnalytique, IconDownload } from '../ui/icons'
import { cn } from '../ui/cn'

type TabId = 'vue' | 'boutiques' | 'produits' | 'vendeuses' | 'stock'

const PERIODS: { value: PilotagePeriod; label: string }[] = [
  { value: 7, label: '7 jours' },
  { value: 14, label: '14 jours' },
  { value: 30, label: '30 jours' },
  { value: 90, label: '90 jours' },
]

export function ReportingView() {
  const { activeStoreId } = useActiveStore()
  const sales = useLiveQuery(() => db.sales.toArray(), [], []) ?? []
  const products = useLiveQuery(() => db.products.toArray(), [], []) ?? []
  const stores =
    useLiveQuery(() => db.stores.orderBy('sortOrder').toArray(), [], []) ?? []
  const stocks = useLiveQuery(() => db.storeStocks.toArray(), [], []) ?? []
  const history =
    useLiveQuery(
      () => db.purchasePriceHistory.orderBy('createdAt').reverse().toArray(),
      [],
      [],
    ) ?? []

  const [period, setPeriod] = useState<PilotagePeriod>(30)
  const [storeFilter, setStoreFilter] = useState<string>('all')
  const [tab, setTab] = useState<TabId>('vue')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setNow(Date.now())
  }, [period])

  const activeStores = useMemo(
    () => stores.filter((s) => !s.archived),
    [stores],
  )

  const rangeSales = useMemo(() => {
    const byPeriod = filterSalesByPeriodDays(sales, period, now)
    return filterSalesByStore(byPeriod, storeFilter)
  }, [sales, period, storeFilter, now])

  const overview = useMemo(
    () =>
      buildPilotageOverview({
        sales: rangeSales,
        products,
        history,
        stocks,
        storeId: storeFilter,
        periodDays: period,
      }),
    [rangeSales, products, history, stocks, storeFilter, period],
  )

  const storeRows = useMemo(
    () =>
      buildStorePilotage({
        sales: filterSalesByPeriodDays(sales, period, now),
        products,
        history,
        stores: activeStores,
        stocks,
      }),
    [sales, period, now, products, history, activeStores, stocks],
  )

  const productRows = useMemo(
    () =>
      buildProductPilotage({
        sales: rangeSales,
        products,
        history,
        stocks,
        storeId: storeFilter,
        periodDays: period,
      }),
    [rangeSales, products, history, stocks, storeFilter, period],
  )

  const sellerRows = useMemo(
    () => buildSellerPilotage({ sales: rangeSales }),
    [rangeSales],
  )

  const stockFocus = useMemo(() => {
    const slow = [...productRows]
      .filter(
        (r) =>
          r.stock > 0 && (r.turnoverRate == null || r.turnoverRate < 0.2),
      )
      .sort((a, b) => b.stockValueTTC - a.stockValueTTC)
      .slice(0, 25)
    const fast = [...productRows]
      .filter((r) => r.turnoverRate != null && r.turnoverRate >= 1)
      .sort((a, b) => (b.turnoverRate ?? 0) - (a.turnoverRate ?? 0))
      .slice(0, 25)
    const risk = [...productRows]
      .filter(
        (r) =>
          r.daysOfCover != null && r.daysOfCover <= 7 && r.qtySold > 0,
      )
      .sort((a, b) => (a.daysOfCover ?? 0) - (b.daysOfCover ?? 0))
      .slice(0, 25)
    return { slow, fast, risk }
  }, [productRows])

  const exportCsv = () => {
    let rows: string[][]
    if (tab === 'boutiques') {
      rows = [
        [
          'Boutique',
          'CA TTC',
          'Tickets',
          'Panier moyen',
          'Marge',
          'Taux marge %',
          'Stock unités',
          'Valeur stock',
          'Ruptures',
          'Alertes',
        ],
        ...storeRows.map((r) => [
          r.storeName,
          String(r.caTTC),
          String(r.salesCount),
          String(r.avgBasketTTC),
          String(r.marginTTC),
          r.marginRatePct != null ? String(r.marginRatePct) : '',
          String(r.stockUnits),
          String(r.stockValueTTC),
          String(r.ruptureCount),
          String(r.lowStockCount),
        ]),
      ]
    } else if (tab === 'vendeuses') {
      rows = [
        ['Vendeuse', 'CA net', 'Tickets', 'Panier moyen', 'Remises', 'Retours'],
        ...sellerRows.map((r) => [
          r.displayName,
          String(r.caNetTTC),
          String(r.salesCount),
          String(Math.round(r.avgBasketTTC)),
          String(r.discountTTC),
          String(r.refundTTC),
        ]),
      ]
    } else {
      rows = [
        [
          'Produit',
          'Catégorie',
          'Qté vendue',
          'CA',
          'Marge',
          'Stock',
          'Valeur stock',
          'Rotation',
          'Couverture j',
        ],
        ...productRows.slice(0, 500).map((r) => [
          r.name,
          r.category,
          String(r.qtySold),
          String(r.revenueTTC),
          r.marginTTC != null ? String(r.marginTTC) : '',
          String(r.stock),
          String(r.stockValueTTC),
          r.turnoverRate != null ? String(r.turnoverRate) : '',
          r.daysOfCover != null ? String(r.daysOfCover) : '',
        ]),
      ]
    }
    downloadTextFile(`pilotage-${tab}-${period}j.csv`, toCsvSemicolon(rows))
  }

  return (
    <div className="module-page space-y-6">
      <PageHeader
        icon={<IconAnalytique />}
        title="Reporting / pilotage"
        subtitle="CA, marge, stock, rotation, panier moyen — boutique, produit et vendeuse"
        actions={
          <Button
            type="button"
            variant="secondary"
            iconLeft={<IconDownload />}
            onClick={exportCsv}
          >
            Export CSV
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Période">
          <Select
            value={String(period)}
            onChange={(e) =>
              setPeriod(Number(e.target.value) as PilotagePeriod)
            }
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Boutique">
          <Select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
          >
            <option value="all">Réseau entier</option>
            {activeStores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.id === activeStoreId ? ' (active)' : ''}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Tabs
        variant="segmented"
        active={tab}
        onChange={setTab}
        items={[
          { id: 'vue', label: 'Vue d’ensemble' },
          { id: 'boutiques', label: 'Boutiques' },
          { id: 'produits', label: 'Produits' },
          { id: 'vendeuses', label: 'Vendeuses' },
          { id: 'stock', label: 'Stock / rotation' },
        ]}
      />

      {tab === 'vue' ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="CA net"
              value={formatFCFA(overview.caTTC)}
              tone="accent"
            />
            <Kpi
              label="Panier moyen"
              value={formatFCFA(overview.avgBasketTTC)}
              tone="violet"
            />
            <Kpi
              label="Marge"
              value={formatFCFA(overview.margin.marginTTC)}
              hint={rateLabel(overview.margin.marginRatePct)}
              tone="amber"
            />
            <Kpi
              label="Tickets"
              value={String(overview.salesCount)}
              tone="sky"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Valeur stock"
              value={formatFCFA(overview.stockValueTTC)}
            />
            <Kpi
              label="Unités en stock"
              value={overview.stockUnits.toLocaleString('fr-FR')}
            />
            <Kpi
              label="Rotation moy."
              value={turnoverLabel(overview.avgTurnoverRate)}
              hint="qty vendue / stock"
            />
            <Kpi
              label="Couverture moy."
              value={daysCoverLabel(overview.avgDaysOfCover)}
              hint={`${overview.ruptureCount} rupture(s) · ${overview.lowStockCount} alerte(s)`}
              tone="rose"
            />
          </div>

          <SectionHeader title="Top boutiques" />
          {storeRows.length === 0 ? (
            <EmptyState title="Aucune boutique" />
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
              {storeRows.slice(0, 5).map((r) => (
                <li
                  key={r.storeId}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-zinc-900">{r.storeName}</p>
                    <p className="text-xs text-zinc-500">
                      {r.salesCount} ticket(s) · panier{' '}
                      {formatFCFA(r.avgBasketTTC)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">
                      {formatFCFA(r.caTTC)}
                    </p>
                    <p className="text-xs text-zinc-500">
                      Marge {formatFCFA(r.marginTTC)} (
                      {rateLabel(r.marginRatePct)})
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <SectionHeader title="Top produits" />
          {productRows.length === 0 ? (
            <EmptyState
              title="Aucune vente sur la période"
              description="Changez la période ou la boutique."
            />
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
              {productRows.slice(0, 8).map((r) => (
                <li
                  key={r.productId}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-zinc-900">{r.name}</p>
                    <p className="text-xs text-zinc-500">
                      {r.qtySold} vendu(s) · stock {r.stock} · rot.{' '}
                      {turnoverLabel(r.turnoverRate)}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">
                    {formatFCFA(r.revenueTTC)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'boutiques' ? (
        <div className="space-y-4">
          <SectionHeader
            title="Performance par boutique"
            subtitle="CA, panier moyen, marge et état du stock"
          />
          {storeRows.length === 0 ? (
            <EmptyState title="Aucune boutique" />
          ) : (
            <>
              <TableScrollHint />
              <ResponsiveData
                table={
                  <Table minWidth={900}>
                    <THead>
                      <Tr hover={false}>
                        <Th>Boutique</Th>
                        <Th align="right">CA</Th>
                        <Th align="right">Tickets</Th>
                        <Th align="right">Panier</Th>
                        <Th align="right">Marge</Th>
                        <Th align="right">Taux</Th>
                        <Th align="right">Stock</Th>
                        <Th align="right">Ruptures</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {storeRows.map((r) => (
                        <Tr key={r.storeId}>
                          <Td className="font-medium">{r.storeName}</Td>
                          <Td align="right" mono>
                            {formatFCFA(r.caTTC)}
                          </Td>
                          <Td align="right" mono>
                            {r.salesCount}
                          </Td>
                          <Td align="right" mono>
                            {formatFCFA(r.avgBasketTTC)}
                          </Td>
                          <Td align="right" mono>
                            {formatFCFA(r.marginTTC)}
                          </Td>
                          <Td align="right" mono>
                            {rateLabel(r.marginRatePct)}
                          </Td>
                          <Td align="right" mono>
                            {formatFCFA(r.stockValueTTC)}
                          </Td>
                          <Td align="right" mono>
                            {r.ruptureCount}
                            {r.lowStockCount > 0
                              ? ` / ${r.lowStockCount} al.`
                              : ''}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                }
                cards={
                  <ul className="grid gap-2">
                    {storeRows.map((r) => (
                      <MobileDataCard
                        key={r.storeId}
                        title={r.storeName}
                        meta={`${r.salesCount} tickets · panier ${formatFCFA(r.avgBasketTTC)}`}
                        body={
                          <>
                            <Badge tone="accent">{formatFCFA(r.caTTC)}</Badge>
                            <p className="mt-2">
                              Marge {formatFCFA(r.marginTTC)} (
                              {rateLabel(r.marginRatePct)}) · Stock{' '}
                              {formatFCFA(r.stockValueTTC)} · {r.ruptureCount}{' '}
                              rupture(s)
                            </p>
                          </>
                        }
                      />
                    ))}
                  </ul>
                }
              />
            </>
          )}
        </div>
      ) : null}

      {tab === 'produits' ? (
        <div className="space-y-4">
          <SectionHeader
            title="Performance produit"
            subtitle={`${productRows.length} article(s) — CA, marge, stock et rotation`}
          />
          {productRows.length === 0 ? (
            <EmptyState title="Aucune vente produit" />
          ) : (
            <>
              <TableScrollHint />
              <ResponsiveData
                table={
                  <Table minWidth={920}>
                    <THead>
                      <Tr hover={false}>
                        <Th sticky>Produit</Th>
                        <Th hideBelow="md">Cat.</Th>
                        <Th align="right">Qté</Th>
                        <Th align="right">CA</Th>
                        <Th align="right">Marge</Th>
                        <Th align="right">Stock</Th>
                        <Th align="right">Rotation</Th>
                        <Th align="right" hideBelow="lg">
                          Couverture
                        </Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {productRows.slice(0, 100).map((r) => (
                        <Tr key={r.productId}>
                          <Td sticky className="font-medium">
                            {r.name}
                          </Td>
                          <Td hideBelow="md" className="text-zinc-500">
                            {r.category}
                          </Td>
                          <Td align="right" mono>
                            {r.qtySold}
                          </Td>
                          <Td align="right" mono>
                            {formatFCFA(r.revenueTTC)}
                          </Td>
                          <Td align="right" mono>
                            {r.marginTTC != null
                              ? formatFCFA(r.marginTTC)
                              : '—'}
                          </Td>
                          <Td align="right" mono>
                            {r.stock}
                          </Td>
                          <Td
                            align="right"
                            mono
                            className={cn(
                              r.turnoverRate != null &&
                                r.turnoverRate >= 1 &&
                                'text-emerald-700',
                              r.turnoverRate != null &&
                                r.turnoverRate < 0.2 &&
                                'text-amber-700',
                            )}
                          >
                            {turnoverLabel(r.turnoverRate)}
                          </Td>
                          <Td align="right" mono hideBelow="lg">
                            {daysCoverLabel(r.daysOfCover)}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                }
                cards={
                  <ul className="grid gap-2">
                    {productRows.slice(0, 40).map((r) => (
                      <MobileDataCard
                        key={r.productId}
                        title={r.name}
                        meta={r.category}
                        body={
                          <>
                            <Badge tone="accent">
                              {formatFCFA(r.revenueTTC)}
                            </Badge>
                            <p className="mt-2">
                              {r.qtySold} vendu(s) · stock {r.stock} · rot.{' '}
                              {turnoverLabel(r.turnoverRate)} · cov.{' '}
                              {daysCoverLabel(r.daysOfCover)}
                            </p>
                          </>
                        }
                      />
                    ))}
                  </ul>
                }
              />
            </>
          )}
        </div>
      ) : null}

      {tab === 'vendeuses' ? (
        <div className="space-y-4">
          <SectionHeader
            title="Performance vendeuses"
            subtitle="CA net, panier moyen, remises et retours"
          />
          {sellerRows.length === 0 ? (
            <EmptyState title="Aucune vente attribuée" />
          ) : (
            <>
              <TableScrollHint />
              <ResponsiveData
                table={
                  <Table minWidth={720}>
                    <THead>
                      <Tr hover={false}>
                        <Th>Vendeuse</Th>
                        <Th align="right">CA net</Th>
                        <Th align="right">Tickets</Th>
                        <Th align="right">Panier</Th>
                        <Th align="right">Remises</Th>
                        <Th align="right">Retours</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {sellerRows.map((r) => (
                        <Tr key={r.key}>
                          <Td className="font-medium">{r.displayName}</Td>
                          <Td align="right" mono>
                            {formatFCFA(r.caNetTTC)}
                          </Td>
                          <Td align="right" mono>
                            {r.salesCount}
                          </Td>
                          <Td align="right" mono>
                            {formatFCFA(Math.round(r.avgBasketTTC))}
                          </Td>
                          <Td align="right" mono>
                            {formatFCFA(r.discountTTC)}
                          </Td>
                          <Td align="right" mono>
                            {formatFCFA(r.refundTTC)}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                }
                cards={
                  <ul className="grid gap-2">
                    {sellerRows.map((r) => (
                      <MobileDataCard
                        key={r.key}
                        title={r.displayName}
                        meta={`${r.salesCount} tickets`}
                        body={
                          <>
                            <Badge tone="accent">
                              {formatFCFA(r.caNetTTC)}
                            </Badge>
                            <p className="mt-2">
                              Panier {formatFCFA(Math.round(r.avgBasketTTC))} ·
                              remises {formatFCFA(r.discountTTC)} · retours{' '}
                              {formatFCFA(r.refundTTC)}
                            </p>
                          </>
                        }
                      />
                    ))}
                  </ul>
                }
              />
            </>
          )}
        </div>
      ) : null}

      {tab === 'stock' ? (
        <div className="space-y-8">
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi
              label="Valeur stock"
              value={formatFCFA(overview.stockValueTTC)}
              tone="accent"
            />
            <Kpi
              label="Ruptures"
              value={String(overview.ruptureCount)}
              tone="rose"
            />
            <Kpi
              label="Alertes bas"
              value={String(overview.lowStockCount)}
              tone="amber"
            />
          </div>

          <section className="space-y-3">
            <SectionHeader
              title="Rotation rapide"
              subtitle="Produits qui tournent ≥ 1× le stock sur la période"
            />
            {stockFocus.fast.length === 0 ? (
              <EmptyState title="Aucune rotation rapide" variant="flat" />
            ) : (
              <ProductMiniList rows={stockFocus.fast} />
            )}
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Risque de rupture"
              subtitle="Couverture ≤ 7 jours avec ventes récentes"
            />
            {stockFocus.risk.length === 0 ? (
              <EmptyState title="Pas de risque immédiat" variant="flat" />
            ) : (
              <ProductMiniList rows={stockFocus.risk} highlightCover />
            )}
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Stock lent"
              subtitle="Stock élevé, rotation faible (< 0,2×)"
            />
            {stockFocus.slow.length === 0 ? (
              <EmptyState title="Pas de stock lent détecté" variant="flat" />
            ) : (
              <ProductMiniList rows={stockFocus.slow} />
            )}
          </section>
        </div>
      ) : null}
    </div>
  )
}

function ProductMiniList({
  rows,
  highlightCover = false,
}: {
  rows: ProductPilotageRow[]
  highlightCover?: boolean
}) {
  return (
    <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
      {rows.map((r) => (
        <li
          key={r.productId}
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
        >
          <div>
            <p className="font-medium text-zinc-900">{r.name}</p>
            <p className="text-xs text-zinc-500">
              stock {r.stock} · {r.qtySold} vendu(s) ·{' '}
              {formatFCFA(r.stockValueTTC)}
            </p>
          </div>
          <div className="text-right tabular-nums">
            <p className="font-semibold">{turnoverLabel(r.turnoverRate)}</p>
            <p
              className={cn(
                'text-xs',
                highlightCover ? 'text-rose-700' : 'text-zinc-500',
              )}
            >
              {daysCoverLabel(r.daysOfCover)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
