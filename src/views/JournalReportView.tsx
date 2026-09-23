import { useLiveQuery } from 'dexie-react-hooks'
import { useDomainProducts } from '../hooks/useDomainProducts'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefundSaleModal } from '../components/RefundSaleModal'
import { ExchangeSaleModal } from '../components/ExchangeSaleModal'
import { VoidSaleModal } from '../components/VoidSaleModal'
import { db } from '../db/db'
import type { AuditEvent, AuditEventKind, CartLine, CashOutflow, Sale } from '../db/types'
import type { UserRole } from '../auth/types'
import { downloadTextFile, toCsvSemicolon } from '../lib/analyticsExport'
import { appendAuditEvent } from '../lib/auditLog'
import {
  filterCashOutflowsByDate,
  sumCashOutflows,
  sumChangeDue,
} from '../lib/cashOutflows'
import { periodMarginTotals } from '../lib/marginAnalytics'
import { formatFCFA, DEFAULT_VAT_RATE_PCT } from '../lib/money'
import { getAppSettings } from '../lib/appSettings'
import { featuresForDomain } from '../lib/businessDomain'
import { paymentMethodShortLabel, salePaymentShortLabel } from '../lib/paymentDisplay'
import { saleFullyRefunded, saleNetTTC } from '../lib/refundMath'
import {
  filterSalesToday,
  paymentBreakdown,
  paymentStatsByMethod,
  saleLocalYmd,
  sumTotalTTC,
} from '../lib/salesStats'
import { SESSION_ID } from '../lib/session'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader, SectionHeader } from '../ui/PageHeader'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import {
  IconDownload,
  IconCheckCircle,
  IconEye,
  IconPrinter,
  IconRefund,
  IconSearch,
} from '../ui/icons'

type ReportTab = 'overview' | 'sales' | 'audit' | 'closure' | 'prescriptions'

function auditKindLabel(k: AuditEventKind): string {
  switch (k) {
    case 'cart_cancelled':
      return 'Annulation panier'
    case 'sale_refund':
      return 'Remboursement'
    case 'sale_void':
      return 'Annulation vente'
    case 'sale_exchange':
      return 'Échange'
    case 'promo_applied':
      return 'Code promo'
    case 'discount_override':
      return 'Remise gérant'
    case 'stock_adjusted':
      return 'Modification stock'
    case 'stock_transfer':
      return 'Transfert'
    case 'product_deleted':
      return 'Suppression produit'
    case 'time_punch':
      return 'Pointage'
    case 'ticket_invoice_updated':
      return 'Ticket/Facture modifié'
    case 'day_closure':
      return 'Clôture journalière'
    case 'day_reopen':
      return 'Réouverture journalière'
    case 'price_changed':
      return 'Modification de prix'
    case 'customer_return':
      return 'Retour client'
    case 'shrinkage':
      return 'Perte / casse'
    default: {
      const _exhaustive: never = k
      return _exhaustive
    }
  }
}

function auditPayloadSummary(ev: AuditEvent): string | null {
  try {
    const o = JSON.parse(ev.payloadJson) as Record<string, unknown>
    if (ev.kind === 'promo_applied') {
      const code = o.code
      const applied = o.appliedPct
      const prev = o.previousPct
      return typeof code === 'string'
        ? `${code} → ${String(applied)} % (avant ${String(prev)} %)`
        : null
    }
    if (ev.kind === 'discount_override') {
      const applied = o.appliedPct
      const manager = o.managerDisplayName
      return typeof applied === 'number'
        ? `${applied} % · ${String(manager ?? 'gérant')}`
        : null
    }
    if (ev.kind === 'sale_void' || ev.kind === 'sale_exchange') {
      const amount = o.amountTTC ?? o.returnedAmountTTC
      return typeof amount === 'number' ? formatFCFA(amount) : null
    }
    if (ev.kind === 'stock_adjusted') {
      const pq = o.previousQty
      const nq = o.newQty
      if (typeof pq === 'number' && typeof nq === 'number') {
        return `${pq} → ${nq} unité(s)`
      }
      return null
    }
    if (ev.kind === 'stock_transfer') {
      const q = o.qty
      const fn = o.fromStoreName
      const tn = o.toStoreName
      return typeof q === 'number'
        ? `${q} u. · ${String(fn ?? '?')} → ${String(tn ?? '?')}`
        : null
    }
    if (ev.kind === 'cart_cancelled') {
      const lines = o.lines as unknown[] | undefined
      return Array.isArray(lines) ? `${lines.length} ligne(s)` : null
    }
    if (ev.kind === 'time_punch') {
      const kind = o.kind === 'in' ? 'Arrivée' : o.kind === 'out' ? 'Départ' : null
      const store = o.storeName ?? o.storeId
      const note = o.note
      const bits = [kind, typeof store === 'string' ? store : null]
        .filter(Boolean)
        .join(' · ')
      if (typeof note === 'string' && note.trim()) {
        return `${bits} — ${note.trim()}`
      }
      return bits || null
    }
    if (ev.kind === 'ticket_invoice_updated') {
      const ref = o.reference
      const statusBefore = o.statusBefore
      const statusAfter = o.statusAfter
      const totalBefore = o.totalBefore
      const totalAfter = o.totalAfter
      const refPart = typeof ref === 'string' ? ref : 'Document'
      if (typeof totalBefore === 'number' && typeof totalAfter === 'number') {
        return `${refPart} · ${formatFCFA(totalBefore)} -> ${formatFCFA(totalAfter)} · ${String(statusBefore ?? '?')} -> ${String(statusAfter ?? '?')}`
      }
      return refPart
    }
    if (ev.kind === 'price_changed') {
      const name = o.productName
      const before = o.previousPriceTTC
      const after = o.newPriceTTC
      if (typeof before === 'number' && typeof after === 'number') {
        return `${String(name ?? 'Article')} · ${formatFCFA(before)} → ${formatFCFA(after)}`
      }
      return typeof name === 'string' ? name : null
    }
    if (ev.kind === 'customer_return') {
      const ref = o.reference
      const amount = o.amountTTC
      const product = o.productName
      return [
        typeof ref === 'string' ? ref : null,
        typeof product === 'string' ? product : null,
        typeof amount === 'number' ? formatFCFA(amount) : null,
      ]
        .filter(Boolean)
        .join(' · ') || null
    }
    if (ev.kind === 'shrinkage') {
      return [
        typeof o.kind === 'string' ? o.kind : null,
        typeof o.productName === 'string' ? o.productName : null,
        typeof o.amountTTC === 'number' ? formatFCFA(o.amountTTC) : null,
      ]
        .filter(Boolean)
        .join(' · ') || null
    }
    return null
  } catch {
    return null
  }
}

