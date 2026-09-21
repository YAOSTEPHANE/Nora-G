import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../../db/db'
import type { Product, ProductVariant, VariantStoreStock } from '../../db/types'
import { productIsActive } from '../../lib/productFilters'
import { formatFCFA } from '../../lib/money'
import { variantStoreStockRowId } from '../../lib/variantStockId'
import { syncProductStockFromVariants } from '../../lib/variantStock'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { Field, Input, Select } from '../../ui/Input'
import { useToast } from '../../ui/Toast'

type Props = {
  storeId: string
  storeLabel: string
  canManage: boolean
  products: Product[]
}

export function ProductVariantsPanel({
  storeId,
  storeLabel,
  canManage,
  products,
}: Props) {
  const toast = useToast()
  const activeProducts = useMemo(
    () => products.filter(productIsActive),
    [products],
  )
  const variants =
    useLiveQuery(() => db.productVariants.toArray(), [], []) ?? []
  const variantStocks =
    useLiveQuery(
      () => db.variantStoreStocks.where('storeId').equals(storeId).toArray(),
      [storeId],
      [],
    ) ?? []

  const [productId, setProductId] = useState('')
  const [label, setLabel] = useState('')
  const [sku, setSku] = useState('')
  const [barcode, setBarcode] = useState('')
  const [stock, setStock] = useState('0')
  const [busy, setBusy] = useState(false)
  const [filterProductId, setFilterProductId] = useState('all')
  const [editStockId, setEditStockId] = useState<string | null>(null)
  const [editStockValue, setEditStockValue] = useState('')

  const stockByVariant = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of variantStocks) m.set(r.variantId, r.stock)
    return m
  }, [variantStocks])

  const productName = useMemo(
    () => new Map(products.map((p) => [p.id, p.name])),
    [products],
  )

  const visible = useMemo(() => {
    let list = [...variants].filter((v) => v.active)
    if (filterProductId !== 'all') {
      list = list.filter((v) => v.productId === filterProductId)
    }
    return list.sort(
      (a, b) =>
        a.productId.localeCompare(b.productId) ||
        a.sortOrder - b.sortOrder ||
        a.label.localeCompare(b.label, 'fr'),
    )
  }, [variants, filterProductId])

  const createVariant = async () => {
    if (!canManage) return
    const pid = productId.trim()
    const lab = label.trim()
    if (!pid || !lab) {
      toast.error('Produit et libellé requis')
      return
    }
    const qty = Number(stock.replace(',', '.'))
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error('Stock initial invalide')
      return
    }
    setBusy(true)
    try {
      const now = Date.now()
      const id = crypto.randomUUID()
      const row: ProductVariant = {
        id,
        productId: pid,
        label: lab,
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        active: true,
        sortOrder: variants.filter((v) => v.productId === pid).length,
        createdAt: now,
        updatedAt: now,
      }
      const vs: VariantStoreStock = {
        id: variantStoreStockRowId(storeId, id),
        storeId,
        productId: pid,
        variantId: id,
        stock: qty,
      }
      await db.productVariants.add(row)
      await db.variantStoreStocks.put(vs)
      const total = await syncProductStockFromVariants(storeId, pid)
      setLabel('')
      setSku('')
      setBarcode('')
      setStock('0')
      toast.success('Variante créée', `Stock produit = ${total}`)
    } catch (e) {
      toast.error(
        'Échec',
        e instanceof Error ? e.message : String(e),
      )
    } finally {
      setBusy(false)
    }
  }

  const saveStock = async (variant: ProductVariant) => {
    if (!canManage) return
    const qty = Number(editStockValue.replace(',', '.'))
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error('Quantité invalide')
      return
    }
    setBusy(true)
    try {
      await db.variantStoreStocks.put({
        id: variantStoreStockRowId(storeId, variant.id),
        storeId,
        productId: variant.productId,
        variantId: variant.id,
        stock: qty,
      })
      const total = await syncProductStockFromVariants(
        storeId,
        variant.productId,
      )
      setEditStockId(null)
      toast.success('Stock variante à jour', `Total produit ${total}`)
    } catch (e) {
      toast.error(
        'Échec',
        e instanceof Error ? e.message : String(e),
      )
    } finally {
      setBusy(false)
    }
  }

  const archiveVariant = async (variant: ProductVariant) => {
    if (!canManage) return
    await db.productVariants.update(variant.id, {
      active: false,
      updatedAt: Date.now(),
    })
    await db.variantStoreStocks.put({
      id: variantStoreStockRowId(storeId, variant.id),
      storeId,
      productId: variant.productId,
      variantId: variant.id,
      stock: 0,
    })
    await syncProductStockFromVariants(storeId, variant.productId)
    toast.info('Variante archivée')
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-ink-muted">
        Variantes par produit (taille, couleur, pack…) — magasin{' '}
        <strong>{storeLabel}</strong>. Le stock catalogue est la somme des
        variantes actives (temps réel Dexie).
      </p>

      {canManage ? (
        <div className="rounded-xl border border-border/70 bg-white p-3">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
            Nouvelle variante
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Produit" required>
              <Select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <option value="">Choisir…</option>
                {activeProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Libellé" required>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="M / Rouge"
              />
            </Field>
            <Field label="SKU">
              <Input value={sku} onChange={(e) => setSku(e.target.value)} />
            </Field>
            <Field label="Code-barres">
              <Input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
              />
            </Field>
            <Field label="Stock initial">
              <Input
                inputMode="decimal"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="font-mono-nums"
              />
            </Field>
          </div>
          <div className="mt-2">
            <Button
              variant="accent"
              loading={busy}
              onClick={() => void createVariant()}
            >
              Ajouter la variante
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Filtrer produit" className="min-w-[200px]">
          <Select
            value={filterProductId}
            onChange={(e) => setFilterProductId(e.target.value)}
          >
            <option value="all">Tous</option>
            {activeProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Badge tone="info">{visible.length} variante(s)</Badge>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="Aucune variante"
          description="Créez des variantes pour suivre le stock par déclinaison."
        />
      ) : (
        <ul className="space-y-1.5">
          {visible.map((v) => {
            const qty = stockByVariant.get(v.id) ?? 0
            const editing = editStockId === v.id
            return (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">
                    {productName.get(v.productId) ?? 'Produit'}
                    <span className="font-normal text-ink-muted">
                      {' '}
                      · {v.label}
                    </span>
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {v.sku ? `SKU ${v.sku}` : 'Sans SKU'}
                    {v.barcode ? ` · ${v.barcode}` : ''}
                    {v.priceTTC != null
                      ? ` · ${formatFCFA(v.priceTTC)}`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {editing ? (
                    <>
                      <Input
                        className="w-24 font-mono-nums"
                        value={editStockValue}
                        onChange={(e) => setEditStockValue(e.target.value)}
                        inputMode="decimal"
                      />
                      <Button
                        size="sm"
                        variant="accent"
                        loading={busy}
                        onClick={() => void saveStock(v)}
                      >
                        OK
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditStockId(null)}
                      >
                        Annuler
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="font-mono-nums text-[14px] font-bold text-caisse-gold">
                        {qty}
                      </span>
                      {canManage ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditStockId(v.id)
                              setEditStockValue(String(qty))
                            }}
                          >
                            Stock
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void archiveVariant(v)}
                          >
                            Archiver
                          </Button>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
