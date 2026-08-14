import { useEffect, useRef, useState, type ReactNode } from 'react'
import { VIEW_ACCENTS, type NavSection, type NavViewId } from '../navigation'
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

type Props = {
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

function RailButton({
  label,
  active,
  onClick,
  disabled,
  children,
}: {
  label: string
  active?: boolean
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip content={label} side="right">
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition',
          active
            ? 'bg-[#0033aa] text-white shadow-sm'
            : 'text-[#0033aa] hover:bg-[#e8eefa] hover:text-[#00257a]',
          disabled && 'pointer-events-none opacity-40',
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}

export function Topbar({
  view,
  online,
  syncLabel,
  syncBusy,
  onSyncNow,
  onLogout,
  onOpenModules,
  stores = [],
  activeStoreId,
  onActiveStoreChange,
  canSwitchStore = false,
  productGridDensity,
  onProductGridDensityChange,
  navSections = [],
  onSelectView,
}: Props) {
  const isDash = view === 'dash'
  const railModules = navSections
    .flatMap((section) => section.items)
    .filter((item) => item.id !== 'dash')
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
    <header
      className={cn(
        'z-20 flex shrink-0 items-center gap-1 border-[rgba(26,35,50,0.07)] bg-[linear-gradient(180deg,rgba(247,248,252,0.96),rgba(238,241,248,0.9))] backdrop-blur-xl',
        'w-full flex-row border-b px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))]',
        'md:h-full md:w-[4.75rem] md:flex-col md:border-b-0 md:border-r md:px-2 md:py-3',
      )}
    >
      <RailButton
        label="Tableau de bord"
        active={isDash}
        onClick={onOpenModules}
      >
        <IconDash className="h-7 w-7" />
      </RailButton>

      {railModules.length > 0 && onSelectView ? (
        <nav
          aria-label="Modules"
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:min-h-0 md:flex-col md:overflow-x-hidden md:overflow-y-auto"
        >
          {railModules.map((item) => {
            const active = view === item.id
            return (
              <RailButton
                key={item.id}
                label={item.label}
                active={active}
                onClick={() => onSelectView(item.id)}
              >
                <span
                  className={cn(
                    !active && VIEW_ACCENTS[item.id].icon.split(' ')[0],
                  )}
                >
                  <NavIcon id={item.id} className="h-7 w-7" />
                </span>
              </RailButton>
            )
          })}
        </nav>
      ) : null}

      <span className="mx-1 hidden h-px w-8 shrink-0 bg-zinc-200 md:block" aria-hidden />
      <span className="h-6 w-px shrink-0 bg-zinc-200 md:hidden" aria-hidden />

      {stores.length > 0 ? (
        <div className="relative" ref={storeMenuRef}>
          <Tooltip content={activeStore?.name ?? 'Magasin'} side="right">
            <button
              type="button"
              aria-label={activeStore?.name ?? 'Magasin'}
              aria-expanded={storeMenuOpen}
              disabled={!canOpenStoreMenu}
              onClick={() => setStoreMenuOpen((open) => !open)}
              className={cn(
                'relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-emerald-700 transition',
                canOpenStoreMenu
                  ? 'hover:bg-emerald-50'
                  : 'cursor-default opacity-90',
                storeMenuOpen && 'bg-emerald-50',
              )}
            >
              <IconStore className="h-7 w-7" />
              {canOpenStoreMenu ? (
                <IconChevronDown className="absolute right-0.5 bottom-0.5 h-2.5 w-2.5 text-emerald-500" />
              ) : null}
            </button>
          </Tooltip>
          {storeMenuOpen && canOpenStoreMenu ? (
            <ul className="absolute left-0 top-full z-50 mt-1 max-h-64 w-52 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-(--shadow-pop) md:left-full md:top-0 md:mt-0 md:ml-2">
              {stores.map((store) => (
                <li key={store.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onActiveStoreChange?.(store.id)
                      setStoreMenuOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[12px]',
                      store.id === activeStoreId
                        ? 'bg-zinc-100 font-semibold text-zinc-900'
                        : 'text-zinc-700 hover:bg-zinc-50',
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
          onClick={() =>
            onProductGridDensityChange(
              productGridDensity === 'compact' ? 'confort' : 'compact',
            )
          }
        >
          <IconLayers className="h-7 w-7" />
        </RailButton>
      ) : null}

      <div className="ml-auto flex items-center gap-1 md:mt-auto md:ml-0 md:flex-col">
        <Tooltip
          content={online ? `En ligne · ${syncLabel}` : `Hors ligne · ${syncLabel}`}
          side="right"
        >
          <span
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            aria-label={online ? 'En ligne' : 'Hors ligne'}
          >
            {online ? (
              <IconOnline className="h-6 w-6 text-emerald-600" />
            ) : (
              <IconOffline className="h-6 w-6 text-amber-600" />
            )}
          </span>
        </Tooltip>
        <RailButton
          label={syncBusy ? 'Synchronisation…' : 'Synchroniser'}
          onClick={onSyncNow}
          disabled={!online || syncBusy}
        >
          <IconSync className={cn('h-6 w-6', syncBusy && 'animate-spin')} />
        </RailButton>
        <RailButton label="Quitter" onClick={onLogout}>
          <IconLogout className="h-6 w-6 text-rose-500" />
        </RailButton>
      </div>
    </header>
  )
}