type Props = {
  canDailyClosure: boolean
  canReopenDay: boolean
  canProcessRefunds: boolean
  currentProfile: { id: string; displayName: string }
  currentRole: UserRole
  onViewReceipt: (sale: Sale) => void
  /** Charge la contrepartie d’un échange dans le panier caisse. */
  onLoadExchangeToCart?: (lines: CartLine[]) => void
}

export function JournalReportView({
  canDailyClosure,
  canReopenDay,
  canProcessRefunds,
  currentProfile,
  currentRole,
  onViewReceipt,
  onLoadExchangeToCart,
}: Props) {
  const toast = useToast()
  const showPrescriptions = featuresForDomain(
    getAppSettings().businessDomain,
  ).prescription
  const sales = useLiveQuery(() => db.sales.toArray(), [], []) ?? []
  const { products } = useDomainProducts()
  const priceHistory =
    useLiveQuery(() => db.purchasePriceHistory.toArray(), [], []) ?? []
  const allCashOutflows =
    useLiveQuery(() => db.cashOutflows.toArray(), [], []) ?? []
  const allAuditEvents =
    useLiveQuery(
      () => db.auditEvents.orderBy('createdAt').reverse().limit(120).toArray(),
      [],
      [],
    ) ?? []
  const prescriptionsToday =
    useLiveQuery(
      () => db.prescriptions.orderBy('createdAt').reverse().limit(100).toArray(),
      [],
      [],
    ) ?? []
  const todayYmd = saleLocalYmd(Date.now())
  const dayRow = useLiveQuery(() => db.dayClosures.get(todayYmd), [todayYmd])

  const today = useMemo(
    () =>
      filterSalesToday(sales).filter(
        (sale) =>
          sale.cashierProfileId === currentProfile.id ||
          (!sale.cashierProfileId &&
            sale.cashierDisplayName === currentProfile.displayName),
      ),
    [sales, currentProfile.id, currentProfile.displayName],
  )
  const outflowsToday = useMemo(
    () =>
      filterCashOutflowsByDate(allCashOutflows, todayYmd).sort(
        (a, b) => b.createdAt - a.createdAt,
      ),
    [allCashOutflows, todayYmd],
  )
  const outflowsTotalLive = useMemo(
    () => sumCashOutflows(outflowsToday),
    [outflowsToday],
  )
  const changeDueToday = useMemo(() => sumChangeDue(today), [today])
  const marginToday = useMemo(
    () => periodMarginTotals(today, products, priceHistory),
    [today, products, priceHistory],
  )
  const auditEvents = useMemo(
    () =>
      allAuditEvents.filter((ev) => ev.actorProfileId === currentProfile.id),
    [allAuditEvents, currentProfile.id],
  )
  const closureHistory = useMemo(
    () =>
      allAuditEvents
        .filter((ev) => ev.kind === 'day_closure' || ev.kind === 'day_reopen')
        .slice(0, 40),
    [allAuditEvents],
  )
  const total = useMemo(() => sumTotalTTC(today), [today])
  const breakdown = useMemo(() => paymentBreakdown(today), [today])
  const payStats = useMemo(() => paymentStatsByMethod(today), [today])
  const isClosed = dayRow?.closedAt != null
  const displayBreakdown = isClosed
    ? {
        cash: dayRow?.snapshotCash ?? 0,
        card: dayRow?.snapshotCard ?? 0,
        mobile: dayRow?.snapshotMobile ?? 0,
      }
    : breakdown
  const displayPayCounts = isClosed
    ? {
        cash: dayRow?.snapshotCashCount ?? 0,
        card: dayRow?.snapshotCardCount ?? 0,
        mobile: dayRow?.snapshotMobileCount ?? 0,
      }
    : {
        cash: payStats.cash.count,
        card: payStats.card.count,
        mobile: payStats.mobile.count,
      }
  const totalPay =
    displayBreakdown.cash +
      displayBreakdown.card +
      displayBreakdown.mobile || 1

  const openingFloat = dayRow?.openingFloat ?? 0
  const cashSalesToday = breakdown.cash
  const outflowsTotal = isClosed
    ? (dayRow?.snapshotCashOutflows ?? outflowsTotalLive)
    : outflowsTotalLive
  const theoreticalCash = openingFloat + cashSalesToday - outflowsTotal

  const [openingEdit, setOpeningEdit] = useState('0')
  const [countedEdit, setCountedEdit] = useState('')
  const [closureNote, setClosureNote] = useState('')
  const [outflowAmountEdit, setOutflowAmountEdit] = useState('')
  const [outflowLabelEdit, setOutflowLabelEdit] = useState('')
  const [busy, setBusy] = useState(false)
  const [refundSale, setRefundSale] = useState<Sale | null>(null)
  const [voidSale, setVoidSale] = useState<Sale | null>(null)
  const [exchangeSale, setExchangeSale] = useState<Sale | null>(null)
  const [pendingClosureUntil, setPendingClosureUntil] = useState(0)
  const [pendingReopenUntil, setPendingReopenUntil] = useState(0)
  const [reportTab, setReportTab] = useState<ReportTab>('overview')

  useEffect(() => {
    if (reportTab === 'prescriptions' && !showPrescriptions) {
      setReportTab('overview')
    }
  }, [reportTab, showPrescriptions])
  const [saleSearch, setSaleSearch] = useState('')

  useEffect(() => {
    if (dayRow) setOpeningEdit(String(dayRow.openingFloat))
    else setOpeningEdit('0')
  }, [dayRow?.dateYmd, dayRow?.openingFloat, todayYmd])

  const now = new Date()
  const dateStr = now.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const ticketCount = isClosed
    ? (dayRow?.snapshotTransactionCount ?? today.length)
    : today.length
  const totalNet = isClosed ? (dayRow?.snapshotTotalTTC ?? total) : total
  const avgTicket =
    ticketCount > 0 ? Math.round(totalNet / ticketCount) : 0

  const filteredToday = useMemo(() => {
    const q = saleSearch.trim().toLowerCase()
    const sorted = [...today].sort((a, b) => b.createdAt - a.createdAt)
    if (!q) return sorted
    return sorted.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        (s.cashierDisplayName ?? '').toLowerCase().includes(q) ||
        (s.storeName ?? '').toLowerCase().includes(q) ||
        salePaymentShortLabel(s).toLowerCase().includes(q),
    )
  }, [today, saleSearch])

  const saveOpeningFloat = useCallback(async () => {
    if (!canDailyClosure || isClosed) return
    const n = Number.parseInt(openingEdit.replace(/\s/g, ''), 10)
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Fond invalide')
      return
    }
    setBusy(true)
    try {
      const prev = (await db.dayClosures.get(todayYmd)) ?? {
        dateYmd: todayYmd,
        openingFloat: 0,
      }
      await db.dayClosures.put({ ...prev, dateYmd: todayYmd, openingFloat: n })
      toast.success('Fond enregistré', `${formatFCFA(n)}`)
    } finally {
      setBusy(false)
    }
  }, [canDailyClosure, isClosed, openingEdit, todayYmd, toast])

  const addCashOutflow = useCallback(async () => {
    if (!canDailyClosure || isClosed) return
    const amount = Number.parseInt(outflowAmountEdit.replace(/\s/g, ''), 10)
    const label = outflowLabelEdit.trim()
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Montant invalide', 'Indiquez un montant positif.')
      return
    }
    if (label.length < 2) {
      toast.error('Motif requis', 'Décrivez la sortie (min. 2 caractères).')
      return
    }
    setBusy(true)
    try {
      const row: CashOutflow = {
        id: crypto.randomUUID(),
        dateYmd: todayYmd,
        amount,
        label,
        createdAt: Date.now(),
        createdByProfileId: currentProfile.id,
        createdByDisplayName: currentProfile.displayName,
      }
      await db.cashOutflows.put(row)
      setOutflowAmountEdit('')
      setOutflowLabelEdit('')
      toast.success('Sortie enregistrée', formatFCFA(amount))
    } finally {
      setBusy(false)
    }
  }, [
    canDailyClosure,
    isClosed,
    outflowAmountEdit,
    outflowLabelEdit,
    todayYmd,
    currentProfile.id,
    currentProfile.displayName,
    toast,
  ])

  const deleteCashOutflow = useCallback(
    async (id: string) => {
      if (!canDailyClosure || isClosed) return
      setBusy(true)
      try {
        await db.cashOutflows.delete(id)
        toast.success('Sortie supprimée')
      } finally {
        setBusy(false)
      }
    },
    [canDailyClosure, isClosed, toast],
  )

  const performClosure = useCallback(async () => {
    if (!canDailyClosure || isClosed) return
    const now = Date.now()
    if (now > pendingClosureUntil) {
      setPendingClosureUntil(now + 7000)
      toast.warning(
        'Confirmer la clôture',
        'Cliquez encore sur "Clôturer la journée" dans les 7 secondes.',
      )
      return
    }
    const stats = paymentStatsByMethod(today)
    const cashTot = stats.cash.totalTTC
    const opening = dayRow?.openingFloat ?? 0
    const outflowsSnap = sumCashOutflows(
      filterCashOutflowsByDate(await db.cashOutflows.toArray(), todayYmd),
    )
    const expected = opening + cashTot - outflowsSnap
    const countedRaw = countedEdit.trim()
    const counted =
      countedRaw === ''
        ? undefined
        : Number.parseInt(countedRaw.replace(/\s/g, ''), 10)
    if (countedRaw !== '' && (!Number.isFinite(counted) || counted! < 0)) {
      toast.error('Montant compté invalide')
      return
    }
    const cashDifference = counted !== undefined ? counted - expected : undefined
    const noteTrim = closureNote.trim()
    if (cashDifference !== undefined && cashDifference !== 0 && noteTrim.length < 4) {
      toast.error(
        'Justificatif requis',
        'Ajoutez un commentaire (min. 4 caractères) quand il y a un écart de caisse.',
      )
      return
    }
    setBusy(true)
    try {
      const prev = (await db.dayClosures.get(todayYmd)) ?? {
        dateYmd: todayYmd,
        openingFloat: opening,
      }
      await db.dayClosures.put({
        ...prev,
        dateYmd: todayYmd,
        openingFloat: opening,
        closedAt: Date.now(),
        snapshotTotalTTC: sumTotalTTC(today),
        snapshotTransactionCount: today.length,
        snapshotCash: cashTot,
        snapshotCard: stats.card.totalTTC,
        snapshotMobile: stats.mobile.totalTTC,
        snapshotCashCount: stats.cash.count,
        snapshotCardCount: stats.card.count,
        snapshotMobileCount: stats.mobile.count,
        snapshotCashOutflows: outflowsSnap,
        expectedCashAtClose: expected,
        countedCash: counted,
        cashDifference,
        note: noteTrim || undefined,
        closedByProfileId: currentProfile.id,
        closedByDisplayName: currentProfile.displayName,
      })
      await appendAuditEvent({
        kind: 'day_closure',
        actor: {
          profileId: currentProfile.id,
          displayName: currentProfile.displayName,
        },
        reason:
          noteTrim ||
          (cashDifference === undefined || cashDifference === 0
            ? 'Clôture quotidienne'
            : 'Clôture avec écart justifié'),
        payload: {
          dateYmd: todayYmd,
          expectedCashAtClose: expected,
          countedCash: counted ?? null,
          cashDifference: cashDifference ?? null,
          cashOutflows: outflowsSnap,
          ticketCount: today.length,
          totalTTC: sumTotalTTC(today),
        },
      })
      setCountedEdit('')
      setClosureNote('')
      setPendingClosureUntil(0)
      toast.success('Journée clôturée')
    } finally {
      setBusy(false)
    }
  }, [
    canDailyClosure,
    isClosed,
    today,
    todayYmd,
    dayRow?.openingFloat,
    countedEdit,
    closureNote,
    currentProfile.id,
    currentProfile.displayName,
    toast,
    pendingClosureUntil,
  ])

  const reopenDay = useCallback(async () => {
    if (!canReopenDay || !isClosed) return
    const now = Date.now()
    if (now > pendingReopenUntil) {
      setPendingReopenUntil(now + 7000)
      toast.warning(
        'Confirmer la réouverture',
        'Cliquez encore sur "Réouvrir la journée" dans les 7 secondes.',
      )
      return
    }
    setBusy(true)
    try {
      const prev = await db.dayClosures.get(todayYmd)
      if (!prev) return
      await db.dayClosures.put({
        dateYmd: prev.dateYmd,
        openingFloat: prev.openingFloat,
      })
      await appendAuditEvent({
        kind: 'day_reopen',
        actor: {
          profileId: currentProfile.id,
          displayName: currentProfile.displayName,
        },
        reason: 'Réouverture de la journée',
        payload: {
          dateYmd: prev.dateYmd,
          previousClosedAt: prev.closedAt ?? null,
          previousExpectedCashAtClose: prev.expectedCashAtClose ?? null,
          previousCountedCash: prev.countedCash ?? null,
          previousCashDifference: prev.cashDifference ?? null,
        },
      })
      setPendingReopenUntil(0)
      toast.success('Journée réouverte')
    } finally {
      setBusy(false)
    }
  }, [
    canReopenDay,
    isClosed,
    pendingReopenUntil,
    toast,
    todayYmd,
    currentProfile.id,
    currentProfile.displayName,
  ])

  const exportDayCsv = useCallback(() => {
    const rows: string[][] = [
      ['Journal de caisse'],
      ['Date', todayYmd],
      ['Total TTC net', String(totalNet)],
      ['Tickets', String(ticketCount)],
      ['Panier moyen', String(avgTicket)],
      [],
      ['Réf vente', 'Heure', 'Magasin', 'Caissier', 'Paiement', 'Net TTC'],
      ...filteredToday.map((s) => [
          s.id.slice(0, 8).toUpperCase(),
          new Date(s.createdAt).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          s.storeName ?? '',
          s.cashierDisplayName ?? '',
          salePaymentShortLabel(s),
          String(saleNetTTC(s)),
        ]),
    ]
    downloadTextFile(`journal-caisse-${todayYmd}.csv`, toCsvSemicolon(rows))
    toast.success('Export journal prêt')
  }, [todayYmd, totalNet, ticketCount, avgTicket, filteredToday, toast])

  const exportClosureHistoryCsv = useCallback(() => {
    const rows: string[][] = [
      ['Historique clôtures / réouvertures'],
      ['Date export', new Date().toISOString()],
      [],
      ['Horodatage', 'Action', 'Acteur', 'Motif', 'Date caisse'],
      ...closureHistory.map((ev) => {
        let dateYmd = ''
        try {
          const p = JSON.parse(ev.payloadJson) as { dateYmd?: string }
          dateYmd = p.dateYmd ?? ''
        } catch {
          dateYmd = ''
        }
        return [
          new Date(ev.createdAt).toLocaleString('fr-FR'),
          auditKindLabel(ev.kind),
          ev.actorDisplayName,
          ev.reason,
          dateYmd,
        ]
      }),
    ]
    downloadTextFile(
      `historique-clotures-${todayYmd}.csv`,
      toCsvSemicolon(rows),
    )
    toast.success('Export historique prêt')
  }, [closureHistory, todayYmd, toast])

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconCheckCircle />}
        eyebrow="Rapport quotidien"
        title="Journal"
        subtitle={`${dateStr.charAt(0).toUpperCase()}${dateStr.slice(1)} · ${currentProfile.displayName} · Session #${SESSION_ID}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              iconLeft={<IconDownload />}
              onClick={exportDayCsv}
              className="w-full sm:w-auto"
            >
              Export CSV
            </Button>
            <Button
              variant="secondary"
              iconLeft={<IconPrinter />}
              onClick={() => window.print()}
              className="w-full sm:w-auto"
            >
              Imprimer
            </Button>
            <Button
              variant="secondary"
              iconLeft={<IconDownload />}
              onClick={exportClosureHistoryCsv}
              className="w-full sm:w-auto"
            >
              Export historique
            </Button>
          </div>
        }
      />

      {isClosed && dayRow?.closedAt ? (
        <Card>
          <CardContent className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <IconCheckCircle className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-zinc-900">
                Journée clôturée
              </p>
              <p className="text-[11px] text-zinc-500">
                {new Date(dayRow.closedAt).toLocaleString('fr-FR', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
                {dayRow.closedByDisplayName
                  ? ` · ${dayRow.closedByDisplayName}`
                  : ''}
                {dayRow.closedByDisplayName
                  ? ` (${currentRole === 'admin' ? 'admin' : currentRole})`
                  : ''}
              </p>
            </div>
            {canReopenDay ? (
              <Button
                size="sm"
                variant="secondary"
                loading={busy}
                onClick={() => void reopenDay()}
              >
                Réouvrir la journée
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Tabs
        variant="segmented"
        active={reportTab}
        onChange={setReportTab}
        items={[
          { id: 'overview', label: 'Synthèse' },
          { id: 'sales', label: 'Ventes', count: today.length },
          { id: 'audit', label: 'Audit', count: auditEvents.length },
          ...(showPrescriptions
            ? [
                {
                  id: 'prescriptions' as const,
                  label: 'Ordonnances',
                  count: prescriptionsToday.length || undefined,
                },
              ]
            : []),
          { id: 'closure', label: 'Clôture' },
        ]}
      />

      <div id="print-journal" className="space-y-5">
        {(reportTab === 'overview' || reportTab === 'sales') ? (
        <div className="catalogue-hero p-3 sm:p-4 md:p-5">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Total ventes (TTC)" value={formatFCFA(totalNet)} tone="accent" />
          <Kpi label="Tickets" value={String(ticketCount)} tone="neutral" />
          <Kpi label="Panier moyen" value={formatFCFA(avgTicket)} tone="violet" />
          <Kpi
            label="Solde caisse théorique"
            value={formatFCFA(
              isClosed && dayRow?.expectedCashAtClose != null
                ? dayRow.expectedCashAtClose
                : theoreticalCash,
            )}
            hint="Fond + espèces − sorties"
            tone="amber"
          />
          <Kpi
            label="Monnaie rendue"
            value={formatFCFA(changeDueToday)}
            hint="Somme des monnaies du jour"
            tone="neutral"
          />
          <Kpi
            label="Bénéfices (marge)"
            value={formatFCFA(marginToday.marginOnKnownTTC)}
            hint={
              marginToday.revenueWithCostTTC < marginToday.revenueTTC
                ? 'Sur articles avec prix de revient'
                : 'CA − coût d’achat'
            }
            tone="violet"
          />
          <Kpi
            label="Dépenses (sorties)"
            value={formatFCFA(outflowsTotal)}
            hint={`${outflowsToday.length} sortie${outflowsToday.length > 1 ? 's' : ''}`}
            tone="amber"
          />
        </div>
        </div>
        ) : null}

        {reportTab === 'overview' ? (
        <>
        <Card className="rounded-2xl">
          <CardContent>
            <h3 className="text-[14px] font-semibold text-zinc-900">
              Détail solde espèces
            </h3>
            <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2">
                <dt className="text-zinc-600">Fond de caisse</dt>
                <dd className="font-mono-nums font-semibold">
                  {formatFCFA(openingFloat)}
                </dd>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2">
                <dt className="text-zinc-600">+ Encaissements espèces</dt>
                <dd className="font-mono-nums font-semibold">
                  {formatFCFA(
                    isClosed ? (dayRow?.snapshotCash ?? 0) : cashSalesToday,
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 sm:col-span-2">
                <dt className="text-zinc-600">− Sorties de caisse</dt>
                <dd className="font-mono-nums font-semibold">
                  {formatFCFA(outflowsTotal)}
                </dd>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 sm:col-span-2">
                <dt className="font-semibold text-emerald-900">= Théorique</dt>
                <dd className="font-mono-nums font-bold text-emerald-900">
                  {formatFCFA(
                    isClosed && dayRow?.expectedCashAtClose != null
                      ? dayRow.expectedCashAtClose
                      : theoreticalCash,
                  )}
                </dd>
              </div>
            </dl>

            {!isClosed && canDailyClosure ? (
              <div className="mt-4 flex flex-col gap-2 border-t border-zinc-100 pt-4 sm:flex-row sm:items-end">
                <Field label="Modifier le fond (FCFA)" className="flex-1">
                  <Input
                    inputMode="numeric"
                    value={openingEdit}
                    onChange={(e) => setOpeningEdit(e.target.value)}
                    disabled={busy}
                    className="font-mono-nums"
                  />
                </Field>
                <Button
                  variant="primary"
                  loading={busy}
                  onClick={() => void saveOpeningFloat()}
                >
                  Enregistrer
                </Button>
              </div>
            ) : null}

            {isClosed &&
            dayRow?.countedCash != null &&
            dayRow.expectedCashAtClose != null ? (
              <div className="mt-4 space-y-1 rounded-lg border border-zinc-200 p-3 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-zinc-600">Compté en caisse</span>
                  <span className="font-mono-nums font-semibold">
                    {formatFCFA(dayRow.countedCash)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Écart</span>
                  <span
                    className={
                      (dayRow.cashDifference ?? 0) === 0
                        ? 'font-mono-nums font-bold text-emerald-700'
                        : 'font-mono-nums font-bold text-amber-700'
                    }
                  >
                    {formatFCFA(dayRow.cashDifference ?? 0)}
                  </span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent>
            <h3 className="text-[14px] font-semibold text-zinc-900">
              Sorties de caisse
            </h3>
            <p className="mt-1 text-[12px] text-zinc-500">
              Dépenses espèces (achats, retraits, frais). Elles diminuent le solde
              théorique.
            </p>

            {!isClosed && canDailyClosure ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
                <Field label="Montant (FCFA)">
                  <Input
                    inputMode="numeric"
                    value={outflowAmountEdit}
                    onChange={(e) => setOutflowAmountEdit(e.target.value)}
                    disabled={busy}
                    className="font-mono-nums"
                    placeholder="5000"
                  />
                </Field>
                <Field label="Motif">
                  <Input
                    value={outflowLabelEdit}
                    onChange={(e) => setOutflowLabelEdit(e.target.value)}
                    disabled={busy}
                    placeholder="Achat fournitures…"
                  />
                </Field>
                <Button
                  variant="primary"
                  loading={busy}
                  onClick={() => void addCashOutflow()}
                >
                  Ajouter
                </Button>
              </div>
            ) : null}

            {outflowsToday.length === 0 ? (
              <p className="mt-3 text-[13px] text-zinc-500">
                Aucune sortie aujourd’hui.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                {outflowsToday.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900">{row.label}</p>
                      <p className="text-[11px] text-zinc-500">
                        {new Date(row.createdAt).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {row.createdByDisplayName
                          ? ` · ${row.createdByDisplayName}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-nums font-semibold text-zinc-900">
                        {formatFCFA(row.amount)}
                      </span>
                      {!isClosed && canDailyClosure ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => void deleteCashOutflow(row.id)}
                        >
                          Supprimer
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex justify-between text-[13px] font-semibold">
              <span className="text-zinc-600">Total sorties</span>
              <span className="font-mono-nums">{formatFCFA(outflowsTotal)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent>
            <h3 className="text-[14px] font-semibold text-zinc-900">
              Modes de paiement
            </h3>
            <ul className="mt-3 space-y-3">
              {(
                [
                  ['cash', displayBreakdown.cash, displayPayCounts.cash] as const,
                  ['card', displayBreakdown.card, displayPayCounts.card] as const,
                  ['mobile', displayBreakdown.mobile, displayPayCounts.mobile] as const,
                ] as const
              ).map(([key, amount, count]) => {
                const pct = Math.round((amount / totalPay) * 100)
                return (
                  <li key={key}>
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-medium text-zinc-700">
                        {paymentMethodShortLabel(key)}
                      </span>
                      <span className="font-mono-nums font-semibold text-zinc-900">
                        {formatFCFA(amount)}{' '}
                        <span className="text-[11px] font-normal text-zinc-500">
                          · {count} ticket{count > 1 ? 's' : ''}
                        </span>
                      </span>
                    </div>
                    <progress
                      className="ui-pay-progress mt-1"
                      value={pct}
                      max={100}
                    />
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
        </>
        ) : null}

        {reportTab === 'closure' && !isClosed && canDailyClosure ? (
          <Card className="rounded-2xl">
            <CardContent>
              <h3 className="text-[14px] font-semibold text-zinc-900">
                Clôture journalière
              </h3>
              <p className="mt-1 text-[12px] text-zinc-500">
                Figez les totaux du jour (ventes, sorties). Saisissez le montant
                compté pour calculer l’écart vs fond + espèces − sorties.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Field label="Compté en caisse (optionnel)">
                  <Input
                    inputMode="numeric"
                    value={countedEdit}
                    onChange={(e) => setCountedEdit(e.target.value)}
                    placeholder="—"
                    disabled={busy}
                    className="font-mono-nums"
                  />
                </Field>
                <Field label="Commentaire" className="sm:col-span-2">
                  <Input
                    value={closureNote}
                    onChange={(e) => setClosureNote(e.target.value)}
                    disabled={busy}
                  />
                </Field>
              </div>
              <Button
                variant="primary"
                className="mt-4"
                loading={busy}
                onClick={() => void performClosure()}
              >
                Clôturer la journée
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {reportTab === 'closure' ? (
        <>
        <SectionHeader
          title="Historique clôtures / réouvertures"
          subtitle="Traçabilité opérationnelle exportable"
        />
        {closureHistory.length === 0 ? (
          <EmptyState title="Aucun historique" variant="flat" />
        ) : (
          <Card className="rounded-2xl">
            <CardContent className="p-0!">
              <ul className="divide-y divide-zinc-100">
                {closureHistory.map((ev) => (
                  <li key={ev.id} className="px-4 py-2.5 text-[12px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-800">
                        {auditKindLabel(ev.kind)}
                      </span>
                      <time
                        className="font-mono-nums text-[11px] text-zinc-500"
                        dateTime={new Date(ev.createdAt).toISOString()}
                      >
                        {new Date(ev.createdAt).toLocaleString('fr-FR', {
                          dateStyle: 'short',
                          timeStyle: 'medium',
                        })}
                      </time>
                    </div>
                    <p className="mt-0.5 text-zinc-600">
                      <span className="font-medium text-zinc-700">
                        {ev.actorDisplayName}
                      </span>{' '}
                      — <span className="italic">« {ev.reason} »</span>
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        </>
        ) : null}

        {reportTab === 'sales' ? (
        <>
        <div className="catalogue-filter-bar p-4">
          <Input
            type="search"
            value={saleSearch}
            onChange={(e) => setSaleSearch(e.target.value)}
            placeholder="Rechercher vente, caissier, paiement…"
            iconLeft={<IconSearch />}
          />
        </div>
        <SectionHeader
          title="Ventes du jour"
          subtitle="Montants nets après remboursements · profil connecté"
        />
        {filteredToday.length === 0 ? (
          <EmptyState
            title="Aucune vente aujourd’hui"
            description="Aucune vente enregistrée pour ce profil ou ce filtre."
            variant="flat"
          />
        ) : (
          <>
          <div className="hidden md:block">
          <Table minWidth={700}>
            <THead>
              <Tr hover={false}>
                <Th>Heure</Th>
                <Th hideBelow="md">Magasin</Th>
                <Th hideBelow="md">Caissier</Th>
                <Th>Paiement</Th>
                <Th align="right">Net</Th>
                <Th align="right">Reçu</Th>
                {canProcessRefunds ? (
                  <Th align="right" hideBelow="sm">
                    Actions
                  </Th>
                ) : null}
              </Tr>
            </THead>
            <TBody>
              {filteredToday.map((s) => (
                  <Tr key={s.id}>
                    <Td mono>
                      {new Date(s.createdAt).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Td>
                    <Td hideBelow="md" className="max-w-[140px] truncate">
                      {s.storeName ?? '—'}
                    </Td>
                    <Td hideBelow="md" className="max-w-[140px] truncate">
                      {s.cashierDisplayName ?? '—'}
                    </Td>
                    <Td>
                      <span className="block">
                        {salePaymentShortLabel(s)}
                      </span>
                      {saleFullyRefunded(s) ? (
                        <Badge tone="warning" className="mt-0.5">
                          Remb.
                        </Badge>
                      ) : null}
                    </Td>
                    <Td align="right" mono className="font-semibold">
                      {formatFCFA(saleNetTTC(s))}
                      {(s.refundsTotalTTC ?? 0) > 0 ? (
                        <span className="block text-[10px] text-amber-700">
                          −{formatFCFA(s.refundsTotalTTC ?? 0)}
                        </span>
                      ) : null}
                    </Td>
                    <Td align="right">
                      <Button
                        size="sm"
                        variant="ghost"
                        iconLeft={<IconEye />}
                        onClick={() => onViewReceipt(s)}
                        aria-label="Voir reçu"
                      >
                        <span className="hidden sm:inline">Voir</span>
                      </Button>
                    </Td>
                    {canProcessRefunds ? (
                      <Td align="right" hideBelow="sm">
                        {saleFullyRefunded(s) ? (
                          <span className="text-[11px] text-zinc-400">—</span>
                        ) : (
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              iconLeft={<IconRefund />}
                              onClick={() => setRefundSale(s)}
                              aria-label="Rembourser"
                            >
                              <span className="hidden lg:inline">Remb.</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setExchangeSale(s)}
                              aria-label="Échanger"
                            >
                              Éch.
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setVoidSale(s)}
                              aria-label="Annuler la vente"
                            >
                              Void
                            </Button>
                          </div>
                        )}
                      </Td>
                    ) : null}
                  </Tr>
                ))}
            </TBody>
          </Table>
          </div>

          <ul className="grid gap-2 md:hidden">
            {filteredToday.map((s) => (
              <li key={s.id} className="catalogue-cat-row p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono-nums text-[13px] font-semibold text-zinc-900">
                      {new Date(s.createdAt).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' · '}
                      {salePaymentShortLabel(s)}
                    </p>
                    <p className="truncate text-[11px] text-zinc-500">
                      {s.cashierDisplayName ?? '—'}
                      {s.storeName ? ` · ${s.storeName}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono-nums text-[14px] font-bold text-[var(--color-caisse-gold)]">
                    {formatFCFA(saleNetTTC(s))}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {saleFullyRefunded(s) ? (
                    <Badge tone="warning">Remboursé</Badge>
                  ) : null}
                  <div className="ml-auto flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      iconLeft={<IconEye />}
                      onClick={() => onViewReceipt(s)}
                      aria-label="Voir reçu"
                    />
                    {canProcessRefunds && !saleFullyRefunded(s) ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          iconLeft={<IconRefund />}
                          onClick={() => setRefundSale(s)}
                          aria-label="Rembourser"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setExchangeSale(s)}
                          aria-label="Échanger"
                        >
                          Éch.
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setVoidSale(s)}
                          aria-label="Annuler la vente"
                        >
                          Void
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          </>
        )}
        </>
        ) : null}

        {reportTab === 'prescriptions' ? (
          <>
            <SectionHeader
              title="Ordonnances enregistrées"
              subtitle="30 derniers jours · liées aux ventes avec produits soumis à prescription"
            />
            {prescriptionsToday.length === 0 ? (
              <EmptyState
                title="Aucune ordonnance"
                description="Les ordonnances saisies à la caisse apparaîtront ici."
                variant="flat"
              />
            ) : (
              <Card className="rounded-2xl">
                <CardContent className="p-0!">
                  <ul className="divide-y divide-zinc-100">
                    {prescriptionsToday.map((rx) => (
                      <li key={rx.id} className="px-4 py-3 text-[12px]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-zinc-900">
                            {rx.patientName}
                          </span>
                          <time className="font-mono-nums text-[11px] text-zinc-500">
                            {new Date(rx.createdAt).toLocaleString('fr-FR')}
                          </time>
                        </div>
                        <p className="mt-1 text-zinc-600">
                          {rx.prescriberName ? `Dr. ${rx.prescriberName}` : '—'}
                          {rx.prescriptionNumber
                            ? ` · N° ${rx.prescriptionNumber}`
                            : ''}
                          {rx.mutuelleName ? ` · ${rx.mutuelleName}` : ''}
                        </p>
                        <p className="font-mono-nums text-[11px] text-zinc-500">
                          {rx.saleId
                            ? `Vente ${rx.saleId.slice(0, 8).toUpperCase()}`
                            : 'Saisie registre'}
                        </p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}

        {reportTab === 'audit' ? (
        <>
        <SectionHeader
          title="Journal d’audit"
          subtitle="Append-only · données locales IndexedDB"
        />
        {auditEvents.length === 0 ? (
          <EmptyState title="Aucun événement" variant="flat" />
        ) : (
          <Card className="rounded-2xl">
            <CardContent className="p-0!">
              <ul className="divide-y divide-zinc-100">
                {auditEvents.map((ev) => {
                  const detail = auditPayloadSummary(ev)
                  return (
                    <li key={ev.id} className="px-4 py-2.5 text-[12px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-800">
                          {auditKindLabel(ev.kind)}
                        </span>
                        <time
                          className="font-mono-nums text-[11px] text-zinc-500"
                          dateTime={new Date(ev.createdAt).toISOString()}
                        >
                          {new Date(ev.createdAt).toLocaleString('fr-FR', {
                            dateStyle: 'short',
                            timeStyle: 'medium',
                          })}
                        </time>
                      </div>
                      <p className="mt-0.5 text-zinc-600">
                        <span className="font-medium text-zinc-700">
                          {ev.actorDisplayName}
                        </span>{' '}
                        — <span className="italic">« {ev.reason} »</span>
                      </p>
                      {detail ? (
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          {detail}
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        )}
        </>
        ) : null}
      </div>

      {refundSale ? (
        <RefundSaleModal
          sale={refundSale}
          actor={{
            profileId: currentProfile.id,
            displayName: currentProfile.displayName,
          }}
          onClose={() => setRefundSale(null)}
          onDone={() => {}}
        />
      ) : null}
      {voidSale ? (
        <VoidSaleModal
          sale={voidSale}
          actor={{
            profileId: currentProfile.id,
            displayName: currentProfile.displayName,
          }}
          onClose={() => setVoidSale(null)}
          onDone={() => {}}
        />
      ) : null}
      {exchangeSale ? (
        <ExchangeSaleModal
          sale={exchangeSale}
          products={products}
          actor={{
            profileId: currentProfile.id,
            displayName: currentProfile.displayName,
          }}
          onClose={() => setExchangeSale(null)}
          onDone={(lines) => {
            onLoadExchangeToCart?.(
              lines.map((l) => ({
                productId: l.productId,
                name: l.name,
                unitPriceTTC: l.unitPriceTTC,
                qty: l.qty,
                vatRatePct: l.vatRatePct ?? DEFAULT_VAT_RATE_PCT,
              })),
            )
          }}
        />
      ) : null}
    </div>
  )
}
