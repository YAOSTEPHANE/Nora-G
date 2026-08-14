import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type {
  InventoryCountLine,
  InventorySession,
  InventorySessionStatus,
} from '../db/types'
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
import { useToast } from '../ui/Toast'
import { IconCheckCircle } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

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
          ? db.inventoryCountLines.where('sessionId').equals(activeSessionId).toArray()
          : Promise.resolve([] as InventoryCountLine[]),
      [activeSessionId],
      [],
    ) ?? []

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null
  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.createdAt - a.createdAt),
    [sessions],
  )

  const counted = lines.filter((l) => l.countedQty != null).length
  const varianceSum = lines.reduce(
    (m, l) => m + Math.abs(l.variance ?? 0),
    0,
  )

  const startSession = async () => {
    if (!canManage) return
    const products = (await db.products.toArray()).filter(productIsActive)
    const stocks = await db.storeStocks.where('storeId').equals(activeStoreId).toArray()
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
    const countLines: InventoryCountLine[] = products.map((p) => ({
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
    toast.success('Comptage démarré', `${countLines.length} articles`)
  }

  const setCounted = async (line: InventoryCountLine, raw: string) => {
    if (!canManage || activeSession?.status !== 'counting') return
    const countedQty = raw.trim() === '' ? null : Number(raw)
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
    if (!canManage || !activeSession || activeSession.status !== 'counting') return
    const currentLines = await db.inventoryCountLines
      .where('sessionId')
      .equals(activeSession.id)
      .toArray()
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
    toast.success(
      'Comptage clôturé',
      applyStock ? 'Stocks mis à jour' : 'Sans ajustement stock',
    )
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconCheckCircle />}
        title="Comptage physique"
        subtitle="Sessions d’inventaire : théorique vs physique"
        actions={
          canManage ? (
            <Button variant="accent" onClick={() => void startSession()}>
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
              description="Ou démarrez un nouveau comptage."
            />
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <Kpi label="Lignes" value={String(lines.length)} />
                <Kpi label="Comptées" value={String(counted)} tone="accent" />
                <Kpi label="Écarts abs." value={String(varianceSum)} tone="amber" />
              </div>
              {canManage && activeSession.status === 'counting' ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="accent" onClick={() => void closeSession(true)}>
                    Clôturer et ajuster le stock
                  </Button>
                  <Button variant="secondary" onClick={() => void closeSession(false)}>
                    Clôturer sans ajuster
                  </Button>
                </div>
              ) : null}
              <ul className="max-h-[55vh] space-y-1 overflow-auto">
                {lines.map((line) => (
                  <li
                    key={line.id}
                    className="grid grid-cols-[1fr_80px_100px_80px] items-center gap-2 rounded-lg border border-border/60 bg-white px-2 py-1.5 text-[12px]"
                  >
                    <span className="truncate font-medium">{line.productName}</span>
                    <span className="font-mono-nums text-ink-muted">
                      th. {line.expectedQty}
                    </span>
                    <Field label="">
                      <Input
                        inputMode="decimal"
                        disabled={!canManage || activeSession.status !== 'counting'}
                        defaultValue={
                          line.countedQty == null ? '' : String(line.countedQty)
                        }
                        onBlur={(e) => void setCounted(line, e.target.value)}
                        className="h-8 font-mono-nums"
                      />
                    </Field>
                    <span
                      className={
                        line.variance == null
                          ? 'text-ink-muted'
                          : line.variance === 0
                            ? 'text-emerald-700'
                            : 'text-rose-700'
                      }
                    >
                      {line.variance == null
                        ? '—'
                        : line.variance > 0
                          ? `+${line.variance}`
                          : String(line.variance)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
