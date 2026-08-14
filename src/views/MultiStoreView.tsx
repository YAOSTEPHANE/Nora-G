import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { db, ensureAllStoreStockRows } from '../db/db'
import type { StockTransfer, Store } from '../db/types'
import type { AuditActor } from '../lib/auditLog'
import { appendAuditEvent } from '../lib/auditLog'
import { storeStockRowId } from '../lib/storeStockId'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { PageHeader, SectionHeader } from '../ui/PageHeader'
import { Tabs } from '../ui/Tabs'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import {
  MobileDataCard,
  ResponsiveData,
  TableScrollHint,
} from '../ui/ResponsiveData'
import { useToast } from '../ui/Toast'
import { IconNetwork, IconPlus, IconStore, IconTruck } from '../ui/icons'

type Tab = 'consolidated' | 'transfers' | 'stores' | 'terminals'

type Props = {
  canConfigureStores: boolean
  canCreateTransfers: boolean
  profileId: string
  auditActor: AuditActor
}

export function MultiStoreView({
  canConfigureStores,
  canCreateTransfers,
  profileId,
  auditActor,
}: Props) {
  const toast = useToast()
  const maxStores = 0
  const [tab, setTab] = useState<Tab>('consolidated')
  const stores =
    useLiveQuery(() => db.stores.orderBy('sortOrder').toArray(), [], []) ?? []
  const activeStores = useMemo(
    () => stores.filter((s) => !s.archived),
    [stores],
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

  const stockMatrix = useMemo(() => {
    const m = new Map<string, Map<string, number>>()
    for (const s of allStocks) {
      if (!m.has(s.productId)) m.set(s.productId, new Map())
      m.get(s.productId)!.set(s.storeId, s.stock)
    }
    return m
  }, [allStocks])

  const storeById = useMemo(
    () => new Map(stores.map((s) => [s.id, s])),
    [stores],
  )

  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [tBarcode, setTBarcode] = useState('')
  const [tQty, setTQty] = useState('')
  const [tNote, setTNote] = useState('')
  const [tBusy, setTBusy] = useState(false)

  const [newStoreName, setNewStoreName] = useState('')
  const [newStoreCode, setNewStoreCode] = useState('')
  const [storeBusy, setStoreBusy] = useState(false)

  useEffect(() => {
    if (tab === 'stores' && !canConfigureStores) {
      setTab('consolidated')
    }
  }, [tab, canConfigureStores])

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [products],
  )

  const doTransfer = useCallback(async () => {
    if (!fromId || !toId || fromId === toId) {
      toast.error('Magasins invalides', 'Choisissez deux magasins distincts.')
      return
    }
    const code = tBarcode.trim()
    const qty = Number.parseInt(tQty.replace(/\s/g, ''), 10)
    if (!code) {
      toast.error('Code-barres requis')
      return
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Quantité invalide')
      return
    }
    const prod = await db.products.where('barcode').equals(code).first()
    if (!prod) {
      toast.error('Article introuvable')
      return
    }
    const transferId = crypto.randomUUID()
    const noteTrim = tNote.trim() || undefined
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
          qty,
          note: noteTrim,
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
          createdByProfileId: profileId,
        },
      })
      toast.success(
        'Transfert enregistré',
        `${qty} × ${prod.name} → ${toName}`,
      )
      setTBarcode('')
      setTQty('')
      setTNote('')
    } catch (e) {
      toast.error(
        'Transfert échoué',
        e instanceof Error ? e.message : String(e),
      )
    } finally {
      setTBusy(false)
    }
  }, [fromId, toId, tBarcode, tQty, tNote, profileId, storeById, auditActor, toast])

  const addStore = useCallback(async () => {
    const name = newStoreName.trim()
    const sc = newStoreCode.trim().toUpperCase().slice(0, 6)
    if (!name || !sc) {
      toast.error('Nom et code requis')
      return
    }
    if (maxStores > 0 && activeStores.length >= maxStores) {
      toast.error(
        'Limite de magasins atteinte',
        `Votre plan autorise ${maxStores} magasin(s). Passez à un plan supérieur.`,
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
      }
      await db.stores.add(s)
      await ensureAllStoreStockRows()
      setNewStoreName('')
      setNewStoreCode('')
      toast.success('Magasin ajouté', name)
    } finally {
      setStoreBusy(false)
    }
  }, [newStoreName, newStoreCode, stores, activeStores.length, toast, maxStores])

  const archiveStore = useCallback(
    async (store: Store, archived: boolean) => {
      if (archived && activeStores.length <= 1) {
        toast.error(
          'Dernier magasin',
          'Archivez seulement s’il reste au moins un magasin actif.',
        )
        return
      }
      await db.stores.update(store.id, { archived })
      toast.success(
        archived ? 'Magasin archivé' : 'Magasin réactivé',
        store.name,
      )
    },
    [activeStores.length, toast],
  )

  const tabs = useMemo(() => {
    const arr: Array<{ id: Tab; label: string }> = [
      { id: 'consolidated', label: 'Vue consolidée' },
      { id: 'transfers', label: 'Transferts' },
      { id: 'terminals', label: 'Terminaux sync' },
    ]
    if (canConfigureStores) arr.push({ id: 'stores', label: 'Magasins' })
    return arr
  }, [canConfigureStores])

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconNetwork />}
        eyebrow="Réseau"
        title="Magasins"
        subtitle="Stocks par site, transferts internes et configuration"
      />

      <Tabs items={tabs} active={tab} onChange={setTab} />

      {tab === 'consolidated' ? (
        sortedProducts.length === 0 ? (
          <EmptyState title="Aucun produit" />
        ) : (
          <div className="min-w-0">
            <TableScrollHint />
            <div className="hidden md:block">
              <Table minWidth={Math.max(560, 220 + activeStores.length * 80 + 80)}>
                <THead>
                  <Tr hover={false}>
                    <Th sticky>Article</Th>
                    {activeStores.map((s) => (
                      <Th key={s.id} align="right">
                        {s.shortCode}
                      </Th>
                    ))}
                    <Th align="right">Total</Th>
                  </Tr>
                </THead>
                <TBody>
                  {sortedProducts.map((p) => {
                    const row = stockMatrix.get(p.id)
                    let total = 0
                    return (
                      <Tr key={p.id}>
                        <Td sticky className="font-medium text-zinc-900">
                          {p.name}
                          <span className="block font-mono-nums text-[10px] text-zinc-400">
                            {p.barcode}
                          </span>
                        </Td>
                        {activeStores.map((s) => {
                          const q = row?.get(s.id) ?? 0
                          total += q
                          return (
                            <Td
                              key={s.id}
                              align="right"
                              mono
                              className="text-zinc-700"
                            >
                              {q}
                            </Td>
                          )
                        })}
                        <Td align="right" mono className="font-bold text-zinc-900">
                          {total}
                        </Td>
                      </Tr>
                    )
                  })}
                </TBody>
              </Table>
            </div>
            <ul className="grid gap-2 md:hidden">
              {sortedProducts.map((p) => {
                const row = stockMatrix.get(p.id)
                let total = 0
                const perStore = activeStores.map((s) => {
                  const q = row?.get(s.id) ?? 0
                  total += q
                  return { code: s.shortCode, name: s.name, q }
                })
                return (
                  <MobileDataCard
                    key={p.id}
                    title={p.name}
                    meta={
                      <span className="font-mono-nums">{p.barcode}</span>
                    }
                    body={
                      <div className="space-y-1">
                        {perStore.map((s) => (
                          <div
                            key={s.code}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="truncate">
                              {s.name}{' '}
                              <span className="text-ink-subtle">({s.code})</span>
                            </span>
                            <span className="font-mono-nums font-medium text-ink">
                              {s.q}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between border-t border-border/60 pt-1.5 font-semibold text-ink">
                          <span>Total</span>
                          <span className="font-mono-nums">{total}</span>
                        </div>
                      </div>
                    }
                  />
                )
              })}
            </ul>
          </div>
        )
      ) : null}

      {tab === 'transfers' ? (
        <div className="space-y-5">
          {canCreateTransfers ? (
            <Card>
              <CardContent>
                <div className="mb-3 flex items-center gap-2">
                  <IconTruck className="h-4 w-4 text-zinc-500" />
                  <h2 className="text-[14px] font-semibold text-zinc-900">
                    Nouveau transfert
                  </h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Magasin expéditeur" required>
                    <Select
                      value={fromId}
                      onChange={(e) => setFromId(e.target.value)}
                    >
                      <option value="">—</option>
                      {activeStores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Magasin destinataire" required>
                    <Select
                      value={toId}
                      onChange={(e) => setToId(e.target.value)}
                    >
                      <option value="">—</option>
                      {activeStores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Code-barres" required>
                    <Input
                      value={tBarcode}
                      onChange={(e) => setTBarcode(e.target.value)}
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
                  <Field label="Note (optionnel)" className="sm:col-span-2">
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
                  Vous pouvez consulter l’historique. Création réservée aux
                  profils gérant ou administrateur.
                </p>
              </CardContent>
            </Card>
          )}

          <SectionHeader title="Historique récent" />
          {transfers.length === 0 ? (
            <EmptyState
              title="Aucun transfert"
              description="Les mouvements apparaîtront ici."
              variant="flat"
            />
          ) : (
            <Card>
              <CardContent className="p-0!">
                <ul className="divide-y divide-zinc-100">
                  {transfers.slice(0, 40).map((tr) => {
                    const p = products.find((x) => x.id === tr.productId)
                    const from = storeById.get(tr.fromStoreId)?.name ?? tr.fromStoreId
                    const to = storeById.get(tr.toStoreId)?.name ?? tr.toStoreId
                    return (
                      <li
                        key={tr.id}
                        className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-[13px] sm:flex-nowrap sm:items-center"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-zinc-900">
                            {tr.qty} × {p?.name ?? tr.productId}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            {from} → {to}
                            {tr.note ? ` · ${tr.note}` : ''}
                          </p>
                        </div>
                        <span className="shrink-0 whitespace-nowrap font-mono-nums text-[11px] text-zinc-500">
                          {new Date(tr.createdAt).toLocaleString('fr-FR')}
                        </span>
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
          <SectionHeader title="Points de vente" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stores.map((s) => (
              <Card key={s.id} className={s.archived ? 'opacity-70' : undefined}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 sm:flex-nowrap">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500">
                      <IconStore className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-zinc-900">
                        {s.name}
                      </p>
                      <p className="font-mono-nums text-[11px] text-zinc-500">
                        {s.shortCode}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={s.archived ? 'neutral' : 'success'}>
                      {s.archived ? 'Archivé' : 'Actif'}
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
            ))}
          </div>

          <Card>
            <CardContent>
              <div className="mb-3 flex items-center gap-2">
                <IconNetwork className="h-4 w-4 text-zinc-500" />
                <h2 className="text-[14px] font-semibold text-zinc-900">
                  Ajouter un magasin
                </h2>
              </div>
              <p className="mb-3 text-[12px] text-zinc-500">
                Stocks initialisés à 0 pour tous les articles.
                {maxStores > 0
                  ? ` Quota plan : ${activeStores.length}/${maxStores} magasin(s).`
                  : ''}
              </p>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <Field label="Nom" required>
                  <Input
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                    disabled={maxStores > 0 && activeStores.length >= maxStores}
                  />
                </Field>
                <Field label="Code" required className="sm:w-32">
                  <Input
                    value={newStoreCode}
                    onChange={(e) => setNewStoreCode(e.target.value)}
                    maxLength={6}
                    className="uppercase"
                    disabled={maxStores > 0 && activeStores.length >= maxStores}
                  />
                </Field>
                <Button
                  variant="accent"
                  iconLeft={<IconPlus />}
                  loading={storeBusy}
                  disabled={maxStores > 0 && activeStores.length >= maxStores}
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
                        <Td hideBelow="lg">{t.storeName ?? t.storeId ?? '—'}</Td>
                        <Td hideBelow="xl">{t.profileDisplayName ?? '—'}</Td>
                        <Td>
                          <Badge tone={t.online ? 'success' : 'warning'}>
                            {t.online ? 'En ligne' : 'Inactif'}
                          </Badge>
                        </Td>
                        <Td align="right" mono hideBelow="lg">
                          {t.pendingSyncCount}
                        </Td>
                        <Td className="text-[12px] text-zinc-600" hideBelow="xl">
                          {t.lastSyncAt
                            ? new Date(t.lastSyncAt).toLocaleString('fr-FR')
                            : 'Jamais'}
                        </Td>
                        <Td className="text-[12px] text-zinc-600" hideBelow="lg">
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
                        <span className="font-mono-nums text-[10px]">{t.id}</span>
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
                          <p className="text-[11px]">
                            Sync :{' '}
                            {t.lastSyncAt
                              ? new Date(t.lastSyncAt).toLocaleString('fr-FR')
                              : 'Jamais'}
                          </p>
                          <p className="text-[11px]">
                            Activité :{' '}
                            {new Date(t.lastSeenAt).toLocaleString('fr-FR')}
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
