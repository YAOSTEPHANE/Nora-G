import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { db } from '../db/db'
import { formatFCFA } from '../lib/money'
import {
  avgTicket,
  bucketSalesByLocalDay,
  filterSalesForStore,
  filterSalesOnLocalDay,
  saleLocalYmd,
  sumTotalTTC,
} from '../lib/salesStats'
import {
  VIEW_ACCENTS,
  VIEW_SUBTITLES,
  type NavSection,
  type NavViewId,
} from '../navigation'
import { cn } from '../ui/cn'
import {
  IconArrowUpRight,
  IconCaisse,
  IconOffline,
  IconOnline,
  IconOnlineOrders,
  IconReceipt,
  IconStore,
  IconTable,
  IconTrendingDown,
  IconTrendingUp,
  IconWarning,
} from '../ui/icons'
import { NavIcon } from './NavIcons'

type Props = {
  sections: readonly NavSection[]
  onSelectView: (id: NavViewId) => void
  ruptureCount?: number
  lowStockCount?: number
  onlineOrdersPending?: number
  staffName?: string
  storeName?: string
  storeId?: string
  online?: boolean
  dayClosed?: boolean
}

function badgeForItem(
  id: NavViewId,
  stockBadges: boolean | undefined,
  ruptureCount: number,
  lowStockCount: number,
  onlineOrdersPending: number,
): number | null {
  if (id === 'onlineOrders' && onlineOrdersPending > 0) return onlineOrdersPending
  if (id === 'stocks' && stockBadges) {
    const n = ruptureCount + lowStockCount
    return n > 0 ? n : null
  }
  return null
}

function firstName(name: string): string {
  const trimmed = name.trim()
  return trimmed.split(/\s+/)[0] ?? trimmed
}

function greetingForHour(hour: number): string {
  if (hour < 5 || hour >= 18) return 'Bonsoir'
  if (hour < 12) return 'Bonjour'
  return 'Bon après-midi'
}

function timeOfDay(hour: number): 'dawn' | 'day' | 'dusk' {
  if (hour < 6 || hour >= 19) return 'dusk'
  if (hour < 11) return 'dawn'
  return 'day'
}

function yesterdayYmd(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const d = new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1)
  d.setDate(d.getDate() - 1)
  return saleLocalYmd(d.getTime())
}

