import { useMemo, useRef, useState } from 'react'
import type { ProductWithStock } from '../db/types'
import { formatFCFA } from '../lib/money'
import {
  getQuickSaleFavoriteIds,
  toggleQuickSaleFavorite,
} from '../lib/posFavorites'
import { formatPricePerUnit, formatQty, packHint, saleUnitOf } from '../lib/saleUnit'
import { useHorizontalWheelScroll } from '../hooks/useHorizontalWheelScroll'
import { ProductImage } from './ProductImage'
import { cn } from '../ui/cn'
import { EmptyState } from '../ui/EmptyState'
import { IconPlus, IconSearch, IconStar } from '../ui/icons'
import type { CategoryTab } from './Sidebar'

export type ProductGridDensity = 'compact' | 'confort'

type Props = {
  products: ProductWithStock[]
  categoryTabs: CategoryTab[]
  category: CategoryTab
  onCategoryChange: (tab: CategoryTab) => void
  search: string
  onAdd: (p: ProductWithStock, originEl?: HTMLElement | null) => void
  density?: ProductGridDensity
}

function stockState(p: ProductWithStock): 'rupture' | 'faible' | 'ok' {
  if (p.stock <= 0) return 'rupture'
  if (p.stock <= p.lowStockThreshold) return 'faible'
  return 'ok'
}

