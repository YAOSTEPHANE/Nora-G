import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { db, ensureAllStoreStockRows } from '../db/db'
import {
  CENTRAL_WAREHOUSE_ID,
  isWarehouseStore,
  storeKindLabel,
} from '../db/seedStores'
import type { StockTransfer, Store } from '../db/types'
import type { AuditActor } from '../lib/auditLog'
import { appendAuditEvent } from '../lib/auditLog'
import { formatFCFA } from '../lib/money'
import {
  buildConsolidatedRows,
  networkTotals,
  summarizeStoreStocks,
} from '../lib/networkStock'
import { storeStockRowId } from '../lib/storeStockId'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
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
import { useToast } from '../ui/Toast'
import {
  IconNetwork,
  IconPlus,
  IconStore,
  IconTruck,
  IconWarehouse,
} from '../ui/icons'
import { cn } from '../ui/cn'

type Tab = 'consolidated' | 'byStore' | 'transfers' | 'stores' | 'terminals'
type MatrixFilter = 'all' | 'rupture' | 'low'

type Props = {
  canConfigureStores: boolean
  canCreateTransfers: boolean
  profileId: string
  auditActor: AuditActor
  /** 0 = illimité (pas de plafond plan). */
  maxStores?: number
}

export function MultiStoreView({
  canConfigureStores,
  canCreateTransfers,
  profileId,
  auditActor,
  maxStores = 0,
}: Props) {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('consolidated')
  const stores =
    useLiveQuery(() => db.stores.orderBy('sortOrder').toArray(), [], []) ?? []
  const activeStores = useMemo(
    () => stores.filter((s) => !s.archived),
    [stores],
  )
  const warehouses = useMemo(
    () => activeStores.filter(isWarehouseStore),
    [activeStores],
  )
  const boutiques = useMemo(
    () => activeStores.filter((s) => !isWarehouseStore(s)),
    [activeStores],
  )
  const products = useLiveQuery(() => db.products.toArray(), [], []) ?? []
  const allStocks = useLiveQuery(() => db.storeStocks.toArray(), [], []) ?? []
  const transfers =
    useLiveQuery(
      () => db.stockTransfers.orderBy('createdAt').reverse().toArray(),
      [],
      [],
    ) ?? []
  const terminals =
    useLiveQuery(
      () => db.terminalNodes.orderBy('lastSeenAt').reverse().toArray(),
      [],
      [],
    ) ?? []

  const storeById = useMemo(
    () => new Map(stores.map((s) => [s.id, s])),
    [stores],
  )

  const summaries = useMemo(
    () =>
      summarizeStoreStocks({
        stores: activeStores,
        products,
        stocks: allStocks,
      }),
    [activeStores, products, allStocks],
  )

  const totals = useMemo(() => networkTotals(summaries), [summaries])

  const consolidatedRows = useMemo(
    () =>
      buildConsolidatedRows({
        stores: activeStores,
        products,
        stocks: allStocks,
      }),
    [activeStores, products, allStocks],
  )

  const [matrixFilter, setMatrixFilter] = useState<MatrixFilter>('all')
  const [matrixQuery, setMatrixQuery] = useState('')

  const filteredRows = useMemo(() => {
    const q = matrixQuery.trim().toLowerCase()
    return consolidatedRows.filter((row) => {
      if (matrixFilter === 'rupture' && !row.hasRuptureSomewhere) return false
      if (matrixFilter === 'low' && !row.hasLowSomewhere) return false
      if (!q) return true
      return (
        row.product.name.toLowerCase().includes(q) ||
        row.product.barcode.toLowerCase().includes(q)
      )
    })
  }, [consolidatedRows, matrixFilter, matrixQuery])

  const warehouseDefault = warehouses[0]?.id ?? CENTRAL_WAREHOUSE_ID
  const boutiqueDefault = boutiques[0]?.id ?? ''

  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [tBarcode, setTBarcode] = useState('')
  const [tProductId, setTProductId] = useState('')
  const [tQty, setTQty] = useState('')
  const [tNote, setTNote] = useState('')
  const [tRef, setTRef] = useState('')
  const [tBusy, setTBusy] = useState(false)
  const [historyStoreFilter, setHistoryStoreFilter] = useState('')

  const [newStoreName, setNewStoreName] = useState('')
  const [newStoreCode, setNewStoreCode] = useState('')
  const [newStoreKind, setNewStoreKind] = useState<'store' | 'warehouse'>(
    'store',
  )
  const [storeBusy, setStoreBusy] = useState(false)

  useEffect(() => {
    if (tab === 'stores' && !canConfigureStores) {
      setTab('consolidated')
    }
  }, [tab, canConfigureStores])

  useEffect(() => {
    if (!fromId && warehouseDefault) setFromId(warehouseDefault)
    if (!toId && boutiqueDefault) setToId(boutiqueDefault)
  }, [fromId, toId, warehouseDefault, boutiqueDefault])

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [products],
  )

  const stockAt = useCallback(
    (storeId: string, productId: string) => {
      const row = allStocks.find(
        (s) => s.storeId === storeId && s.productId === productId,
      )
      return row?.stock ?? 0
    },
    [allStocks],
  )

  const selectedTransferProduct = useMemo(() => {
    if (tProductId) return products.find((p) => p.id === tProductId)
    const code = tBarcode.trim()
    if (!code) return undefined
    return products.find((p) => p.barcode === code)
  }, [tProductId, tBarcode, products])

  const availableFrom = selectedTransferProduct
    ? stockAt(fromId, selectedTransferProduct.id)
    : null

  const doTransfer = useCallback(async () => {
    if (!fromId || !toId || fromId === toId) {
      toast.error('Sites invalides', 'Choisissez deux sites distincts.')
      return
    }
    const qty = Number.parseInt(tQty.replace(/\s/g, ''), 10)
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Quantité invalide')
      return
    }

    let prod = selectedTransferProduct
    if (!prod) {
      const code = tBarcode.trim()
      if (!code) {
        toast.error('Article requis', 'Sélectionnez un produit ou un code-barres.')
        return
      }
      prod = await db.products.where('barcode').equals(code).first()
    }
    if (!prod) {
      toast.error('Article introuvable')
      return
    }

    const transferId = crypto.randomUUID()
    const noteTrim = tNote.trim() || undefined
    const refTrim = tRef.trim() || undefined
    setTBusy(true)
    try {
      await db.transaction('rw', db.storeStocks, db.stockTransfers, async () => {
        const fromRowId = storeStockRowId(fromId, prod.id)
        const toRowId = storeStockRowId(toId, prod.id)
        const fromRow = await db.storeStocks.get(fromRowId)
        const toRow = await db.storeStocks.get(toRowId)
        const fromStock = fromRow?.stock ?? 0
        if (fromStock < qty) {
          throw new Error(
            `Stock insuffisant à l’expéditeur (${fromStock} disponible(s)).`,
          )
        }
        await db.storeStocks.put({
          id: fromRowId,
          storeId: fromId,
          productId: prod.id,
          stock: fromStock - qty,
        })
        await db.storeStocks.put({
          id: toRowId,
          storeId: toId,
          productId: prod.id,
          stock: (toRow?.stock ?? 0) + qty,
        })
        const tr: StockTransfer = {
          id: transferId,
          createdAt: Date.now(),
          fromStoreId: fromId,
          toStoreId: toId,
          productId: prod.id,
          productName: prod.name,
          qty,
          note: noteTrim,
          reference: refTrim,
          status: 'completed',
          createdByProfileId: profileId,
        }
        await db.stockTransfers.add(tr)
      })
      const fromName = storeById.get(fromId)?.name ?? fromId
      const toName = storeById.get(toId)?.name ?? toId
      void appendAuditEvent({
        kind: 'stock_transfer',
        actor: auditActor,
        reason: `Transfert ${qty} × ${prod.name} : ${fromName} → ${toName}`,
        payload: {
          transferId,
          fromStoreId: fromId,
          fromStoreName: fromName,
          toStoreId: toId,
          toStoreName: toName,
          productId: prod.id,
          productName: prod.name,
          barcode: prod.barcode,
          qty,
          note: noteTrim,
          reference: refTrim,
          createdByProfileId: profileId,
        },
      })
      toast.success(
        'Transfert enregistré',
        `${qty} × ${prod.name} → ${toName}`,
      )
      setTBarcode('')
      setTProductId('')
      setTQty('')
      setTNote('')
      setTRef('')
    } catch (e) {
      toast.error(
        'Transfert échoué',
        e instanceof Error ? e.message : String(e),
      )
    } finally {
      setTBusy(false)
    }
  }, [
    fromId,
    toId,
    tBarcode,
    tQty,
    tNote,
    tRef,
    selectedTransferProduct,
    profileId,
    storeById,
    auditActor,
    toast,
  ])

  const quickReassort = useCallback(
    (toStoreId: string) => {
      setFromId(warehouseDefault)
      setToId(toStoreId)
      setTab('transfers')
      toast.info(
        'Réassort',
        'Entrepôt → boutique prérempli. Choisissez l’article et la quantité.',
      )
    },
    [warehouseDefault, toast],
  )

  const addStore = useCallback(async () => {
    const name = newStoreName.trim()
    const sc = newStoreCode.trim().toUpperCase().slice(0, 6)
    if (!name || !sc) {
      toast.error('Nom et code requis')
      return
    }
    const boutiqueCount = boutiques.length
    if (
      newStoreKind === 'store' &&
      maxStores > 0 &&
      boutiqueCount >= maxStores
    ) {
      toast.error(
        'Limite de boutiques atteinte',
        `Votre plan autorise ${maxStores} boutique(s).`,
      )
      return
    }
    setStoreBusy(true)
    try {
      const maxSort = stores.reduce((m, s) => Math.max(m, s.sortOrder), -1) + 1
      const s: Store = {
        id: crypto.randomUUID(),
        name,
        shortCode: sc,
        sortOrder: maxSort,
        archived: false,
        kind: newStoreKind,
      }
      await db.stores.add(s)
      await ensureAllStoreStockRows()
      setNewStoreName('')
      setNewStoreCode('')
      setNewStoreKind('store')
      toast.success(
        newStoreKind === 'warehouse' ? 'Entrepôt ajouté' : 'Boutique ajoutée',
        name,
      )
    } finally {
      setStoreBusy(false)
    }
  }, [
    newStoreName,
    newStoreCode,
    newStoreKind,
    stores,
    boutiques.length,
    toast,
    maxStores,
  ])

  const archiveStore = useCallback(
    async (store: Store, archived: boolean) => {
      if (archived && boutiques.filter((b) => b.id !== store.id).length < 1 && !isWarehouseStore(store)) {
        toast.error(
          'Dernière boutique',
          'Il doit rester au moins une boutique active.',
        )
        return
      }
      await db.stores.update(store.id, { archived })
      toast.success(
        archived ? 'Site archivé' : 'Site réactivé',
        store.name,
      )
    },
    [boutiques, toast],
  )

  const filteredTransfers = useMemo(() => {
    if (!historyStoreFilter) return transfers
    return transfers.filter(
      (tr) =>
        tr.fromStoreId === historyStoreFilter ||
        tr.toStoreId === historyStoreFilter,
    )
  }, [transfers, historyStoreFilter])

  const tabs = useMemo(() => {
    const arr: Array<{ id: Tab; label: string }> = [
      { id: 'consolidated', label: 'Réseau consolidé' },
      { id: 'byStore', label: 'Stock par site' },
      { id: 'transfers', label: 'Transferts' },
      { id: 'terminals', label: 'Terminaux' },
    ]
    if (canConfigureStores) arr.push({ id: 'stores', label: 'Sites' })
    return arr
  }, [canConfigureStores])

  const orderedSites = useMemo(() => {
    return [...activeStores].sort((a, b) => {
      const aw = isWarehouseStore(a) ? 0 : 1
      const bw = isWarehouseStore(b) ? 0 : 1
      if (aw !== bw) return aw - bw
      return a.sortOrder - b.sortOrder
    })
  }, [activeStores])

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconNetwork />}
        eyebrow="Multi-boutiques"
        title="Réseau"
        subtitle="Stock par boutique, entrepôt central, transferts et vision consolidée"
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Boutiques"
          value={totals.boutiqueCount}
          hint={
            totals.warehouseCount > 0
              ? `${totals.warehouseCount} entrepôt(s)`
              : 'Aucun entrepôt'
          }
          tone="accent"
          icon={<IconStore className="h-4 w-4" />}
        />
        <Kpi
          label="Unités réseau"
          value={totals.units.toLocaleString('fr-FR')}
          hint="Tous sites confondus"
          tone="sky"
          icon={<IconWarehouse className="h-4 w-4" />}
        />
        <Kpi
          label="Valeur stock TTC"
          value={formatFCFA(totals.valueTTC)}
          hint="Catalogue actif"
          tone="violet"
        />
        <Kpi
          label="Alertes rupture"
          value={summaries
            .filter((s) => !isWarehouseStore(s.store))
            .reduce((n, s) => n + s.ruptureCount, 0)}
          hint="SKU en rupture côté boutiques"
          tone="rose"
        />
      </div>

      <Tabs items={tabs} active={tab} onChange={setTab} />

      {tab === 'consolidated' ? (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <Field label="Recherche" className="min-w-[200px] flex-1">
              <Input
                value={matrixQuery}
                onChange={(e) => setMatrixQuery(e.target.value)}
                placeholder="Nom ou code-barres…"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['all', 'Tous'],
                  ['rupture', 'Rupture boutique'],
                  ['low', 'Stock bas'],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  size="sm"
                  variant={matrixFilter === id ? 'accent' : 'ghost'}
                  onClick={() => setMatrixFilter(id)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <EmptyState title="Aucun article" />
          ) : (
            <div className="min-w-0">
              <TableScrollHint />
              <div className="hidden md:block">
                <Table
                  minWidth={Math.max(
                    640,
                    280 + orderedSites.length * 72 + 160,
                  )}
                >
                  <THead>
                    <Tr hover={false}>
                      <Th sticky>Article</Th>
                      {orderedSites.map((s) => (
                        <Th
                          key={s.id}
                          align="right"
                          className={
                            isWarehouseStore(s) ? 'text-sky-700' : undefined
                          }
                        >
                          {s.shortCode}
                          {isWarehouseStore(s) ? (
                            <span className="block text-[9px] font-normal uppercase tracking-wide">
                              Entrepôt
                            </span>
                          ) : null}
                        </Th>
                      ))}
                      <Th align="right">Boutiques</Th>
                      <Th align="right">Total</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {filteredRows.map((row) => (
                      <Tr key={row.product.id}>
                        <Td sticky className="font-medium text-zinc-900">
                          {row.product.name}
                          <span className="block font-mono-nums text-[10px] text-zinc-400">
                            {row.product.barcode}
                          </span>
                        </Td>
                        {orderedSites.map((s) => {
                          const q = row.byStore.get(s.id) ?? 0
                          const isWh = isWarehouseStore(s)
                          const low =
                            !isWh &&
                            q > 0 &&
                            q <= row.product.lowStockThreshold
                          const rupture = !isWh && q <= 0
                          return (
                            <Td
                              key={s.id}
                              align="right"
                              mono
                              className={cn(
                                rupture && 'font-semibold text-rose-600',
                                low && 'font-semibold text-amber-600',
                                isWh && 'text-sky-800',
                              )}
                            >
                              {q}
                            </Td>
                          )
                        })}
                        <Td align="right" mono className="text-zinc-700">
                          {row.boutiqueQty}
                        </Td>
                        <Td
                          align="right"
                          mono
                          className="font-bold text-zinc-900"
                        >
                          {row.total}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>
              <ul className="grid gap-2 md:hidden">
                {filteredRows.map((row) => (
                  <MobileDataCard
                    key={row.product.id}
                    title={row.product.name}
                    meta={
                      <span className="font-mono-nums">
                        {row.product.barcode}
                      </span>
                    }
                    body={
                      <div className="space-y-1">
                        {orderedSites.map((s) => {
                          const q = row.byStore.get(s.id) ?? 0
                          return (
                            <div
                              key={s.id}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="truncate">
                                {s.name}{' '}
                                <span className="text-ink-subtle">
                                  ({s.shortCode})
                                </span>
                              </span>
                              <span className="font-mono-nums font-medium text-ink">
                                {q}
                              </span>
                            </div>
                          )
                        })}
                        <div className="flex items-center justify-between border-t border-border/60 pt-1.5 text-ink">
                          <span>Boutiques / Total</span>
                          <span className="font-mono-nums font-semibold">
                            {row.boutiqueQty} / {row.total}
                          </span>
                        </div>
                      </div>
                    }
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}

      {tab === 'byStore' ? (
        <div className="space-y-5">
          <SectionHeader
            title="Stock par site"
            subtitle="Unités, valeur et alertes pour chaque boutique et l’entrepôt"
          />
          {summaries.length === 0 ? (
            <EmptyState title="Aucun site" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {summaries.map((sum) => {
                const wh = isWarehouseStore(sum.store)
                return (
                  <Card key={sum.storeId}>
                    <CardContent className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={cn(
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                              wh
                                ? 'bg-sky-50 text-sky-700'
                                : 'bg-zinc-100 text-zinc-600',
                            )}
                          >
                            {wh ? (
                              <IconWarehouse className="h-5 w-5" />
                            ) : (
                              <IconStore className="h-5 w-5" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-semibold text-zinc-900">
                              {sum.store.name}
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              {sum.store.shortCode} · {storeKindLabel(sum.store)}
                            </p>
                          </div>
                        </div>
                        <Badge tone={wh ? 'info' : 'success'}>
                          {wh ? 'Entrepôt' : 'Boutique'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[12px]">
                        <div className="rounded-lg bg-zinc-50 px-2.5 py-2">
                          <p className="text-zinc-500">Unités</p>
                          <p className="font-mono-nums text-[15px] font-semibold text-zinc-900">
                            {sum.units.toLocaleString('fr-FR')}
                          </p>
                        </div>
                        <div className="rounded-lg bg-zinc-50 px-2.5 py-2">
                          <p className="text-zinc-500">Valeur TTC</p>
                          <p className="font-mono-nums text-[13px] font-semibold text-zinc-900">
                            {formatFCFA(sum.valueTTC)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-zinc-50 px-2.5 py-2">
                          <p className="text-zinc-500">SKU en stock</p>
                          <p className="font-mono-nums text-[15px] font-semibold text-zinc-900">
                            {sum.skuCount}
                          </p>
                        </div>
                        <div className="rounded-lg bg-zinc-50 px-2.5 py-2">
                          <p className="text-zinc-500">Ruptures / bas</p>
                          <p className="font-mono-nums text-[15px] font-semibold text-zinc-900">
                            <span className="text-rose-600">
                              {sum.ruptureCount}
                            </span>
                            {' / '}
                            <span className="text-amber-600">{sum.lowCount}</span>
                          </p>
                        </div>
                      </div>
                      {!wh && warehouses.length > 0 && canCreateTransfers ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          iconLeft={<IconTruck />}
                          fullWidth
                          onClick={() => quickReassort(sum.storeId)}
                        >
                          Réassort depuis entrepôt
                        </Button>
                      ) : null}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'transfers' ? (
        <div className="space-y-5">
          {canCreateTransfers ? (
            <Card>
              <CardContent>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <IconTruck className="h-4 w-4 text-zinc-500" />
                    <h2 className="text-[14px] font-semibold text-zinc-900">
                      Nouveau transfert inter-sites
                    </h2>
                  </div>
                  {warehouses.length > 0 && boutiques.length > 0 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setFromId(warehouseDefault)
                        setToId(boutiqueDefault)
                      }}
                    >
                      Préremplir entrepôt → boutique
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Expéditeur" required>
                    <Select
                      value={fromId}
                      onChange={(e) => setFromId(e.target.value)}
                    >
                      <option value="">—</option>
                      {activeStores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {`${isWarehouseStore(s) ? '[E] ' : ''}${s.name} (${s.shortCode})`}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Destinataire" required>
                    <Select
                      value={toId}
                      onChange={(e) => setToId(e.target.value)}
                    >
                      <option value="">—</option>
                      {activeStores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.shortCode})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Article (liste)" className="sm:col-span-2">
                    <Select
                      value={tProductId}
                      onChange={(e) => {
                        const id = e.target.value
                        setTProductId(id)
                        const p = products.find((x) => x.id === id)
                        if (p) setTBarcode(p.barcode)
                      }}
                    >
                      <option value="">— ou code-barres ci-dessous —</option>
                      {sortedProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Code-barres" required={!tProductId}>
                    <Input
                      value={tBarcode}
                      onChange={(e) => {
                        setTBarcode(e.target.value)
                        setTProductId('')
                      }}
                      className="font-mono-nums"
                    />
                  </Field>
                  <Field label="Quantité" required>
                    <Input
                      inputMode="numeric"
                      value={tQty}
                      onChange={(e) => setTQty(e.target.value)}
                      className="font-mono-nums"
                    />
                  </Field>
                  {availableFrom !== null ? (
                    <p className="sm:col-span-2 text-[12px] text-zinc-600">
                      Disponible à l’expéditeur :{' '}
                      <span className="font-mono-nums font-semibold text-zinc-900">
                        {availableFrom}
                      </span>
                    </p>
                  ) : null}
                  <Field label="Référence (BL / demande)">
                    <Input
                      value={tRef}
                      onChange={(e) => setTRef(e.target.value)}
                      placeholder="ex. REASSORT-042"
                    />
                  </Field>
                  <Field label="Note">
                    <Input
                      value={tNote}
                      onChange={(e) => setTNote(e.target.value)}
                    />
                  </Field>
                </div>
                <div className="mt-4">
                  <Button
                    variant="accent"
                    loading={tBusy}
                    fullWidth
                    className="sm:w-auto"
                    onClick={() => void doTransfer()}
                  >
                    Valider le transfert
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent>
                <p className="text-[13px] text-zinc-600">
                  Consultation seule. Création réservée aux profils gérant ou
                  administrateur.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeader title="Historique des transferts" />
            <Field label="Filtrer par site" className="sm:w-56">
              <Select
                value={historyStoreFilter}
                onChange={(e) => setHistoryStoreFilter(e.target.value)}
              >
                <option value="">Tous les sites</option>
                {activeStores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {filteredTransfers.length === 0 ? (
            <EmptyState
              title="Aucun transfert"
              description="Les mouvements inter-boutiques et depuis l’entrepôt apparaîtront ici."
              variant="flat"
            />
          ) : (
            <Card>
              <CardContent className="p-0!">
                <ul className="divide-y divide-zinc-100">
                  {filteredTransfers.slice(0, 50).map((tr) => {
                    const name =
                      tr.productName ??
                      products.find((x) => x.id === tr.productId)?.name ??
                      tr.productId
                    const from =
                      storeById.get(tr.fromStoreId)?.name ?? tr.fromStoreId
                    const to =
                      storeById.get(tr.toStoreId)?.name ?? tr.toStoreId
                    const fromWh = isWarehouseStore(
                      storeById.get(tr.fromStoreId),
                    )
                    return (
                      <li
                        key={tr.id}
                        className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-[13px] sm:flex-nowrap sm:items-center"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-zinc-900">
                            {tr.qty} × {name}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            {fromWh ? 'Entrepôt · ' : ''}
                            {from} → {to}
                            {tr.reference ? ` · Réf. ${tr.reference}` : ''}
                            {tr.note ? ` · ${tr.note}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge tone="success">
                            {tr.status === 'cancelled' ? 'Annulé' : 'Effectué'}
                          </Badge>
                          <span className="whitespace-nowrap font-mono-nums text-[11px] text-zinc-500">
                            {new Date(tr.createdAt).toLocaleString('fr-FR')}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      {tab === 'stores' && canConfigureStores ? (
        <div className="space-y-5">
          <SectionHeader
            title="Sites du réseau"
            subtitle="Boutiques de vente et entrepôts centraux"
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stores.map((s) => {
              const wh = isWarehouseStore(s)
              return (
                <Card
                  key={s.id}
                  className={s.archived ? 'opacity-70' : undefined}
                >
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 sm:flex-nowrap">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                          wh
                            ? 'bg-sky-50 text-sky-700'
                            : 'bg-zinc-100 text-zinc-500',
                        )}
                      >
                        {wh ? (
                          <IconWarehouse className="h-4 w-4" />
                        ) : (
                          <IconStore className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-zinc-900">
                          {s.name}
                        </p>
                        <p className="font-mono-nums text-[11px] text-zinc-500">
                          {s.shortCode} · {storeKindLabel(s)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        tone={
                          s.archived ? 'neutral' : wh ? 'info' : 'success'
                        }
                      >
                        {s.archived
                          ? 'Archivé'
                          : wh
                            ? 'Entrepôt'
                            : 'Actif'}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void archiveStore(s, !s.archived)}
                      >
                        {s.archived ? 'Réactiver' : 'Archiver'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Card>
            <CardContent>
              <div className="mb-3 flex items-center gap-2">
                <IconPlus className="h-4 w-4 text-zinc-500" />
                <h2 className="text-[14px] font-semibold text-zinc-900">
                  Ajouter un site
                </h2>
              </div>
              <p className="mb-3 text-[12px] text-zinc-500">
                Stocks initialisés à 0 pour tous les articles.
                {maxStores > 0
                  ? ` Quota plan : ${boutiques.length}/${maxStores} boutique(s).`
                  : ''}
              </p>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
                <Field label="Nom" required>
                  <Input
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                  />
                </Field>
                <Field label="Code" required className="sm:w-28">
                  <Input
                    value={newStoreCode}
                    onChange={(e) => setNewStoreCode(e.target.value)}
                    maxLength={6}
                    className="uppercase"
                  />
                </Field>
                <Field label="Type" className="sm:w-36">
                  <Select
                    value={newStoreKind}
                    onChange={(e) =>
                      setNewStoreKind(
                        e.target.value === 'warehouse' ? 'warehouse' : 'store',
                      )
                    }
                  >
                    <option value="store">Boutique</option>
                    <option value="warehouse">Entrepôt</option>
                  </Select>
                </Field>
                <Button
                  variant="accent"
                  iconLeft={<IconPlus />}
                  loading={storeBusy}
                  onClick={() => void addStore()}
                  className="w-full sm:w-auto"
                >
                  Ajouter
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === 'terminals' ? (
        <div className="space-y-5">
          <SectionHeader
            title="Terminaux synchronisés"
            subtitle="Présence, file de sync et santé des caisses actives"
          />
          {terminals.length === 0 ? (
            <EmptyState
              title="Aucun terminal détecté"
              description="Les terminaux apparaissent automatiquement dès qu’une session est active."
              variant="flat"
            />
          ) : (
            <ResponsiveData
              table={
                <Table minWidth={860}>
                  <THead>
                    <Tr hover={false}>
                      <Th sticky>Terminal</Th>
                      <Th hideBelow="lg">Magasin</Th>
                      <Th hideBelow="xl">Utilisateur</Th>
                      <Th>Statut</Th>
                      <Th align="right" hideBelow="lg">
                        File sync
                      </Th>
                      <Th hideBelow="xl">Dernière synchro</Th>
                      <Th hideBelow="lg">Dernière activité</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {terminals.map((t) => (
                      <Tr key={t.id}>
                        <Td sticky>
                          <span className="font-medium text-zinc-900">
                            {t.label}
                          </span>
                          <span className="block font-mono-nums text-[11px] text-zinc-500">
                            {t.id}
                          </span>
                        </Td>
                        <Td hideBelow="lg">
                          {t.storeName ?? t.storeId ?? '—'}
                        </Td>
                        <Td hideBelow="xl">
                          {t.profileDisplayName ?? '—'}
                        </Td>
                        <Td>
                          <Badge tone={t.online ? 'success' : 'warning'}>
                            {t.online ? 'En ligne' : 'Inactif'}
                          </Badge>
                        </Td>
                        <Td align="right" mono hideBelow="lg">
                          {t.pendingSyncCount}
                        </Td>
                        <Td
                          className="text-[12px] text-zinc-600"
                          hideBelow="xl"
                        >
                          {t.lastSyncAt
                            ? new Date(t.lastSyncAt).toLocaleString('fr-FR')
                            : 'Jamais'}
                        </Td>
                        <Td
                          className="text-[12px] text-zinc-600"
                          hideBelow="lg"
                        >
                          {new Date(t.lastSeenAt).toLocaleString('fr-FR')}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              }
              cards={
                <ul className="grid gap-2">
                  {terminals.map((t) => (
                    <MobileDataCard
                      key={t.id}
                      title={t.label}
                      meta={
                        <span className="font-mono-nums text-[10px]">
                          {t.id}
                        </span>
                      }
                      body={
                        <div className="space-y-1">
                          <p>Magasin : {t.storeName ?? t.storeId ?? '—'}</p>
                          <p>Utilisateur : {t.profileDisplayName ?? '—'}</p>
                          <p>
                            Statut :{' '}
                            <Badge tone={t.online ? 'success' : 'warning'}>
                              {t.online ? 'En ligne' : 'Inactif'}
                            </Badge>
                          </p>
                          <p className="font-mono-nums">
                            File sync : {t.pendingSyncCount}
                          </p>
                        </div>
                      }
                    />
                  ))}
                </ul>
              }
            />
          )}
        </div>
      ) : null}
    </div>
  )
}
