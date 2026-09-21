import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import {
  addProductCategoryLabel,
  db,
  deleteProductCategoryIfUnused,
  renameProductCategoryLabel,
} from '../db/db'
import type { CategoryTab } from '../components/Sidebar'
import type { Product, ProductWithStock } from '../db/types'
import { EditProductModal } from '../components/EditProductModal'
import { AddProductModal } from '../components/AddProductModal'
import { formatFCFA } from '../lib/money'
import { ProductImage } from '../components/ProductImage'
import { ProductDetailModal } from '../components/ProductDetailModal'
import {
  applyProductsCsvImport,
  downloadCsvTemplate,
  exportProductsCsv,
  parseProductsCsv,
} from '../lib/csvProducts'
import {
  APP_SETTINGS_CHANGED_EVENT,
  getAppSettings,
} from '../lib/appSettings'
import type { BusinessDomain } from '../lib/businessDomain'
import {
  categoryTabsForDomain,
  productBelongsToDomain,
} from '../lib/domainCatalog'
import { productIsActive } from '../lib/productFilters'
import type { AuditActor } from '../lib/auditLog'
import { appendAuditEvent } from '../lib/auditLog'
import { deleteProductPermanently } from '../lib/deleteProduct'
import { enqueueProductSync, enqueueStockSync } from '../lib/sync'
import { assertBarcodeAvailable } from '../lib/productBarcode'
import { storeStockRowId } from '../lib/storeStockId'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { cn } from '../ui/cn'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { Switch } from '../ui/Switch'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import {
  IconArchive,
  IconCatalogue,
  IconDownload,
  IconEdit,
  IconEye,
  IconLayers,
  IconPlus,
  IconRefund,
  IconSearch,
  IconTable,
  IconTag,
  IconTrash,
  IconTrendingUp,
  IconUpload,
  IconWarning,
} from '../ui/icons'

type Props = {
  canManageCatalog: boolean
  canEditPrices: boolean
  density: 'compact' | 'confort'
  auditActor: AuditActor
  onSaveNewProduct: (product: Product, initialStock: number) => Promise<void>
}

type ViewTab = 'articles' | 'categories'
type StockFilter = 'tous' | 'rupture' | 'alerte' | 'ok'
type SortKey =
  | 'name'
  | 'price-asc'
  | 'price-desc'
  | 'stock-asc'
  | 'stock-desc'
type LayoutMode = 'table' | 'grid'

function stockState(p: ProductWithStock): 'rupture' | 'alerte' | 'ok' {
  if (p.stock <= 0) return 'rupture'
  if (p.stock <= p.lowStockThreshold) return 'alerte'
  return 'ok'
}

function sortProducts(list: ProductWithStock[], sortKey: SortKey): ProductWithStock[] {
  const copy = [...list]
  switch (sortKey) {
    case 'price-asc':
      return copy.sort((a, b) => a.priceTTC - b.priceTTC)
    case 'price-desc':
      return copy.sort((a, b) => b.priceTTC - a.priceTTC)
    case 'stock-asc':
      return copy.sort((a, b) => a.stock - b.stock)
    case 'stock-desc':
      return copy.sort((a, b) => b.stock - a.stock)
    default:
      return copy.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }
}