export function DashboardNavGrid({
  sections,
  onSelectView,
  ruptureCount = 0,
  lowStockCount = 0,
  onlineOrdersPending = 0,
  staffName,
  storeName,
  storeId,
  online = true,
  dayClosed = false,
}: Props) {
  const modules = useMemo(
    () => sections.flatMap((section) => section.items).filter((item) => item.id !== 'dash'),
    [sections],
  )
  const moduleIds = useMemo(() => new Set(modules.map((m) => m.id)), [modules])
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1_000)
    return () => window.clearInterval(id)
  }, [])

  const sinceMs = useMemo(() => Date.now() - 8 * 24 * 60 * 60 * 1000, [])
  const sales =
    useLiveQuery(
      () => db.sales.where('createdAt').above(sinceMs).toArray(),
      [sinceMs],
      [],
    ) ?? []
  const tables =
    useLiveQuery(
      () => db.diningTables.where('storeId').equals(storeId ?? '').toArray(),
      [storeId],
      [],
    ) ?? []

  const greeting = greetingForHour(now.getHours())
  const tod = timeOfDay(now.getHours())
  const dayKey = saleLocalYmd(now.getTime())
  const givenName = staffName ? firstName(staffName) : null
  const dateLabel = useMemo(
    () =>
      now.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [now],
  )
  const timeLabel = useMemo(
    () =>
      now.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [now],
  )
  const secondsLabel = useMemo(
    () => String(now.getSeconds()).padStart(2, '0'),
    [now],
  )

  const stats = useMemo(() => {
    const scoped = storeId ? filterSalesForStore(sales, storeId) : sales
    const today = filterSalesOnLocalDay(scoped, dayKey)
    const yesterday = filterSalesOnLocalDay(scoped, yesterdayYmd(dayKey))
    const caToday = sumTotalTTC(today)
    const caYesterday = sumTotalTTC(yesterday)
    const caDelta = caToday - caYesterday
    const buckets = bucketSalesByLocalDay(scoped, 7)
    const occupied = tables.filter((t) => t.status === 'occupied').length
    return {
      caToday,
      caDelta,
      tickets: today.length,
      avg: avgTicket(today),
      spark: buckets.map((b) => b.total),
      occupied,
      tableCount: tables.length,
    }
  }, [sales, storeId, dayKey, tables])

  const stockAlerts = ruptureCount + lowStockCount
  const hasAnalytique = moduleIds.has('analytique')
  const hasJournal = moduleIds.has('journal')
  const hasOrders = moduleIds.has('onlineOrders')
  const hasTables = moduleIds.has('tables') && stats.tableCount > 0

  return (
    <section aria-label="Tableau de bord" className="dash-launch">
      <div className="dash-launch-glow" aria-hidden />
      <div className="dash-launch-inner">
        <header className="dash-hero" data-tod={tod}>
          <div className="dash-hero-orb dash-hero-orb--a" aria-hidden />
          <div className="dash-hero-orb dash-hero-orb--b" aria-hidden />
          <div className="dash-hero-grid" aria-hidden />

          <div className="dash-hero-copy">
            <p className="dash-hero-kicker">
              <IconStore className="h-3.5 w-3.5" />
              <span className="truncate">{storeName ?? 'Magasin'}</span>
              <span className="dash-hero-dot" aria-hidden />
              <span className="capitalize">{dateLabel}</span>
            </p>
            <h2 className="dash-hero-title">
              {greeting}
              {givenName ? <span>, {givenName}</span> : null}
            </h2>
            <p className="dash-hero-lead">Ouvrez un module pour continuer.</p>
            <div className="dash-hero-pills">
              <span
                className={cn(
                  'dash-pill',
                  online ? 'dash-pill--live' : 'dash-pill--warn',
                )}
              >
                <span className="dash-pill-dot" />
                {online ? (
                  <IconOnline className="h-3.5 w-3.5" />
                ) : (
                  <IconOffline className="h-3.5 w-3.5" />
                )}
                {online ? 'En ligne' : 'Hors ligne'}
              </span>
              <span
                className={cn(
                  'dash-pill',
                  dayClosed ? 'dash-pill--warn' : 'dash-pill--ok',
                )}
              >
                {dayClosed ? 'Journée clôturée' : 'Journée ouverte'}
              </span>
              {staffName ? (
                <span className="dash-pill dash-pill--ghost">{staffName}</span>
              ) : null}
            </div>
          </div>

          <div className="dash-hero-clock">
            <p className="dash-hero-clock-label">Heure locale</p>
            <p className="dash-hero-clock-time">
              <span>{timeLabel}</span>
              <span className="dash-hero-clock-sec">{secondsLabel}</span>
            </p>
            <p className="dash-hero-clock-hint">Nora · session active</p>
          </div>
        </header>

        <div className="dash-kpi-grid">
          <button
            type="button"
            className="dash-kpi"
            onClick={() =>
              onSelectView(
                hasAnalytique ? 'analytique' : hasJournal ? 'journal' : 'caisse',
              )
            }
          >
            <span className="dash-kpi-top">
              <span className="dash-kpi-label">CA du jour</span>
              <span
                className={cn(
                  'dash-kpi-delta',
                  stats.caDelta >= 0 ? 'dash-kpi-delta--up' : 'dash-kpi-delta--down',
                )}
              >
                {stats.caDelta >= 0 ? (
                  <IconTrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <IconTrendingDown className="h-3.5 w-3.5" />
                )}
                {stats.caDelta >= 0 ? 'En hausse' : 'En baisse'}
              </span>
            </span>
            <span className="dash-kpi-value">{formatFCFA(stats.caToday)}</span>
            <span className="dash-spark" aria-hidden>
              {stats.spark.map((v, i) => {
                const max = Math.max(...stats.spark, 1)
                return (
                  <span
                    key={i}
                    className={cn('dash-spark-bar', i === stats.spark.length - 1 && 'is-now')}
                    style={{ height: `${Math.max(12, Math.round((v / max) * 100))}%` }}
                  />
                )
              })}
            </span>
          </button>

          <button
            type="button"
            className="dash-kpi"
            onClick={() => onSelectView(hasJournal ? 'journal' : 'caisse')}
          >
            <span className="dash-kpi-top">
              <span className="dash-kpi-label">Tickets</span>
              <IconReceipt className="h-4 w-4 text-[#0033aa]" />
            </span>
            <span className="dash-kpi-value font-mono-nums">{stats.tickets}</span>
            <span className="dash-kpi-hint">
              Panier moyen {formatFCFA(stats.avg || 0)}
            </span>
          </button>

          <button
            type="button"
            className="dash-kpi"
            onClick={() =>
              onSelectView(moduleIds.has('stocks') ? 'stocks' : 'caisse')
            }
          >
            <span className="dash-kpi-top">
              <span className="dash-kpi-label">Alertes stock</span>
              <IconWarning className="h-4 w-4 text-[#0033aa]" />
            </span>
            <span className="dash-kpi-value font-mono-nums">{stockAlerts}</span>
            <span className="dash-kpi-hint">
              {ruptureCount} rupture{ruptureCount > 1 ? 's' : ''} · {lowStockCount}{' '}
              bas
            </span>
          </button>

          {hasOrders ? (
            <button
              type="button"
              className="dash-kpi"
              onClick={() => onSelectView('onlineOrders')}
            >
              <span className="dash-kpi-top">
                <span className="dash-kpi-label">Commandes</span>
                <IconOnlineOrders className="h-4 w-4 text-[#0033aa]" />
              </span>
              <span className="dash-kpi-value font-mono-nums">
                {onlineOrdersPending}
              </span>
              <span className="dash-kpi-hint">En attente de validation</span>
            </button>
          ) : hasTables ? (
            <button
              type="button"
              className="dash-kpi"
              onClick={() => onSelectView('tables')}
            >
              <span className="dash-kpi-top">
                <span className="dash-kpi-label">Tables</span>
                <IconTable className="h-4 w-4 text-[#0033aa]" />
              </span>
              <span className="dash-kpi-value font-mono-nums">
                {stats.occupied}
                <span className="dash-kpi-over">/{stats.tableCount}</span>
              </span>
              <span className="dash-kpi-hint">Occupées en ce moment</span>
            </button>
          ) : (
            <button
              type="button"
              className="dash-kpi"
              onClick={() => onSelectView('caisse')}
            >
              <span className="dash-kpi-top">
                <span className="dash-kpi-label">Session</span>
                <IconCaisse className="h-4 w-4 text-[#0033aa]" />
              </span>
              <span className="dash-kpi-value">
                {dayClosed ? 'Fermée' : 'Active'}
              </span>
              <span className="dash-kpi-hint">Ouvrir la caisse</span>
            </button>
          )}
        </div>

        <div>
          <div className="dash-modules-head">
            <p className="dash-modules-kicker">Modules</p>
            <p className="dash-modules-count">{modules.length} accès</p>
          </div>
          <div className="dash-tile-grid">
            {modules.map((item, index) => {
              const accent = VIEW_ACCENTS[item.id]
              const badge = badgeForItem(
                item.id,
                item.stockBadges,
                ruptureCount,
                lowStockCount,
                onlineOrdersPending,
              )
              const isCaisse = item.id === 'caisse'
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectView(item.id)}
                  style={{ '--dash-i': index } as CSSProperties}
                  className={cn(
                    'dash-tile group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0033aa]/40',
                    isCaisse && 'dash-tile--hero',
                  )}
                >
                  <span className="relative shrink-0">
                    <span className={cn('dash-tile-icon', accent.icon)}>
                      <NavIcon id={item.id} className="h-10 w-10" />
                    </span>
                    {badge != null ? (
                      <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-md ring-2 ring-white">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="dash-tile-copy flex flex-col items-center">
                    <span className="dash-tile-label">{item.label}</span>
                    <span className="dash-tile-caption">{VIEW_SUBTITLES[item.id]}</span>
                  </span>
                  {isCaisse ? (
                    <span className="dash-tile-cta">
                      Ouvrir
                      <IconArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
