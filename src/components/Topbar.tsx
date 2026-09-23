import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  VIEW_RAIL_COLORS,
  type NavSection,
  type NavViewId,
  type ViewRailColor,
} from '../navigation'
import { cn } from '../ui/cn'
import { Tooltip } from '../ui/Tooltip'
import {
  IconChevronDown,
  IconDash,
  IconLayers,
  IconLogout,
  IconOffline,
  IconOnline,
  IconStore,
  IconSync,
} from '../ui/icons'
import { NavIcon } from './NavIcons'
import type { ProductGridDensity } from './ProductGrid'

type StoreOption = { id: string; name: string }

export type TopbarProps = {
  view: NavViewId
  online: boolean
  syncLabel: string
  syncBusy: boolean
  onSyncNow: () => void
  onLogout: () => void
  onOpenModules?: () => void
  stores?: StoreOption[]
  activeStoreId?: string
  onActiveStoreChange?: (id: string) => void
  canSwitchStore?: boolean
  productGridDensity?: ProductGridDensity
  onProductGridDensityChange?: (density: ProductGridDensity) => void
  navSections?: readonly NavSection[]
  onSelectView?: (id: NavViewId) => void
}

function railAccentStyle(color: ViewRailColor, active: boolean): CSSProperties {
  return {
    ['--rail-accent-fg' as string]: active ? color.fgOn : color.fg,
    ['--rail-accent-bg' as string]: active ? color.bgOn : color.bg,
  }
}

