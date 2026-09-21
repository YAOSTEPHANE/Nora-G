import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type {
  InventoryCountLine,
  InventorySession,
  InventorySessionStatus,
} from '../db/types'
import { appendAuditEvent } from '../lib/auditLog'
import { formatFCFA } from '../lib/money'
import { productIsActive } from '../lib/productFilters'
import { storeStockRowId } from '../lib/storeStockId'
import { enqueueStockSync } from '../lib/sync'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { IconCheckCircle, IconSearch } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

type LineFilter = 'all' | 'ecarts' | 'pending' | 'ok'

function statusLabel(s: InventorySessionStatus): string {
  switch (s) {
    case 'draft':
      return 'Brouillon'
    case 'counting':
      return 'En cours'
    case 'closed':
      return 'Clôturé'
    case 'cancelled':
      return 'Annulé'
    default: {
      const _e: never = s
      return _e
    }
  }
}

export function InventairePhysiqueView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId, activeStore } = useActiveStore()
  const products = useLiveQuery(() => db.products.toArray(), [], []) ?? []
  const sessions =
    useLiveQuery(
      () =>
        db.inventorySessions.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const lines =
    useLiveQuery(
      () =>
        activeSessionId
          ? db.inventoryCountLines
              .where('sessionId')
              .equals(activeSessionId)
              .toArray()
          : Promise.resolve([] as InventoryCountLine[]),
      [activeSessionId],
      [],
    ) ?? []

  const [lineFilter, setLineFilter] = useState<LineFilter>('all')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

  const priceByProduct = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of products) m.set(p.id, p.priceTTC)
    return m
  }, [products])

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null
  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.createdAt - a.createdAt),
    [sessions],
  )

  const counted = lines.filter((l) => l.countedQty != null).length
  const ecartLines = lines.filter(
    (l) => l.variance != null && l.variance !== 0,
  )
  const varianceAbsQty = ecartLines.reduce(
    (m, l) => m + Math.abs(l.variance ?? 0),
    0,
  )
  const varianceValueTTC = ecartLines.reduce((m, l) => {
    const price = priceByProduct.get(l.productId) ?? 0
    return m + Math.abs(l.variance ?? 0) * price
  }, 0)
  const surplusValue = ecartLines.reduce((m, l) => {
    if ((l.variance ?? 0) <= 0) return m
    return m + (l.variance ?? 0) * (priceByProduct.get(l.productId) ?? 0)
  }, 0)
  const shortageValue = ecartLines.reduce((m, l) => {
    if ((l.variance ?? 0) >= 0) return m
    return m + Math.abs(l.variance ?? 0) * (priceByProduct.get(l.productId) ?? 0)
  }, 0)

  const visibleLines = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...lines]
      .filter((l) => {
        if (lineFilter === 'ecarts')
          return l.variance != null && l.variance !== 0
        if (lineFilter === 'pending') return l.countedQty == null
        if (lineFilter === 'ok') return l.variance === 0
        return true
      })
      .filter((l) => {
        if (!q) return true
        return l.productName.toLowerCase().includes(q)
      })
      .sort((a, b) => {
        const va = Math.abs(a.variance ?? 0)
        const vb = Math.abs(b.variance ?? 0)
        if (lineFilter === 'ecarts' && va !== vb) return vb - va
        return a.productName.localeCompare(b.productName, 'fr')
      })
  }, [lines, lineFilter, search])

  const startSession = async () => {
    if (!canManage) return
    setBusy(true)
    try {
      const active = (await db.products.toArray()).filter(productIsActive)
      const stocks = await db.storeStocks
        .where('storeId')
        .equals(activeStoreId)
        .toArray()
      const stockMap = new Map(stocks.map((r) => [r.productId, r.stock]))
      const session: InventorySession = {
        id: crypto.randomUUID(),
        reference: `INV-${Date.now().toString(36).toUpperCase()}`,
        storeId: activeStoreId,
        storeName: activeStore?.name,
        status: 'counting',
        startedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByProfileId: actor.id,
        createdByDisplayName: actor.displayName,
      }
      await db.inventorySessions.add(session)
      const countLines: InventoryCountLine[] = active.map((p) => ({
        id: crypto.randomUUID(),
        sessionId: session.id,
        productId: p.id,
        productName: p.name,
        expectedQty: stockMap.get(p.id) ?? 0,
        countedQty: null,
        variance: null,
        updatedAt: Date.now(),
      }))
      await db.inventoryCountLines.bulkAdd(countLines)
      setActiveSessionId(session.id)
      setLineFilter('all')
      toast.success('Comptage démarré', `${countLines.length} articles`)
    } finally {
      setBusy(false)
    }
  }

  const setCounted = async (line: InventoryCountLine, raw: string) => {
    if (!canManage || activeSession?.status !== 'counting') return
    const countedQty = raw.trim() === '' ? null : Number(raw.replace(',', '.'))
    if (countedQty != null && (!Number.isFinite(countedQty) || countedQty < 0)) {
      toast.error('Quantité invalide')
      return
    }
    const variance =
      countedQty == null ? null : countedQty - line.expectedQty
    await db.inventoryCountLines.update(line.id, {
      countedQty,
      variance,
      updatedAt: Date.now(),
    })
  }

  const closeSession = async (applyStock: boolean) => {
    if (!canManage || !activeSession || activeSession.status !== 'counting')
      return
    setBusy(true)
    try {
      const currentLines = await db.inventoryCountLines
        .where('sessionId')
        .equals(activeSession.id)
        .toArray()
      const withVariance = currentLines.filter(
        (l) => l.variance != null && l.variance !== 0,
      )
      if (applyStock) {
        for (const line of currentLines) {
          if (line.countedQty == null) continue
          const product = await db.products.get(line.productId)
          const rid = storeStockRowId(activeStoreId, line.productId)
          await db.storeStocks.put({
            id: rid,
            storeId: activeStoreId,
            productId: line.productId,
            stock: line.countedQty,
          })
          await enqueueStockSync({
            productId: line.productId,
            stock: line.countedQty,
            lowStockThreshold: product?.lowStockThreshold ?? 5,
            storeId: activeStoreId,
          })
        }
      }
      await db.inventorySessions.update(activeSession.id, {
        status: 'closed',
        closedAt: Date.now(),
        updatedAt: Date.now(),
      })
      await appendAuditEvent({
        kind: 'stock_adjusted',
        actor: {
          profileId: actor.id,
          displayName: actor.displayName,
        },
        reason: applyStock
          ? `Inventaire ${activeSession.reference} clôturé — stocks ajustés`
          : `Inventaire ${activeSession.reference} clôturé — sans ajustement`,
        payload: {
          storeId: activeStoreId,
          sessionId: activeSession.id,
          reference: activeSession.reference,
          applyStock,
          linesCounted: currentLines.filter((l) => l.countedQty != null)
            .length,
          varianceLines: withVariance.length,
          varianceAbsQty: withVariance.reduce(
            (s, l) => s + Math.abs(l.variance ?? 0),
            0,
          ),
          source: 'inventory_count',
        },
      })
      toast.success(
        'Comptage clôturé',
        applyStock
          ? `${withVariance.length} écart(s) appliqué(s)`
          : 'Sans ajustement stock',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconCheckCircle />}
        title="Comptage physique"
        subtitle="Inventaire théorique vs physique — écarts et ajustements"
        actions={
          canManage ? (
            <Button
              variant="accent"
              loading={busy}
              onClick={() => void startSession()}
            >
              Nouveau comptage
            </Button>
          ) : null
        }
      />

      <div className="grid gap-2 lg:grid-cols-[240px_1fr]">
        <Card>
          <CardContent className="space-y-2">
            <p className="text-[12px] font-semibold">Sessions</p>
            {sortedSessions.length === 0 ? (
              <p className="text-[12px] text-ink-muted">Aucune session</p>
            ) : (
              <ul className="space-y-1">
                {sortedSessions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={
                        s.id === activeSessionId
                          ? 'w-full rounded-lg bg-[#e8eefa] px-2 py-1.5 text-left text-[12px]'
                          : 'w-full rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-zinc-50'
                      }
                      onClick={() => setActiveSessionId(s.id)}
                    >
                      <span className="font-medium">{s.reference}</span>
                      <Badge tone="neutral" className="ml-1">
                        {statusLabel(s.status)}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          {!activeSession ? (
            <EmptyState
              title="Sélectionnez une session"
              description="Ou démarrez un nouveau comptage pour comparer stock théorique et physique."
            />
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi
                  label="Comptées"
                  value={`${counted}/${lines.length}`}
                  tone="accent"
                />
                <Kpi
                  label="Lignes écart"
                  value={String(ecartLines.length)}
                  tone="amber"
                />
                <Kpi
                  label="Écarts (qté)"
                  value={String(varianceAbsQty)}
                  tone="rose"
                />
                <Kpi
                  label="Valeur écarts"
                  value={formatFCFA(Math.round(varianceValueTTC))}
                  hint={`+${formatFCFA(Math.round(surplusValue))} / −${formatFCFA(Math.round(shortageValue))}`}
                  tone="violet"
                />
              </div>

              {canManage && activeSession.status === 'counting' ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="accent"
                    loading={busy}
                    onClick={() => void closeSession(true)}
                  >
                    Clôturer et ajuster le stock
                  </Button>
                  <Button
                    variant="secondary"
                    loading={busy}
                    onClick={() => void closeSession(false)}
                  >
                    Clôturer sans ajuster
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Tabs
                  variant="segmented"
                  active={lineFilter}
                  onChange={setLineFilter}
                  items={[
                    { id: 'all', label: 'Tous', count: lines.length },
                    {
                      id: 'ecarts',
                      label: 'Écarts',
                      count: ecartLines.length || undefined,
                    },
                    {
                      id: 'pending',
                      label: 'À compter',
                      count: lines.length - counted || undefined,
                    },
                    { id: 'ok', label: 'Conformes' },
                  ]}
                />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un article…"
                  iconLeft={<IconSearch />}
                  className="sm:max-w-xs"
                />
              </div>

              <ul className="max-h-[55vh] space-y-1 overflow-auto">
                {visibleLines.length === 0 ? (
                  <EmptyState
                    title="Aucune ligne"
                    description="Changez le filtre ou la recherche."
                    variant="flat"
                  />
                ) : (
                  visibleLines.map((line) => {
                    const price = priceByProduct.get(line.productId) ?? 0
                    const valueEcart =
                      line.variance == null
                        ? null
                        : Math.round(line.variance * price)
                    return (
                      <li
                        key={line.id}
                        className="grid grid-cols-[1fr_70px_90px_70px_90px] items-center gap-2 rounded-lg border border-border/60 bg-white px-2 py-1.5 text-[12px]"
                      >
                        <span className="truncate font-medium">
                          {line.productName}
                        </span>
                        <span className="font-mono-nums text-ink-muted">
                          th. {line.expectedQty}
                        </span>
                        <Field label="">
                          <Input
                            inputMode="decimal"
                            disabled={
                              !canManage ||
                              activeSession.status !== 'counting'
                            }
                            defaultValue={
                              line.countedQty == null
                                ? ''
                                : String(line.countedQty)
                            }
                            key={`${line.id}-${line.updatedAt}`}
                            onBlur={(e) =>
                              void setCounted(line, e.target.value)
                            }
                            className="h-8 font-mono-nums"
                          />
                        </Field>
                        <span
                          className={
                            line.variance == null
                              ? 'font-mono-nums text-ink-muted'
                              : line.variance === 0
                                ? 'font-mono-nums text-emerald-700'
                                : 'font-mono-nums font-semibold text-rose-700'
                          }
                        >
                          {line.variance == null
                            ? '—'
                            : line.variance > 0
                              ? `+${line.variance}`
                              : String(line.variance)}
                        </span>
                        <span className="truncate font-mono-nums text-[11px] text-ink-muted">
                          {valueEcart == null
                            ? '—'
                            : valueEcart === 0
                              ? '0'
                              : valueEcart > 0
                                ? `+${formatFCFA(valueEcart)}`
                                : formatFCFA(valueEcart)}
                        </span>
                      </li>
                    )
                  })
                )}
              </ul>
              <p className="text-[10px] text-ink-muted">
                Colonnes : article · théorique · compté · écart qté · écart
                valeur (FCFA)
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