export function ProductGrid({
  products,
  categoryTabs,
  category,
  onCategoryChange,
  search,
  onAdd,
  density = 'compact',
}: Props) {
  const q = search.trim().toLowerCase()
  const [favoriteIds, setFavoriteIds] = useState(() => getQuickSaleFavoriteIds())

  const filtered = products.filter((p) => {
    if (category !== 'Tous' && p.category !== category) return false
    if (!q) return true
    return p.name.toLowerCase().includes(q) || p.barcode.includes(q)
  })

  const favorites = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]))
    return favoriteIds
      .map((id) => byId.get(id))
      .filter((p): p is ProductWithStock => Boolean(p))
  }, [favoriteIds, products])

  const isCompact = density === 'compact'
  const categoryScrollRef = useRef<HTMLDivElement>(null)
  useHorizontalWheelScroll(categoryScrollRef)

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of products) {
      const cat = p.category || 'Sans catégorie'
      counts.set(cat, (counts.get(cat) ?? 0) + 1)
    }
    return counts
  }, [products])

  const hasSearch = q.length > 0

  const toggleFavorite = (productId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setFavoriteIds(toggleQuickSaleFavorite(productId))
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-caisse-gold">
          Catalogue
        </p>
        <div className="flex items-center gap-2">
          {hasSearch ? (
            <span className="rounded-full border border-[rgba(0,51,170,0.25)] bg-white/90 px-2.5 py-0.5 text-[10px] font-medium text-caisse-muted">
              Filtre actif
            </span>
          ) : null}
          <p className="font-mono-nums text-[12px] text-caisse-muted">
            {filtered.length} article{filtered.length > 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {favorites.length > 0 && !hasSearch ? (
        <div className="mb-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-caisse-muted">
            <IconStar className="h-3 w-3 text-caisse-gold" />
            Vente rapide
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {favorites.map((p, idx) => {
              const disabled = p.stock <= 0
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled}
                  title={`${p.name} (raccourci ${idx < 9 ? idx + 1 : '—'})`}
                  onClick={(e) => onAdd(p, e.currentTarget)}
                  className="caisse-product-card flex min-w-[7.5rem] max-w-[9rem] shrink-0 flex-col px-2.5 py-2 text-left disabled:opacity-45"
                >
                  <span className="mb-0.5 font-mono-nums text-[10px] text-caisse-muted">
                    {idx < 9 ? `Alt+${idx + 1}` : '★'}
                  </span>
                  <span className="truncate text-[12px] font-semibold text-caisse-ink">
                    {p.name}
                  </span>
                  <span className="font-mono-nums text-[11px] text-caisse-gold">
                    {formatFCFA(p.priceTTC)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      <div
        ref={categoryScrollRef}
        className="caisse-filter-bar tabs-scroll-x mb-5 flex gap-2 overflow-x-auto p-1.5"
      >
        {categoryTabs.map((tab) => {
          const on = tab === category
          const count =
            tab === 'Tous' ? products.length : categoryCounts.get(tab) ?? 0
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onCategoryChange(tab)}
              className={cn('caisse-cat-pill shrink-0', on && 'caisse-cat-pill-active')}
            >
              <span>{tab}</span>
              {count > 0 ? (
                <span
                  className={cn(
                    'ml-1.5 rounded-full px-1.5 py-px font-mono-nums text-[10px]',
                    on ? 'bg-white/70 text-caisse-gold' : 'bg-[#e8eefa] text-caisse-muted',
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<IconSearch className="text-violet-600" />}
          title="Aucun article"
          description="Affinez la recherche ou changez de catégorie."
        />
      ) : (
        <div
          className={cn(
            isCompact
              ? 'grid gap-2 grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10'
              : 'grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10',
          )}
        >
          {filtered.map((p) => {
            const state = stockState(p)
            const disabled = state === 'rupture'
            const isFav = favoriteIds.includes(p.id)
            return (
              <div key={p.id} className="relative">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={(e) => onAdd(p, e.currentTarget)}
                  className={cn(
                    'caisse-product-card caisse-product-card--tile group flex min-w-0 flex-col text-left disabled:cursor-not-allowed disabled:opacity-45',
                    isCompact && 'caisse-product-card--compact',
                  )}
                >
                  <div className="caisse-product-media">
                    <ProductImage
                      product={p}
                      className="h-full w-full object-cover"
                    />
                    {state === 'rupture' ? (
                      <span className="caisse-product-stock caisse-product-stock--out">
                        Rupture
                      </span>
                    ) : state === 'faible' ? (
                      <span className="caisse-product-stock caisse-product-stock--low">
                        Faible
                      </span>
                    ) : !isCompact ? (
                      <span className="caisse-product-stock caisse-product-stock--ok">
                        {formatQty(p.stock, saleUnitOf(p))}
                      </span>
                    ) : null}
                    {!disabled ? (
                      <span className="caisse-product-add" aria-hidden>
                        <IconPlus className="h-3.5 w-3.5" />
                      </span>
                    ) : null}
                  </div>
                  <div className="caisse-product-meta">
                    {!isCompact && p.category ? (
                      <p className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-caisse-muted">
                        {p.category}
                      </p>
                    ) : null}
                    <p
                      className={cn(
                        'min-w-0 truncate font-semibold leading-tight text-caisse-ink',
                        isCompact ? 'text-[10px]' : 'text-[12px]',
                        disabled && 'text-[#8a919e]',
                      )}
                    >
                      {p.name}
                    </p>
                    <p
                      className={cn(
                        'caisse-price min-w-0 truncate font-mono-nums',
                        isCompact ? 'text-[10px]' : 'text-[12px]',
                      )}
                    >
                      {(() => {
                        const hint = packHint(p)
                        return (
                          <>
                            {formatPricePerUnit(
                              p.priceTTC,
                              saleUnitOf(p),
                              formatFCFA,
                            )}
                            {hint ? (
                              <span className="ml-1 text-[9px] font-normal text-caisse-muted">
                                · {hint}
                              </span>
                            ) : null}
                          </>
                        )
                      })()}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  className={cn(
                    'absolute right-1 top-1 z-10 rounded-full bg-white/90 p-1 shadow-sm',
                    isFav
                      ? 'text-caisse-gold'
                      : 'text-zinc-400 hover:text-caisse-gold',
                  )}
                  aria-label={
                    isFav
                      ? 'Retirer des favoris vente rapide'
                      : 'Ajouter en vente rapide'
                  }
                  title="Vente rapide"
                  onClick={(e) => toggleFavorite(p.id, e)}
                >
                  <IconStar
                    className="h-3.5 w-3.5"
                    fill={isFav ? 'currentColor' : 'none'}
                  />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
