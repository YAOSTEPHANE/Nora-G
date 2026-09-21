import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { db } from '../db/db'
import type { PaymentMethod } from '../db/types'
import { downloadTextFile, toCsvSemicolon } from '../lib/analyticsExport'
import {
  aggregateWebOrdersByDay,
  filterOnlineOrdersInBucketWindow,
} from '../lib/onlineOrderStats'
import { formatFCFA } from '../lib/money'
import {
  periodMarginTotals,
  topProductsWithMargins,
} from '../lib/marginAnalytics'
import { paymentMethodShortLabel } from '../lib/paymentDisplay'
import {
  bucketSalesByLocalDay,
  paymentBreakdown,
  peakHourBuckets,
  sumTotalTTC,
} from '../lib/salesStats'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader } from '../ui/Card'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { Tabs } from '../ui/Tabs'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import { MobileDataCard, ResponsiveData } from '../ui/ResponsiveData'
import {
  IconDownload,
  IconFile,
  IconOnlineOrders,
  IconPrinter,
  IconSpreadsheet,
} from '../ui/icons'

type Period = 7 | 14 | 30 | 90

function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}h–${String((h + 1) % 24).padStart(2, '0')}h`
}

const COLORS = {
  ink: '#09090b',
  inkMuted: '#52525b',
  border: '#e4e4e7',
  accent: '#059669',
  accentSoft: '#d1fae5',
  violet: '#7c3aed',
  webPending: '#ca8a04',
  webApproved: '#059669',
  webRejected: '#e11d48',
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export function AnalytiqueView() {
  const sales = useLiveQuery(() => db.sales.toArray(), [], []) ?? []
  const products = useLiveQuery(() => db.products.toArray(), [], []) ?? []
  const priceHistory =
    useLiveQuery(() => db.purchasePriceHistory.toArray(), [], []) ?? []
  const onlineOrders =
    useLiveQuery(() => db.onlineOrders.toArray(), [], []) ?? []
  const [period, setPeriod] = useState<Period>(7)
  const [now] = useState(Date.now)

  const rangeSales = useMemo(() => {
    const buckets = bucketSalesByLocalDay(sales, period)
    const firstYmd = buckets[0]?.ymd
    if (!firstYmd) return []
    return sales.filter((s) => {
      const ymd = new Date(s.createdAt)
      const y = ymd.getFullYear()
      const m = String(ymd.getMonth() + 1).padStart(2, '0')
      const d = String(ymd.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}` >= firstYmd
    })
  }, [sales, period])
  const previousRangeSales = useMemo(() => {
    const shiftMs = period * 24 * 60 * 60 * 1000
    const startPrev = now - shiftMs * 2
    const endPrev = now - shiftMs
    return sales.filter((s) => s.createdAt >= startPrev && s.createdAt < endPrev)
  }, [sales, period, now])

  const buckets = useMemo(
    () => bucketSalesByLocalDay(sales, period),
    [sales, period],
  )

  const rangeWebOrders = useMemo(
    () => filterOnlineOrdersInBucketWindow(onlineOrders, buckets),
    [onlineOrders, buckets],
  )

  const webDaily = useMemo(
    () => aggregateWebOrdersByDay(rangeWebOrders, buckets),
    [rangeWebOrders, buckets],
  )

  const webStats = useMemo(() => {
    const created = rangeWebOrders.length
    const pending = rangeWebOrders.filter((o) => o.status === 'pending').length
    const approved = rangeWebOrders.filter((o) => o.status === 'approved').length
    const rejected = rangeWebOrders.filter((o) => o.status === 'rejected').length
    const sumTTC = rangeWebOrders.reduce((s, o) => s + o.totalTTC, 0)
    const sumApprovedTTC = rangeWebOrders
      .filter((o) => o.status === 'approved')
      .reduce((s, o) => s + o.totalTTC, 0)
    const finalized = approved + rejected
    const validationRatePct =
      finalized > 0 ? Math.round((100 * approved) / finalized) : null
    return {
      created,
      pending,
      approved,
      rejected,
      sumTTC,
      sumApprovedTTC,
      validationRatePct,
    }
  }, [rangeWebOrders])
  const caPeriod = useMemo(() => sumTotalTTC(rangeSales), [rangeSales])
  const caPreviousPeriod = useMemo(
    () => sumTotalTTC(previousRangeSales),
    [previousRangeSales],
  )
  const tickets = rangeSales.length
  const previousTickets = previousRangeSales.length
  const breakdown = useMemo(() => paymentBreakdown(rangeSales), [rangeSales])
  const payKeys = useMemo(() => {
    const keys: PaymentMethod[] = ['cash', 'card', 'mobile', 'credit']
    if (breakdown.mixed > 0) keys.push('mixed')
    return keys
  }, [breakdown.mixed])
  const sumPay =
    breakdown.cash +
      breakdown.card +
      breakdown.mobile +
      breakdown.mixed || 1

  const peaks = useMemo(() => peakHourBuckets(rangeSales), [rangeSales])
  const peakTop = useMemo(
    () => [...peaks].sort((a, b) => b.totalTTC - a.totalTTC).slice(0, 5),
    [peaks],
  )
  const maxPeak = useMemo(
    () => Math.max(1, ...peaks.map((p) => p.totalTTC)),
    [peaks],
  )

  const top = useMemo(
    () => topProductsWithMargins(rangeSales, products, 12, priceHistory),
    [rangeSales, products, priceHistory],
  )
  const marginTotals = useMemo(
    () => periodMarginTotals(rangeSales, products, priceHistory),
    [rangeSales, products, priceHistory],
  )
  const previousMarginTotals = useMemo(
    () => periodMarginTotals(previousRangeSales, products, priceHistory),
    [previousRangeSales, products, priceHistory],
  )
  const deltas = useMemo(
    () => ({
      caPct: pctDelta(caPeriod, caPreviousPeriod),
      ticketsPct: pctDelta(tickets, previousTickets),
      marginPct: pctDelta(
        marginTotals.marginOnKnownTTC,
        previousMarginTotals.marginOnKnownTTC,
      ),
    }),
    [
      caPeriod,
      caPreviousPeriod,
      tickets,
      previousTickets,
      marginTotals.marginOnKnownTTC,
      previousMarginTotals.marginOnKnownTTC,
    ],
  )

  const periodLabel = `${period} jours`
  const periodTabs = useMemo(
    () => [
      { id: '7' as const, label: '7 j' },
      { id: '14' as const, label: '14 j' },
      { id: '30' as const, label: '30 j' },
      { id: '90' as const, label: '90 j' },
    ],
    [],
  )

  const exportSummaryCsv = useCallback(() => {
    const rows: string[][] = [
      ['Rapport analytique Nora'],
      ['Période', periodLabel],
      ['CA net TTC', String(caPeriod)],
      ['Tickets', String(tickets)],
      ['Panier moyen TTC', String(tickets > 0 ? Math.round(caPeriod / tickets) : 0)],
      [],
      ['Marge'],
      ['CA net (lignes)', String(marginTotals.revenueTTC)],
      ['CA avec revient', String(marginTotals.revenueWithCostTTC)],
      ['Coût TTC', String(marginTotals.costTTC)],
      ['Marge TTC', String(marginTotals.marginOnKnownTTC)],
      ['Marge %', marginTotals.marginPctOnKnown != null ? `${marginTotals.marginPctOnKnown}` : '—'],
      [],
      ['Paiements', 'Montant TTC'],
      ...payKeys.map((k) => [paymentMethodShortLabel(k), String(breakdown[k])]),
    ]
    downloadTextFile(`analytique-resume-${period}j.csv`, toCsvSemicolon(rows))
  }, [period, periodLabel, caPeriod, tickets, marginTotals, payKeys, breakdown])

  const exportTopCsv = useCallback(() => {
    const rows: string[][] = [
      ['Article', 'Quantité', 'CA TTC net', 'Coût TTC', 'Marge TTC', 'Marge %'],
      ...top.map((r) => [
        r.name,
        String(r.qty),
        String(r.revenueTTC),
        r.costTTC != null ? String(r.costTTC) : '',
        r.marginTTC != null ? String(r.marginTTC) : '',
        r.marginPct != null ? String(r.marginPct) : '',
      ]),
    ]
    downloadTextFile(
      `analytique-top-produits-${period}j.csv`,
      toCsvSemicolon(rows),
    )
  }, [top, period])

  const exportPeaksCsv = useCallback(() => {
    const rows: string[][] = [
      ['Heure locale', 'Tickets', 'CA net TTC'],
      ...peaks.map((p) => [
        formatHour(p.hour),
        String(p.tickets),
        String(p.totalTTC),
      ]),
    ]
    downloadTextFile(`analytique-heures-${period}j.csv`, toCsvSemicolon(rows))
  }, [peaks, period])

  const exportDailyCsv = useCallback(() => {
    const rows: string[][] = [
      ['Date', 'CA net TTC', 'Tickets'],
      ...buckets.map((b) => [b.ymd, String(b.total), String(b.count)]),
    ]
    downloadTextFile(
      `analytique-ventes-jour-${period}j.csv`,
      toCsvSemicolon(rows),
    )
  }, [buckets, period])

  const exportWebOrdersCsv = useCallback(() => {
    const rows: string[][] = [
      ['Analytique — commandes web Nora'],
      ['Période (date de création)', periodLabel],
      ['Commandes créées', String(webStats.created)],
      ['En attente (état actuel)', String(webStats.pending)],
      ['Validées', String(webStats.approved)],
      ['Rejetées', String(webStats.rejected)],
      ['Montant total paniers créés (TTC)', String(webStats.sumTTC)],
      ['Montant commandes validées (TTC)', String(webStats.sumApprovedTTC)],
      [
        'Taux validation (validées / traitées)',
        webStats.validationRatePct != null
          ? `${webStats.validationRatePct} %`
          : '—',
      ],
      [],
      [
        'Réf',
        'Date création',
        'Magasin',
        'Client',
        'Statut',
        'Total TTC',
        'Paiement',
      ],
      ...rangeWebOrders.map((o) => [
        o.id.slice(0, 8).toUpperCase(),
        new Date(o.createdAt).toLocaleString('fr-FR'),
        o.storeName ?? o.storeId,
        o.customerName,
        o.status === 'pending'
          ? 'En attente'
          : o.status === 'approved'
            ? 'Validée'
            : 'Rejetée',
        String(o.totalTTC),
        paymentMethodShortLabel(o.paymentMethod),
      ]),
    ]
    downloadTextFile(
      `analytique-commandes-web-${period}j.csv`,
      toCsvSemicolon(rows),
    )
  }, [periodLabel, rangeWebOrders, webStats, period])

  const exportExcelWorkbook = useCallback(() => {
    const rows: string[][] = [
      ['=== Résumé ==='],
      ['Période', periodLabel],
      ['CA net TTC', String(caPeriod)],
      ['Tickets', String(tickets)],
      [],
      ['=== Ventes par jour ==='],
      ['Date', 'CA net TTC', 'Tickets'],
      ...buckets.map((b) => [b.ymd, String(b.total), String(b.count)]),
      [],
      ['=== Heures de pointe ==='],
      ['Heure', 'Tickets', 'CA net TTC'],
      ...peaks.map((p) => [
        formatHour(p.hour),
        String(p.tickets),
        String(p.totalTTC),
      ]),
      [],
      ['=== Top produits ==='],
      ['Article', 'Qté', 'CA TTC', 'Coût', 'Marge TTC', 'Marge %'],
      ...top.map((r) => [
        r.name,
        String(r.qty),
        String(r.revenueTTC),
        r.costTTC != null ? String(r.costTTC) : '',
        r.marginTTC != null ? String(r.marginTTC) : '',
        r.marginPct != null ? String(r.marginPct) : '',
      ]),
      [],
      ['=== Commandes web (créées sur la période) ==='],
      ['Créées', String(webStats.created)],
      ['En attente (état actuel)', String(webStats.pending)],
      ['Validées', String(webStats.approved)],
      ['Rejetées', String(webStats.rejected)],
      ['Montant total paniers (TTC)', String(webStats.sumTTC)],
      ['Montant validé (TTC)', String(webStats.sumApprovedTTC)],
      [
        'Taux validation %',
        webStats.validationRatePct != null
          ? String(webStats.validationRatePct)
          : '',
      ],
      [],
      ['Réf', 'Date création', 'Magasin', 'Client', 'Statut', 'Total TTC', 'Paiement'],
      ...rangeWebOrders.map((o) => [
        o.id.slice(0, 8).toUpperCase(),
        new Date(o.createdAt).toLocaleString('fr-FR'),
        o.storeName ?? o.storeId,
        o.customerName,
        o.status === 'pending'
          ? 'En attente'
          : o.status === 'approved'
            ? 'Validée'
            : 'Rejetée',
        String(o.totalTTC),
        paymentMethodShortLabel(o.paymentMethod),
      ]),
    ]
    downloadTextFile(
      `analytique-complet-${period}j.csv`,
      toCsvSemicolon(rows),
    )
  }, [
    buckets,
    peaks,
    top,
    period,
    periodLabel,
    caPeriod,
    tickets,
    rangeWebOrders,
    webStats,
  ])

  const dailyData = useMemo(
    () =>
      buckets.map((b) => ({
        label: b.label,
        ymd: b.ymd,
        total: b.total,
        tickets: b.count,
      })),
    [buckets],
  )

  const peakChartData = useMemo(
    () =>
      peaks.map((p) => ({
        h: `${String(p.hour).padStart(2, '0')}h`,
        hour: p.hour,
        tickets: p.tickets,
        total: p.totalTTC,
      })),
    [peaks],
  )

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconSpreadsheet />}
        eyebrow="Stats"
        title="Stats"
        subtitle={`Période glissante de ${periodLabel} · CA net après remboursements`}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Tabs
              variant="segmented"
              items={periodTabs}
              active={String(period) as '7' | '14' | '30' | '90'}
              onChange={(id) => setPeriod(Number(id) as Period)}
            />
            <div className="ui-divider hidden h-6 w-px bg-zinc-200 sm:inline-block" />
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<IconDownload />}
              onClick={exportSummaryCsv}
              className="w-full sm:w-auto"
            >
              Résumé
            </Button>
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<IconFile />}
              onClick={exportDailyCsv}
              className="w-full sm:w-auto"
            >
              Ventes / jour
            </Button>
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<IconFile />}
              onClick={exportPeaksCsv}
              className="w-full sm:w-auto"
            >
              Heures
            </Button>
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<IconFile />}
              onClick={exportTopCsv}
              className="w-full sm:w-auto"
            >
              Top
            </Button>
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<IconOnlineOrders />}
              onClick={exportWebOrdersCsv}
              className="w-full sm:w-auto"
            >
              Web
            </Button>
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<IconSpreadsheet />}
              onClick={exportExcelWorkbook}
              className="w-full sm:w-auto"
            >
              Excel
            </Button>
            <Button
              size="sm"
              variant="primary"
              iconLeft={<IconPrinter />}
              onClick={() => window.print()}
              className="w-full sm:w-auto"
            >
              PDF
            </Button>
          </div>
        }
      />

      <div id="print-analytique" className="space-y-6">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            label="CA net période"
            value={formatFCFA(caPeriod)}
            hint={`${tickets} ticket${tickets > 1 ? 's' : ''}${deltas.caPct != null ? ` · ${deltas.caPct >= 0 ? '+' : ''}${deltas.caPct}% vs période précédente` : ''}`}
            tone="accent"
          />
          <Kpi
            label="Panier moyen"
            value={formatFCFA(tickets > 0 ? Math.round(caPeriod / tickets) : 0)}
            tone="violet"
          />
          <Kpi
            label="Marge TTC connue"
            value={formatFCFA(marginTotals.marginOnKnownTTC)}
            hint={
              marginTotals.marginPctOnKnown != null
                ? `Taux ${marginTotals.marginPctOnKnown} %${deltas.marginPct != null ? ` · ${deltas.marginPct >= 0 ? '+' : ''}${deltas.marginPct}%` : ''}`
                : 'Renseignez le revient'
            }
            tone="amber"
          />
          <Kpi
            label="Coût d’achat estimé"
            value={formatFCFA(marginTotals.costTTC)}
            hint={`Sur articles avec revient${deltas.ticketsPct != null ? ` · ${deltas.ticketsPct >= 0 ? '+' : ''}${deltas.ticketsPct}% tickets` : ''}`}
            tone="neutral"
          />
        </div>

        <Card>
          <CardHeader
            title="Comparaison période précédente"
            subtitle={`${periodLabel} en cours vs ${periodLabel} précédent`}
          />
          <CardContent className="min-w-0">
            <ResponsiveData
              table={
                <Table minWidth={520}>
                  <THead>
                    <Tr hover={false}>
                      <Th sticky>Indicateur</Th>
                      <Th align="right">Période en cours</Th>
                      <Th align="right" hideBelow="lg">
                        Période précédente
                      </Th>
                      <Th align="right">Évolution</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    <Tr>
                      <Td sticky>CA net TTC</Td>
                      <Td align="right" mono>
                        {formatFCFA(caPeriod)}
                      </Td>
                      <Td align="right" mono hideBelow="lg">
                        {formatFCFA(caPreviousPeriod)}
                      </Td>
                      <Td
                        align="right"
                        mono
                        className={
                          deltas.caPct == null
                            ? 'text-zinc-500'
                            : deltas.caPct >= 0
                              ? 'text-emerald-700'
                              : 'text-rose-700'
                        }
                      >
                        {deltas.caPct == null
                          ? '—'
                          : `${deltas.caPct >= 0 ? '+' : ''}${deltas.caPct} %`}
                      </Td>
                    </Tr>
                    <Tr>
                      <Td sticky>Tickets</Td>
                      <Td align="right" mono>
                        {tickets}
                      </Td>
                      <Td align="right" mono hideBelow="lg">
                        {previousTickets}
                      </Td>
                      <Td
                        align="right"
                        mono
                        className={
                          deltas.ticketsPct == null
                            ? 'text-zinc-500'
                            : deltas.ticketsPct >= 0
                              ? 'text-emerald-700'
                              : 'text-rose-700'
                        }
                      >
                        {deltas.ticketsPct == null
                          ? '—'
                          : `${deltas.ticketsPct >= 0 ? '+' : ''}${deltas.ticketsPct} %`}
                      </Td>
                    </Tr>
                    <Tr>
                      <Td sticky>Marge TTC connue</Td>
                      <Td align="right" mono>
                        {formatFCFA(marginTotals.marginOnKnownTTC)}
                      </Td>
                      <Td align="right" mono hideBelow="lg">
                        {formatFCFA(previousMarginTotals.marginOnKnownTTC)}
                      </Td>
                      <Td
                        align="right"
                        mono
                        className={
                          deltas.marginPct == null
                            ? 'text-zinc-500'
                            : deltas.marginPct >= 0
                              ? 'text-emerald-700'
                              : 'text-rose-700'
                        }
                      >
                        {deltas.marginPct == null
                          ? '—'
                          : `${deltas.marginPct >= 0 ? '+' : ''}${deltas.marginPct} %`}
                      </Td>
                    </Tr>
                  </TBody>
                </Table>
              }
              cards={
                <ul className="grid gap-2">
                  {(
                    [
                      {
                        label: 'CA net TTC',
                        current: formatFCFA(caPeriod),
                        previous: formatFCFA(caPreviousPeriod),
                        delta: deltas.caPct,
                      },
                      {
                        label: 'Tickets',
                        current: String(tickets),
                        previous: String(previousTickets),
                        delta: deltas.ticketsPct,
                      },
                      {
                        label: 'Marge TTC connue',
                        current: formatFCFA(marginTotals.marginOnKnownTTC),
                        previous: formatFCFA(
                          previousMarginTotals.marginOnKnownTTC,
                        ),
                        delta: deltas.marginPct,
                      },
                    ] as const
                  ).map((row) => (
                    <MobileDataCard
                      key={row.label}
                      title={row.label}
                      body={
                        <div className="space-y-1">
                          <p className="font-mono-nums font-semibold text-ink">
                            En cours : {row.current}
                          </p>
                          <p className="font-mono-nums">Précédent : {row.previous}</p>
                          <p
                            className={
                              row.delta == null
                                ? 'text-zinc-500'
                                : row.delta >= 0
                                  ? 'text-emerald-700'
                                  : 'text-rose-700'
                            }
                          >
                            Évolution :{' '}
                            {row.delta == null
                              ? '—'
                              : `${row.delta >= 0 ? '+' : ''}${row.delta} %`}
                          </p>
                        </div>
                      }
                    />
                  ))}
                </ul>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            eyebrow="Canal web"
            title="Commandes"
            subtitle={`Créées sur ${periodLabel} · volumes par jour de création (état au moment présent)`}
            action={
              <Button
                size="sm"
                variant="secondary"
                className="print:hidden"
                iconLeft={<IconOnlineOrders />}
                onClick={exportWebOrdersCsv}
              >
                CSV
              </Button>
            }
          />
          <CardContent className="space-y-5">
            {webStats.created === 0 ? (
              <p className="py-6 text-center text-[13px] text-zinc-500">
                Aucune commande web créée sur cette fenêtre de dates.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Kpi
                    label="Commandes créées"
                    value={String(webStats.created)}
                    hint="Sur la période"
                    tone="neutral"
                  />
                  <Kpi
                    label="En attente"
                    value={String(webStats.pending)}
                    hint="État actuel"
                    tone="amber"
                  />
                  <Kpi
                    label="Validées"
                    value={String(webStats.approved)}
                    hint={formatFCFA(webStats.sumApprovedTTC)}
                    tone="accent"
                  />
                  <Kpi
                    label="Rejetées"
                    value={String(webStats.rejected)}
                    hint={
                      webStats.validationRatePct != null
                        ? `Taux validation ${webStats.validationRatePct} % (validées / traitées)`
                        : 'Pas encore de décision enregistrée'
                    }
                    tone="violet"
                  />
                </div>
                <div>
                  <p className="mb-2 text-[12px] font-medium text-zinc-700">
                    Répartition journalière (nombre de commandes)
                  </p>
                  <div className="h-[240px] w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={webDaily}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="2 6"
                          stroke={COLORS.border}
                          vertical={false}
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 9, fill: COLORS.inkMuted }}
                          axisLine={false}
                          tickLine={false}
                          interval={Math.max(0, Math.floor(webDaily.length / 14))}
                        />
                        <YAxis
                          allowDecimals={false}
                          width={32}
                          tick={{ fontSize: 10, fill: COLORS.inkMuted }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          cursor={{ fill: '#fafafa' }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null
                            const row = payload[0]?.payload as {
                              pending: number
                              approved: number
                              rejected: number
                              totalTTC: number
                            }
                            if (!row) return null
                            return (
                              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[12px] shadow-[var(--shadow-pop)]">
                                <p className="font-semibold text-zinc-700">{label}</p>
                                <ul className="mt-1 space-y-0.5 text-[11px] text-zinc-600">
                                  <li>En attente : {row.pending}</li>
                                  <li>Validées : {row.approved}</li>
                                  <li>Rejetées : {row.rejected}</li>
                                </ul>
                                <p className="mt-1 font-mono-nums text-[11px] text-zinc-500">
                                  Montant paniers : {formatFCFA(row.totalTTC)}
                                </p>
                              </div>
                            )
                          }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 11 }}
                          formatter={(value) =>
                            value === 'pending'
                              ? 'En attente'
                              : value === 'approved'
                                ? 'Validées'
                                : value === 'rejected'
                                  ? 'Rejetées'
                                  : String(value)
                          }
                        />
                        <Bar
                          dataKey="pending"
                          stackId="web"
                          name="pending"
                          fill={COLORS.webPending}
                          maxBarSize={28}
                        />
                        <Bar
                          dataKey="approved"
                          stackId="web"
                          name="approved"
                          fill={COLORS.webApproved}
                          maxBarSize={28}
                        />
                        <Bar
                          dataKey="rejected"
                          stackId="web"
                          name="rejected"
                          fill={COLORS.webRejected}
                          maxBarSize={28}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader
              title="Ventes par jour"
              subtitle="Agrégation journalière (calendrier local)"
            />
            <CardContent>
              <div className="h-[260px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 6" stroke={COLORS.border} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 9, fill: COLORS.inkMuted }}
                      axisLine={false}
                      tickLine={false}
                      interval={Math.max(0, Math.floor(dailyData.length / 14))}
                    />
                    <YAxis
                      tickFormatter={(v) =>
                        v >= 1_000_000
                          ? `${(v / 1_000_000).toFixed(1)}M`
                          : v >= 1000
                            ? `${Math.round(v / 1000)}k`
                            : String(v)
                      }
                      tick={{ fontSize: 10, fill: COLORS.inkMuted }}
                      axisLine={false}
                      tickLine={false}
                      width={42}
                    />
                    <Tooltip
                      cursor={{ fill: '#fafafa' }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.[0]) return null
                        const p = payload[0].payload as { tickets: number }
                        return (
                          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[12px] shadow-[var(--shadow-pop)]">
                            <p className="font-semibold text-zinc-700">{label}</p>
                            <p className="font-mono-nums text-zinc-900">
                              {formatFCFA(Number(payload[0].value ?? 0))}
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              {p.tickets} ticket{p.tickets > 1 ? 's' : ''}
                            </p>
                          </div>
                        )
                      }}
                    />
                    <Bar dataKey="total" radius={[3, 3, 0, 0]} fill={COLORS.ink} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Paiements" subtitle="Répartition TTC" />
            <CardContent>
              <ul className="space-y-3">
                {payKeys.map((k) => {
                  const v = breakdown[k]
                  const pct = Math.round((v / sumPay) * 100)
                  return (
                    <li key={k}>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-medium text-zinc-700">
                          {paymentMethodShortLabel(k)}
                        </span>
                        <span className="font-mono-nums font-semibold text-zinc-900">
                          {pct} %
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className="h-full rounded-full bg-zinc-900"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-0.5 text-right font-mono-nums text-[10px] text-zinc-500">
                        {formatFCFA(v)}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Heures de pointe"
            subtitle="CA net agrégé par tranche horaire (début de créneau)"
          />
          <CardContent>
            <div className="h-[220px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={peakChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 6" stroke={COLORS.border} vertical={false} />
                  <XAxis
                    dataKey="h"
                    tick={{ fontSize: 9, fill: COLORS.inkMuted }}
                    axisLine={false}
                    tickLine={false}
                    interval={2}
                  />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: '#fafafa' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null
                      const d = payload[0].payload as
                        | { h: string; tickets: number; total: number }
                        | undefined
                      if (!d) return null
                      return (
                        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[12px] shadow-[var(--shadow-pop)]">
                          <p className="font-semibold text-zinc-700">{d.h}</p>
                          <p className="font-mono-nums text-zinc-900">
                            {formatFCFA(d.total)}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            {d.tickets} ticket{d.tickets > 1 ? 's' : ''}
                          </p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="total" radius={[3, 3, 0, 0]} maxBarSize={14}>
                    {peakChartData.map((entry) => (
                      <Cell
                        key={entry.hour}
                        fill={
                          entry.total >= maxPeak * 0.8
                            ? COLORS.violet
                            : entry.total >= maxPeak * 0.4
                              ? COLORS.accent
                              : COLORS.accentSoft
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {peakTop.length > 0 ? (
              <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-[12px]">
                <p className="font-semibold text-zinc-800">Top 5 créneaux</p>
                <ol className="mt-1.5 space-y-0.5 pl-5 text-zinc-700">
                  {peakTop.map((p) => (
                    <li key={p.hour} className="list-decimal">
                      <span className="font-mono-nums">{formatHour(p.hour)}</span>
                      {' · '}
                      <span className="font-mono-nums font-semibold text-zinc-900">
                        {formatFCFA(p.totalTTC)}
                      </span>{' '}
                      ({p.tickets} ticket{p.tickets > 1 ? 's' : ''})
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Top articles & marges"
            subtitle="Quantités et CA nets après remboursements"
          />
          <CardContent className="min-w-0">
            <ResponsiveData
              empty={
                top.length === 0 ? (
                  <p className="py-10 text-center text-[13px] text-zinc-500">
                    Pas encore de données sur cette période
                  </p>
                ) : null
              }
              table={
                <Table minWidth={620}>
                  <THead>
                    <Tr hover={false}>
                      <Th hideBelow="sm">#</Th>
                      <Th sticky>Article</Th>
                      <Th align="right">Qté</Th>
                      <Th align="right">CA TTC</Th>
                      <Th align="right" hideBelow="md">
                        Coût
                      </Th>
                      <Th align="right">Marge</Th>
                      <Th align="right" hideBelow="md">
                        Marge %
                      </Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {top.map((row, i) => (
                      <Tr key={row.name}>
                        <Td hideBelow="sm" mono className="text-zinc-400">
                          {i + 1}
                        </Td>
                        <Td sticky className="font-medium text-zinc-900">
                          {row.name}
                        </Td>
                        <Td align="right" mono>
                          {row.qty}
                        </Td>
                        <Td align="right" mono className="font-semibold">
                          {formatFCFA(row.revenueTTC)}
                        </Td>
                        <Td align="right" hideBelow="md" mono>
                          {row.costTTC != null ? formatFCFA(row.costTTC) : '—'}
                        </Td>
                        <Td align="right" mono>
                          {row.marginTTC != null ? formatFCFA(row.marginTTC) : '—'}
                        </Td>
                        <Td align="right" hideBelow="md" mono>
                          {row.marginPct != null ? `${row.marginPct} %` : '—'}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              }
              cards={
                <ul className="grid gap-2">
                  {top.map((row, i) => (
                    <MobileDataCard
                      key={row.name}
                      title={`${i + 1}. ${row.name}`}
                      body={
                        <div className="grid grid-cols-2 gap-1.5">
                          <span>Qté : {row.qty}</span>
                          <span className="font-mono-nums font-semibold">
                            CA : {formatFCFA(row.revenueTTC)}
                          </span>
                          <span>
                            Coût :{' '}
                            {row.costTTC != null ? formatFCFA(row.costTTC) : '—'}
                          </span>
                          <span>
                            Marge :{' '}
                            {row.marginTTC != null
                              ? formatFCFA(row.marginTTC)
                              : '—'}
                            {row.marginPct != null ? ` (${row.marginPct} %)` : ''}
                          </span>
                        </div>
                      }
                    />
                  ))}
                </ul>
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