function RailButton({
  label,
  active,
  onClick,
  disabled,
  tone = 'default',
  tooltipSide = 'right',
  railColor,
  children,
}: {
  label: string
  active?: boolean
  onClick?: () => void
  disabled?: boolean
  tone?: 'default' | 'danger' | 'success'
  tooltipSide?: 'right' | 'bottom' | 'left' | 'top'
  /** Couleurs module rail (hex via CSS vars). */
  railColor?: ViewRailColor
  children: ReactNode
}) {
  return (
    <Tooltip content={label} side={tooltipSide}>
      <button
        type="button"
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        disabled={disabled}
        onClick={onClick}
        style={railColor ? railAccentStyle(railColor, !!active) : undefined}
        className={cn(
          'rail-btn',
          railColor && 'rail-btn--accent',
          active && railColor && 'rail-btn--accent-on',
          active && !railColor && 'rail-btn--active',
          tone === 'danger' && !active && 'rail-btn--danger',
          tone === 'success' && !active && 'rail-btn--success',
          disabled && 'rail-btn--disabled',
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}

/** Barre d’actions en haut : magasin, sync, statut, quitter. */
export function AppChromeHeader({
  online,
  syncLabel,
  syncBusy,
  onSyncNow,
  onLogout,
  stores = [],
  activeStoreId,
  onActiveStoreChange,
  canSwitchStore = false,
  productGridDensity,
  onProductGridDensityChange,
}: Pick<
  TopbarProps,
  | 'online'
  | 'syncLabel'
  | 'syncBusy'
  | 'onSyncNow'
  | 'onLogout'
  | 'stores'
  | 'activeStoreId'
  | 'onActiveStoreChange'
  | 'canSwitchStore'
  | 'productGridDensity'
  | 'onProductGridDensityChange'
>) {
  const activeStore = stores.find((s) => s.id === activeStoreId)
  const canOpenStoreMenu = canSwitchStore && stores.length > 1
  const [storeMenuOpen, setStoreMenuOpen] = useState(false)
  const storeMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!storeMenuOpen) return
    const onPointer = (e: PointerEvent) => {
      if (!storeMenuRef.current?.contains(e.target as Node)) {
        setStoreMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStoreMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [storeMenuOpen])

  const densityLabel =
    productGridDensity === 'compact' ? 'Grille compacte' : 'Grille confort'

  return (
    <header className="app-chrome" aria-label="Actions">
      <div className="app-chrome-brand">
        {activeStore ? (
          <span className="app-chrome-store-name">{activeStore.name}</span>
        ) : null}
      </div>
      <div className="app-chrome-actions">
        {stores.length > 0 ? (
          <div className="relative" ref={storeMenuRef}>
            <Tooltip content={activeStore?.name ?? 'Magasin'} side="bottom">
              <button
                type="button"
                aria-label={activeStore?.name ?? 'Magasin'}
                aria-expanded={storeMenuOpen}
                disabled={!canOpenStoreMenu}
                onClick={() => setStoreMenuOpen((open) => !open)}
                className={cn(
                  'rail-btn',
                  storeMenuOpen && 'rail-btn--soft',
                  !canOpenStoreMenu && 'cursor-default',
                )}
              >
                <span className="rail-icon-wrap">
                  <IconStore className="h-5 w-5 text-emerald-700" />
                  {canOpenStoreMenu ? (
                    <IconChevronDown className="rail-chevron text-emerald-700" />
                  ) : null}
                </span>
              </button>
            </Tooltip>
            {storeMenuOpen && canOpenStoreMenu ? (
              <ul className="rail-store-menu rail-store-menu--header">
                {stores.map((store) => (
                  <li key={store.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onActiveStoreChange?.(store.id)
                        setStoreMenuOpen(false)
                      }}
                      className={cn(
                        'rail-store-item',
                        store.id === activeStoreId && 'rail-store-item--on',
                      )}
                    >
                      {store.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {onProductGridDensityChange && productGridDensity ? (
          <RailButton
            label={densityLabel}
            tooltipSide="bottom"
            onClick={() =>
              onProductGridDensityChange(
                productGridDensity === 'compact' ? 'confort' : 'compact',
              )
            }
          >
            <IconLayers className="h-5 w-5" />
          </RailButton>
        ) : null}

        <Tooltip
          content={
            online ? `En ligne · ${syncLabel}` : `Hors ligne · ${syncLabel}`
          }
          side="bottom"
        >
          <span
            className={cn(
              'rail-status',
              online ? 'rail-status--online' : 'rail-status--offline',
            )}
            aria-label={online ? 'En ligne' : 'Hors ligne'}
          >
            {online ? (
              <IconOnline className="h-5 w-5" />
            ) : (
              <IconOffline className="h-5 w-5" />
            )}
          </span>
        </Tooltip>

        <RailButton
          label={syncBusy ? 'Synchronisation…' : 'Synchroniser'}
          tooltipSide="bottom"
          onClick={onSyncNow}
          disabled={!online || syncBusy}
        >
          <IconSync
            className={cn(
              'h-5 w-5 text-[#0033aa]',
              syncBusy && 'animate-spin',
            )}
          />
        </RailButton>

        <RailButton
          label="Quitter"
          tooltipSide="bottom"
          onClick={onLogout}
          tone="danger"
        >
          <IconLogout className="h-5 w-5" />
        </RailButton>
      </div>
    </header>
  )
}

/** Rail gauche : modules uniquement. */
export function Topbar({
  view,
  onOpenModules,
  navSections = [],
  onSelectView,
}: Pick<TopbarProps, 'view' | 'onOpenModules' | 'navSections' | 'onSelectView'>) {
  const isDash = view === 'dash'
  const moduleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.id !== 'dash'),
    }))
    .filter((section) => section.items.length > 0)

  return (
    <aside className="rail" aria-label="Navigation">
      <div className="rail-top">
        <RailButton
          label="Tableau de bord"
          active={isDash}
          onClick={onOpenModules}
          railColor={VIEW_RAIL_COLORS.dash}
        >
          <IconDash className="h-5 w-5" />
        </RailButton>
      </div>

      {moduleSections.length > 0 && onSelectView ? (
        <nav aria-label="Modules" className="rail-nav">
          {moduleSections.map((section, sectionIndex) => (
            <div key={section.title} className="rail-group">
              {sectionIndex > 0 ? (
                <div className="rail-divider" aria-hidden />
              ) : null}
              <ul className="rail-list">
                {section.items.map((item) => {
                  const active = view === item.id
                  return (
                    <li key={item.id}>
                      <RailButton
                        label={item.label}
                        active={active}
                        onClick={() => onSelectView(item.id)}
                        railColor={VIEW_RAIL_COLORS[item.id]}
                      >
                        <span className="rail-icon-wrap">
                          <NavIcon id={item.id} className="h-5 w-5" />
                          {item.badge === 'lowStock' ? (
                            <span className="rail-dot" aria-hidden />
                          ) : null}
                        </span>
                      </RailButton>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
      ) : (
        <div className="rail-nav" />
      )}
    </aside>
  )
}