export function CatalogueView({
  canManageCatalog,
  canEditPrices,
  density,
  auditActor,
  onSaveNewProduct,
}: Props) {
  const { activeStoreId, activeStore } = useActiveStore()
  const toast = useToast()
  const [businessDomain, setBusinessDomain] = useState<BusinessDomain>(
    () => getAppSettings().businessDomain,
  )
  useEffect(() => {
    const sync = () => setBusinessDomain(getAppSettings().businessDomain)
    window.addEventListener(APP_SETTINGS_CHANGED_EVENT, sync)
    return () => window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, sync)
  }, [])
  const products = useLiveQuery(() => db.products.toArray(), [], []) ?? []
  const productCategoryRows =
    useLiveQuery(
      () => db.productCategories.orderBy('sortOrder').toArray(),
      [],
      [],
    ) ?? []
  const categoryTabs = useMemo<CategoryTab[]>(
    () =>
      categoryTabsForDomain(
        businessDomain,
        productCategoryRows.map((r) => r.name),
      ),
    [businessDomain, productCategoryRows],
  )
  const stockRows =
    useLiveQuery(
      () => db.storeStocks.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const rowsWithStock = useMemo((): ProductWithStock[] => {
    const m = new Map(stockRows.map((r) => [r.productId, r.stock]))
    return products
      .filter((p) => productBelongsToDomain(p, businessDomain))
      .map((p) => ({ ...p, stock: m.get(p.id) ?? 0 }))
  }, [products, stockRows, businessDomain])

  const [viewTab, setViewTab] = useState<ViewTab>('articles')
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('grid')
  const [stockFilter, setStockFilter] = useState<StockFilter>('tous')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<CategoryTab>('Tous')
  const [editing, setEditing] = useState<Product | null>(null)
  const [adding, setAdding] = useState(false)
  const [detailProduct, setDetailProduct] =
    useState<ProductWithStock | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryAddBusy, setCategoryAddBusy] = useState(false)
  const [pendingArchiveId, setPendingArchiveId] = useState<string | null>(null)
  const [pendingArchiveUntil, setPendingArchiveUntil] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const gridCols = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'

  useEffect(() => {
    if (categoryTabs.length === 0) return
    if (!categoryTabs.includes(cat)) setCat('Tous')
  }, [categoryTabs, cat])

  const activeProducts = useMemo(
    () => rowsWithStock.filter((p) => productIsActive(p)),
    [rowsWithStock],
  )

  const stats = useMemo(() => {
    const rupture = activeProducts.filter((p) => p.stock <= 0).length
    const alerte = activeProducts.filter(
      (p) => p.stock > 0 && p.stock <= p.lowStockThreshold,
    ).length
    const valuation = activeProducts.reduce(
      (sum, p) => sum + p.priceTTC * Math.max(0, p.stock),
      0,
    )
    return {
      total: products.length,
      active: activeProducts.length,
      archived: products.filter((p) => p.archived).length,
      rupture,
      alerte,
      valuation,
    }
  }, [products, activeProducts])

  const categoryStats = useMemo(() => {
    const seen = new Set<string>()
    const out: {
      id: string
      name: string
      total: number
      active: number
      rupture: number
      alerte: number
    }[] = []
    for (const row of productCategoryRows) {
      const key = row.name.trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      const items = rowsWithStock.filter(
        (p) =>
          p.category === row.name && (showArchived ? true : productIsActive(p)),
      )
      out.push({
        id: row.id,
        name: row.name,
        total: items.length,
        active: items.filter((p) => !p.archived).length,
        rupture: items.filter((p) => !p.archived && p.stock <= 0).length,
        alerte: items.filter(
          (p) =>
            !p.archived &&
            p.stock > 0 &&
            p.stock <= p.lowStockThreshold,
        ).length,
      })
    }
    return out
  }, [productCategoryRows, rowsWithStock, showArchived])

  const handleAddCategory = useCallback(async () => {
    setCategoryAddBusy(true)
    try {
      const name = await addProductCategoryLabel(newCategoryName)
      setNewCategoryName('')
      setCat(name)
      toast.success('Catégorie ajoutée', name)
    } catch (e) {
      toast.error(
        'Catégorie invalide',
        e instanceof Error ? e.message : String(e),
      )
    } finally {
      setCategoryAddBusy(false)
    }
  }, [newCategoryName, toast])

  const handleRenameCategory = useCallback(
    async (categoryId: string, currentName: string) => {
      const next = window.prompt('Nouveau nom de catégorie', currentName)
      if (next == null || next.trim() === currentName) return
      try {
        const name = await renameProductCategoryLabel(categoryId, next)
        toast.success('Catégorie renommée', name)
      } catch (e) {
        toast.error(
          'Renommage impossible',
          e instanceof Error ? e.message : String(e),
        )
      }
    },
    [toast],
  )

  const handleDeleteCategory = useCallback(
    async (categoryId: string, currentName: string) => {
      const ok = window.confirm(
        `Supprimer la catégorie « ${currentName} » ?\nElle ne doit plus contenir d’articles.`,
      )
      if (!ok) return
      try {
        await deleteProductCategoryIfUnused(categoryId)
        if (cat === currentName) setCat('Tous')
        toast.success('Catégorie supprimée', currentName)
      } catch (e) {
        toast.error(
          'Suppression impossible',
          e instanceof Error ? e.message : String(e),
        )
      }
    },
    [cat, toast],
  )

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    const base = rowsWithStock
      .filter((p) => (showArchived ? true : productIsActive(p)))
      .filter((p) => (cat === 'Tous' ? true : p.category === cat))
      .filter(
        (p) =>
          !t ||
          p.name.toLowerCase().includes(t) ||
          p.barcode.includes(t),
      )
      .filter((p) => {
        if (stockFilter === 'tous') return true
        const state = stockState(p)
        return state === stockFilter
      })
    return sortProducts(base, sortKey)
  }, [rowsWithStock, q, cat, showArchived, stockFilter, sortKey])

  const handleSaveEdit = async (p: Product, stockAtStore: number) => {
    await assertBarcodeAvailable(p.barcode, p.id)
    const prevRow = rowsWithStock.find((r) => r.id === p.id)
    const previousQty = prevRow?.stock ?? 0
    const previousThreshold = prevRow?.lowStockThreshold ?? p.lowStockThreshold
    await db.products.put(p)
    await db.storeStocks.put({
      id: storeStockRowId(activeStoreId, p.id),
      storeId: activeStoreId,
      productId: p.id,
      stock: stockAtStore,
    })
    const stockChanged = previousQty !== stockAtStore
    const thresholdChanged = previousThreshold !== p.lowStockThreshold
    const previousPrice = prevRow?.priceTTC ?? p.priceTTC
    const previousPurchase = prevRow?.purchasePriceTTC
    const priceChanged = previousPrice !== p.priceTTC
    const purchaseChanged =
      (previousPurchase ?? null) !== (p.purchasePriceTTC ?? null)
    if (stockChanged || thresholdChanged) {
      void appendAuditEvent({
        kind: 'stock_adjusted',
        actor: auditActor,
        reason: stockChanged
          ? `Catalogue : stock « ${p.name} » ${previousQty} → ${stockAtStore}`
          : `Catalogue : seuil d’alerte « ${p.name} » ${previousThreshold} → ${p.lowStockThreshold}`,
        payload: {
          source: 'catalogue_edit',
          storeId: activeStoreId,
          storeName: activeStore?.name,
          productId: p.id,
          productName: p.name,
          barcode: p.barcode,
          previousQty,
          newQty: stockAtStore,
          previousLowStockThreshold: previousThreshold,
          newLowStockThreshold: p.lowStockThreshold,
        },
      })
    }
    if (priceChanged || purchaseChanged) {
      void appendAuditEvent({
        kind: 'price_changed',
        actor: auditActor,
        reason: priceChanged
          ? `Prix TTC « ${p.name} » ${previousPrice} → ${p.priceTTC}`
          : `Prix de revient « ${p.name} » ${previousPurchase ?? '—'} → ${p.purchasePriceTTC ?? '—'}`,
        payload: {
          source: 'catalogue_edit',
          productId: p.id,
          productName: p.name,
          barcode: p.barcode,
          previousPriceTTC: previousPrice,
          newPriceTTC: p.priceTTC,
          previousPurchasePriceTTC: previousPurchase ?? null,
          newPurchasePriceTTC: p.purchasePriceTTC ?? null,
        },
      })
    }
    await enqueueProductSync({ action: 'upsert', productId: p.id, product: p })
    if (stockChanged || thresholdChanged) {
      await enqueueStockSync({
        productId: p.id,
        stock: stockAtStore,
        lowStockThreshold: p.lowStockThreshold,
        storeId: activeStoreId,
      })
    }
    toast.success('Article enregistré', p.name)
  }

  const handleArchive = async (p: ProductWithStock) => {
    const now = new Date().getTime()
    if (pendingArchiveId !== p.id || now > pendingArchiveUntil) {
      setPendingArchiveId(p.id)
      setPendingArchiveUntil(now + 7000)
      toast.warning(
        'Confirmer archivage',
        `Cliquez encore sur "Archiver" pour ${p.name} (7s).`,
      )
      return
    }
    await db.products.update(p.id, { archived: true })
    const next = await db.products.get(p.id)
    if (next) {
      await enqueueProductSync({ action: 'upsert', productId: next.id, product: next })
    }
    setPendingArchiveId(null)
    setPendingArchiveUntil(0)
    toast.info('Article archivé', p.name)
  }

  const handleRestore = async (p: ProductWithStock) => {
    await db.products.update(p.id, { archived: false })
    const next = await db.products.get(p.id)
    if (next) {
      await enqueueProductSync({ action: 'upsert', productId: next.id, product: next })
    }
    toast.success('Article réactivé', p.name)
  }

  const handleDelete = async (p: Product) => {
    const ok = window.confirm(
      `Supprimer définitivement « ${p.name} » ?\n\nCette action est irréversible.`,
    )
    if (!ok) return
    try {
      await deleteProductPermanently(p, auditActor)
      if (editing?.id === p.id) setEditing(null)
      if (detailProduct?.id === p.id) setDetailProduct(null)
      toast.success('Article supprimé', p.name)
    } catch (err) {
      toast.error(
        'Suppression impossible',
        err instanceof Error ? err.message : 'Erreur inattendue',
      )
    }
  }

  const onPickCsv = useCallback(() => {
    fileRef.current?.click()
  }, [])

  const onCsvSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      e.target.value = ''
      if (!f) return
      const text = await f.text()
      const { errors, rows: parsed } = parseProductsCsv(text)
      if (parsed.length === 0 && errors.length === 0) {
        toast.warning('Import CSV', 'Aucune ligne valide dans le fichier.')
        return
      }
      const merge = true
      const r = await applyProductsCsvImport(parsed, {
        updateExistingByBarcode: merge,
      })
      const allErr = [...errors, ...r.errors]
      const summary = `${r.created} créé(s), ${r.updated} mis à jour${
        allErr.length ? ` · ${allErr.length} erreur(s)` : ''
      }.`
      if (allErr.length) {
        const details = allErr
          .slice(0, 4)
          .map((x) => `L${x.line}: ${x.message}`)
          .join(' | ')
        toast.warning('Import partiel', `${summary} ${details}`)
      } else {
        toast.success('Import CSV', summary)
      }
    },
    [toast],
  )

  const handleExport = useCallback(() => {
    if (filtered.length === 0) {
      toast.warning('Export', 'Aucun article à exporter.')
      return
    }
    const date = new Date().toISOString().slice(0, 10)
    exportProductsCsv(filtered, `nora-catalogue-${date}.csv`)
    toast.success('Export CSV', `${filtered.length} article(s) exporté(s).`)
  }, [filtered, toast])

  const openCategory = useCallback((name: string) => {
    setCat(name)
    setViewTab('articles')
  }, [])

  const renderProductActions = (
    p: ProductWithStock,
    compact = false,
    overlay = false,
  ) => {
    if (compact) {
      return (
        <div
          className={cn(
            'catalogue-card-actions',
            overlay && 'catalogue-card-actions--overlay',
          )}
        >
          <button
            type="button"
            className="catalogue-card-icon"
            onClick={() => setDetailProduct(p)}
            aria-label="Voir les détails"
            title="Détails"
          >
            <IconEye size={16} strokeWidth={2.5} />
          </button>
          {canManageCatalog ? (
            <>
              <button
                type="button"
                className="catalogue-card-icon"
                onClick={() => setEditing(p)}
                aria-label="Modifier"
                title="Modifier"
              >
                <IconEdit size={16} strokeWidth={2.5} />
              </button>
              {p.archived ? (
                <button
                  type="button"
                  className="catalogue-card-icon"
                  onClick={() => void handleRestore(p)}
                  aria-label="Réactiver"
                  title="Réactiver"
                >
                  <IconRefund size={16} strokeWidth={2.5} />
                </button>
              ) : (
                <button
                  type="button"
                  className="catalogue-card-icon"
                  onClick={() => void handleArchive(p)}
                  aria-label="Archiver"
                  title="Archiver"
                >
                  <IconArchive size={16} strokeWidth={2.5} />
                </button>
              )}
              <button
                type="button"
                className="catalogue-card-icon catalogue-card-icon--danger"
                onClick={() => void handleDelete(p)}
                aria-label="Supprimer"
                title="Supprimer"
              >
                <IconTrash size={16} strokeWidth={2.5} />
              </button>
            </>
          ) : null}
        </div>
      )
    }

    return (
      <div className="flex min-w-0 flex-wrap justify-end gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          iconLeft={<IconEye />}
          onClick={() => setDetailProduct(p)}
          aria-label="Voir les détails"
        >
          <span className="hidden xl:inline">Détails</span>
        </Button>
        {canManageCatalog ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<IconEdit />}
              onClick={() => setEditing(p)}
              aria-label="Modifier"
            >
              Modifier
            </Button>
            {p.archived ? (
              <Button
                size="sm"
                variant="ghost"
                iconLeft={<IconRefund />}
                onClick={() => void handleRestore(p)}
                aria-label="Réactiver"
              />
            ) : (
              <Button
                size="sm"
                variant="ghost"
                iconLeft={<IconArchive />}
                onClick={() => void handleArchive(p)}
                aria-label="Archiver"
              />
            )}
            <Button
              size="sm"
              variant="danger"
              iconLeft={<IconTrash />}
              onClick={() => void handleDelete(p)}
              aria-label="Supprimer"
            >
              Suppr.
            </Button>
          </>
        ) : null}
      </div>
    )
  }

  const renderStockBadge = (p: ProductWithStock) => {
    const state = stockState(p)
    const tone =
      state === 'rupture' ? 'neutral' : state === 'alerte' ? 'warning' : 'neutral'
    return (
      <Badge tone={tone}>
        <span className="font-mono-nums">{p.stock}</span>
        {state === 'rupture' ? ' · rupture' : state === 'alerte' ? ' · alerte' : ''}
      </Badge>
    )
  }

  return (
    <div className="module-page">
      {adding ? (
        <AddProductModal
          activeStoreLabel={activeStore?.name ?? 'Magasin'}
          onClose={() => setAdding(false)}
          onSave={onSaveNewProduct}
        />
      ) : null}
      {editing ? (
        <EditProductModal
          product={editing}
          canEditPrices={canEditPrices}
          stockAtActiveStore={
            rowsWithStock.find((r) => r.id === editing.id)?.stock ?? 0
          }
          activeStoreLabel={activeStore?.name ?? 'Magasin'}
          onClose={() => setEditing(null)}
          onSave={handleSaveEdit}
          onDelete={() => void handleDelete(editing)}
        />
      ) : null}

      <PageHeader
        icon={<IconCatalogue />}
        eyebrow="Articles"
        title="Articles"
        subtitle={`Prix, codes-barres, TVA et stocks — ${activeStore?.name ?? 'magasin actif'}`}
        actions={
          <>
            {canManageCatalog ? (
              <>
                <Switch
                  label="Archivés"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  iconLeft={<IconDownload />}
                  onClick={() => downloadCsvTemplate()}
                >
                  Modèle
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  aria-label="Sélectionner un fichier CSV produits"
                  className="hidden"
                  onChange={(ev) => void onCsvSelected(ev)}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  iconLeft={<IconUpload />}
                  onClick={onPickCsv}
                >
                  Importer
                </Button>
              </>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<IconDownload />}
              onClick={handleExport}
            >
              Exporter
            </Button>
            {canManageCatalog ? (
              <Button
                size="sm"
                variant="accent"
                iconLeft={<IconPlus />}
                onClick={() => setAdding(true)}
              >
                Nouvel article
              </Button>
            ) : null}
          </>
        }
      />

      <div className="catalogue-hero p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            label="Articles actifs"
            value={stats.active}
            hint={`${stats.total} au total`}
            tone="accent"
            icon={<IconCatalogue />}
          />
          <Kpi
            label="Ruptures"
            value={stats.rupture}
            hint="stock ≤ 0"
            tone={stats.rupture > 0 ? 'rose' : 'neutral'}
            icon={<IconWarning />}
          />
          <Kpi
            label="Alertes stock"
            value={stats.alerte}
            hint="sous le seuil"
            tone={stats.alerte > 0 ? 'amber' : 'neutral'}
            icon={<IconTag />}
          />
          <Kpi
            label="Valorisation stock"
            value={formatFCFA(stats.valuation)}
            hint="prix TTC × quantités"
            tone="violet"
            icon={<IconTrendingUp />}
          />
        </div>
      </div>

      <Tabs
        variant="segmented"
        active={viewTab}
        onChange={setViewTab}
        items={[
          {
            id: 'articles',
            label: 'Articles',
            count: filtered.length,
            icon: <IconCatalogue />,
          },
          {
            id: 'categories',
            label: 'Catégories',
            count: productCategoryRows.length,
            icon: <IconTag />,
          },
        ]}
      />

      {viewTab === 'articles' ? (
        <>
          <div className="catalogue-filter-bar space-y-3 p-4">
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un article ou un code-barres…"
              iconLeft={<IconSearch />}
            />
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="ui-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1">
                {categoryTabs.map((tab) => {
                  const on = cat === tab
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setCat(tab)}
                      className={cn(
                        'caisse-cat-pill shrink-0',
                        on && 'caisse-cat-pill-active',
                      )}
                    >
                      {tab}
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Tabs
                  variant="segmented"
                  active={layoutMode}
                  onChange={setLayoutMode}
                  className="hidden md:inline-flex"
                  items={[
                    { id: 'grid', label: 'Grille', icon: <IconLayers /> },
                    { id: 'table', label: 'Liste', icon: <IconTable /> },
                  ]}
                />
                <Select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="min-w-[140px]"
                  aria-label="Tri des articles"
                >
                  <option value="name">Nom A→Z</option>
                  <option value="price-asc">Prix croissant</option>
                  <option value="price-desc">Prix décroissant</option>
                  <option value="stock-asc">Stock croissant</option>
                  <option value="stock-desc">Stock décroissant</option>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['tous', 'Tous stocks'],
                  ['rupture', 'Ruptures'],
                  ['alerte', 'Alertes'],
                  ['ok', 'Stock OK'],
                ] as const
              ).map(([id, label]) => {
                const on = stockFilter === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setStockFilter(id)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-[11px] font-semibold transition',
                      on
                        ? 'border-[rgba(0,51,170,0.45)] bg-[var(--color-caisse-gold-soft)] text-[var(--color-caisse-gold)]'
                        : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300',
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<IconSearch />}
              title="Aucun article"
              description="Affinez la recherche, changez de catégorie ou de filtre stock."
            />
          ) : layoutMode === 'grid' ? (
            <ul className={cn('grid gap-3', gridCols)}>
              {filtered.map((p) => {
                const state = stockState(p)
                return (
                  <li
                    key={p.id}
                    className={cn(
                      'catalogue-product',
                      p.archived && 'is-archived',
                    )}
                  >
                    <div className="catalogue-product-visual">
                      <button
                        type="button"
                        className="catalogue-product-hit"
                        onClick={() => setDetailProduct(p)}
                      >
                        <div className="catalogue-product-media">
                          <ProductImage
                            product={p}
                            className="h-full w-full object-cover"
                          />
                          <span
                            className={cn(
                              'catalogue-product-stock',
                              state === 'rupture' && 'is-out',
                              state === 'alerte' && 'is-low',
                            )}
                          >
                            {state === 'rupture'
                              ? 'Rupture'
                              : state === 'alerte'
                                ? `Alerte · ${p.stock}`
                                : `Stock ${p.stock}`}
                          </span>
                          {p.archived ? (
                            <span className="catalogue-product-flag">Archivé</span>
                          ) : null}
                        </div>
                      </button>
                      {renderProductActions(p, true, true)}
                    </div>
                    <button
                      type="button"
                      className="catalogue-product-hit"
                      onClick={() => setDetailProduct(p)}
                    >
                      <div className="catalogue-product-body">
                        {p.category ? (
                          <p className="catalogue-product-cat">{p.category}</p>
                        ) : null}
                        <p className="catalogue-product-name">{p.name}</p>
                        <p className="catalogue-product-price">
                          {formatFCFA(p.priceTTC)}
                        </p>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <>
              <div className="hidden md:block">
                <Table minWidth={760}>
                  <THead>
                    <Tr hover={false}>
                      <Th className="w-[60px]">Visuel</Th>
                      <Th>Produit</Th>
                      <Th hideBelow="lg">Catégorie</Th>
                      <Th hideBelow="lg">Code-barres</Th>
                      <Th align="right" hideBelow="xl">
                        TVA
                      </Th>
                      <Th align="right">Prix TTC</Th>
                      <Th align="right">Stock</Th>
                      <Th hideBelow="lg">État</Th>
                      <Th align="right">Actions</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {filtered.map((p) => (
                      <Tr key={p.id} className={p.archived ? 'opacity-70' : ''}>
                        <Td>
                          <ProductImage
                            product={p}
                            className="h-9 w-9 rounded-md border border-zinc-200 object-cover"
                          />
                        </Td>
                        <Td className="font-medium text-zinc-900">
                          {p.name}
                          <span className="mt-0.5 block text-[11px] font-normal text-zinc-500 lg:hidden">
                            <span className="font-mono-nums font-semibold text-[var(--color-caisse-gold)]">
                              {formatFCFA(p.priceTTC)}
                            </span>
                            <span>
                              {' '}
                              · <span className="font-mono-nums">{p.barcode}</span>
                            </span>
                          </span>
                        </Td>
                        <Td hideBelow="lg">{p.category}</Td>
                        <Td hideBelow="lg" mono className="text-zinc-500">
                          {p.barcode}
                        </Td>
                        <Td align="right" hideBelow="xl" mono>
                          {p.vatRatePct ?? 18} %
                        </Td>
                        <Td
                          align="right"
                          mono
                          className="font-semibold text-zinc-900"
                        >
                          {formatFCFA(p.priceTTC)}
                        </Td>
                        <Td align="right">{renderStockBadge(p)}</Td>
                        <Td hideBelow="lg">
                          {p.archived ? (
                            <Badge tone="neutral">Archivé</Badge>
                          ) : (
                            <Badge tone="success">Actif</Badge>
                          )}
                        </Td>
                        <Td align="right">{renderProductActions(p)}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>

              <ul className="grid gap-2 md:hidden">
                {filtered.map((p) => (
                  <li
                    key={p.id}
                    className={cn(
                      'ui-card flex items-start gap-3 p-3',
                      p.archived && 'opacity-70',
                    )}
                  >
                    <ProductImage
                      product={p}
                      className="h-12 w-12 shrink-0 rounded-md border border-zinc-200 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-900">
                          {p.name}
                        </p>
                        <span className="shrink-0 font-mono-nums text-[13px] font-bold text-[var(--color-caisse-gold)]">
                          {formatFCFA(p.priceTTC)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        {p.category} · <span className="font-mono-nums">{p.barcode}</span>
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {renderStockBadge(p)}
                        {p.archived ? (
                          <Badge tone="neutral">Archivé</Badge>
                        ) : (
                          <Badge tone="success">Actif</Badge>
                        )}
                        <div className="ml-auto min-w-0 max-w-full">
                          {renderProductActions(p, true)}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <div className="space-y-4">
          {canManageCatalog ? (
            <Card>
              <CardContent>
                <Field label="Nouvelle catégorie">
                  <div className="flex gap-2">
                    <Input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Ex. Épicerie fine, Cosmétiques…"
                    />
                    <Button
                      variant="primary"
                      loading={categoryAddBusy}
                      disabled={!newCategoryName.trim()}
                      onClick={() => void handleAddCategory()}
                    >
                      Ajouter
                    </Button>
                  </div>
                </Field>
              </CardContent>
            </Card>
          ) : null}

          {categoryStats.length === 0 ? (
            <EmptyState
              icon={<IconTag />}
              title="Aucune catégorie"
              description="Ajoutez une catégorie ou importez des produits."
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {categoryStats.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => openCategory(c.name)}
                    className="catalogue-cat-row flex w-full flex-col gap-2 p-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[14px] font-semibold text-zinc-900">{c.name}</p>
                      <Badge tone="neutral">{c.total} art.</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <Badge tone="success">{c.active} actifs</Badge>
                      {c.rupture > 0 ? (
                        <Badge tone="neutral">{c.rupture} rupture(s)</Badge>
                      ) : null}
                      {c.alerte > 0 ? (
                        <Badge tone="warning">{c.alerte} alerte(s)</Badge>
                      ) : null}
                    </div>
                    <span className="text-[11px] font-medium text-[var(--color-caisse-gold)]">
                      Voir les articles →
                    </span>
                  </button>
                  {canManageCatalog ? (
                    <div className="mt-1 flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleRenameCategory(c.id, c.name)}
                      >
                        Renommer
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleDeleteCategory(c.id, c.name)}
                      >
                        Supprimer
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canManageCatalog ? (
        <p className="text-[11px] leading-relaxed text-zinc-500">
          Import CSV : séparateur virgule ou point-virgule, en-têtes{' '}
          <code className="ui-kbd">nom</code>,{' '}
          <code className="ui-kbd">prix_ttc</code>,{' '}
          <code className="ui-kbd">code_barres</code>,{' '}
          <code className="ui-kbd">categorie</code>,{' '}
          <code className="ui-kbd">stock</code>,{' '}
          <code className="ui-kbd">seuil</code>,{' '}
          <code className="ui-kbd">tva_pct</code> (optionnel{' '}
          <code className="ui-kbd">archive</code>,{' '}
          <code className="ui-kbd">image_url</code>). Le stock est appliqué au{' '}
          <strong>magasin principal</strong>. L’export inclut le stock du magasin actif.
        </p>
      ) : (
        <p className="text-center text-[11px] text-zinc-400">
          Lecture seule — contactez un gérant ou un administrateur pour modifier.
        </p>
      )}

      <ProductDetailModal
        product={detailProduct}
        allProducts={rowsWithStock.filter((p) => !p.archived)}
        variant="backoffice"
        onClose={() => setDetailProduct(null)}
        onSelect={(p) => setDetailProduct(p)}
      />
    </div>
  )
}
