import { useEffect, useState, type ReactNode } from 'react'
import type { UserRole } from '../auth/types'
import { roleLabel } from '../auth/profiles'
import type { Store } from '../db/types'
import {
  navSectionsForRole,
  VIEW_ACCENTS,
  type NavSection,
  type NavViewId,
} from '../navigation'
import { Badge } from '../ui/Badge'
import { cn } from '../ui/cn'
import { Tooltip } from '../ui/Tooltip'
import { BRAND_NAME } from '../brand'
import {
  getCachedOrgWorkspaceBranding,
  ORG_BRANDING_CHANGED_EVENT,
  resolveOrgWorkspaceBranding,
} from '../lib/orgWorkspaceBranding'
import { BrandLogo } from './BrandLogo'
import {
  IconAnalytique,
  IconCaisse,
  IconDash,
  IconCatalogue,
  IconChevronDown,
  IconClose,
  IconCollapse,
  IconExpand,
  IconIntegrations,
  IconJournal,
  IconLogout,
  IconNetwork,
  IconOnlineOrders,
  IconPersonnel,
  IconPointage,
  IconSpreadsheet,
  IconStocks,
  IconStore,
  IconTable,
  IconTag,
  IconStar,
  IconMail,
  IconFile,
  IconReceipt,
  IconSettings,
  IconTruck,
  IconWrench,
  IconCheckCircle,
  IconCalendar,
  IconCash,
  IconKey,
  IconRefund,
  IconLayers,
  IconArchive,
  IconCard,
  IconShield,
  IconSparkles,
  IconWarning,
  IconAlert,
} from '../ui/icons'

/** Onglet filtre caisse : « Tous » ou libellé de catégorie (voir `productCategories` en base). */
export type CategoryTab = string

const ICON_BY_VIEW: Record<NavViewId, ReactNode> = {
  dash: <IconDash />,
  caisse: <IconCaisse />,
  catalogue: <IconCatalogue />,
  stocks: <IconStocks />,
  comptabilite: <IconSpreadsheet />,
  rh: <IconPersonnel />,
  crm: <IconMail />,
  kitchen: <IconFile />,
  ticketsFactures: <IconReceipt />,
  tables: <IconTable />,
  promotions: <IconTag />,
  loyalty: <IconStar />,
  onlineOrders: <IconOnlineOrders />,
  journal: <IconJournal />,
  personnel: <IconPersonnel />,
  pointage: <IconPointage />,
  analytique: <IconAnalytique />,
  integrations: <IconIntegrations />,
  parametres: <IconSettings />,
  network: <IconNetwork />,
  achats: <IconTruck />,
  devis: <IconFile />,
  sav: <IconWrench />,
  credits: <IconCash />,
  inventairePhysique: <IconCheckCircle />,
  peremptions: <IconCalendar />,
  livraisons: <IconTruck />,
  location: <IconKey />,
  carte: <IconCaisse />,
  cadeaux: <IconStar />,
  rdv: <IconPointage />,
  tarifs: <IconTag />,
  retoursFournisseur: <IconRefund />,
  production: <IconLayers />,
  bl: <IconArchive />,
  depenses: <IconCard />,
  retoursClient: <IconRefund />,
  consignes: <IconArchive />,
  ordonnances: <IconFile />,
  chantiers: <IconWrench />,
  abonnements: <IconStar />,
  haccp: <IconShield />,
  vip: <IconSparkles />,
  commissions: <IconCash />,
  misesDeCote: <IconArchive />,
  pertes: <IconWarning />,
  allergenes: <IconAlert />,
  evenements: <IconStar />,
  reprises: <IconRefund />,
  protocoles: <IconFile />,
  cave: <IconCaisse />,
  magistrales: <IconLayers />,
}


type CommonProps = {
  activeView: NavViewId
  onSelectView: (id: NavViewId) => void
  ruptureCount: number
  lowStockCount: number
  onlineOrdersPending: number
  stores: Store[]
  activeStoreId: string
  onActiveStoreChange: (id: string) => void
  canSwitchStore: boolean
  user: {
    displayName: string
    initials: string
    role: UserRole
  }
  onLogout: () => void
  navSections?: readonly NavSection[]
}

type DesktopProps = CommonProps & {
  collapsed: boolean
  onToggleCollapsed: () => void
}

type MobileProps = CommonProps & {
  open: boolean
  onClose: () => void
}

function SidebarBody({
  activeView,
  onSelectView,
  ruptureCount,
  lowStockCount,
  onlineOrdersPending,
  stores,
  activeStoreId,
  onActiveStoreChange,
  canSwitchStore,
  user,
  onLogout,
  navSections,
  collapsed,
  onToggleCollapsed,
  variant,
}: CommonProps & {
  collapsed: boolean
  onToggleCollapsed?: () => void
  variant: 'desktop' | 'mobile'
}) {
  const sections = navSections ?? navSectionsForRole(user.role)
  const activeStore = stores.find((s) => s.id === activeStoreId)
  const [storeMenuOpen, setStoreMenuOpen] = useState(false)
  const isMobile = variant === 'mobile'
  const [orgBranding, setOrgBranding] = useState(() =>
    getCachedOrgWorkspaceBranding(),
  )

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void resolveOrgWorkspaceBranding().then((next) => {
        if (!cancelled) setOrgBranding(next)
      })
    }
    refresh()
    const onChanged = () => {
      setOrgBranding(getCachedOrgWorkspaceBranding())
      refresh()
    }
    window.addEventListener(ORG_BRANDING_CHANGED_EVENT, onChanged)
    return () => {
      cancelled = true
      window.removeEventListener(ORG_BRANDING_CHANGED_EVENT, onChanged)
    }
  }, [])

  const workspaceTitle =
    orgBranding.displayName?.trim() ||
    activeStore?.name?.trim() ||
    BRAND_NAME
  const workspaceLogo = orgBranding.logoUrl?.trim() || undefined

  return (
    <>
      {/* Brand entreprise (vitrine), pas le logo SaaS plateforme */}
      <div
        className={cn(
          'flex h-16 items-center gap-2.5 border-b border-zinc-100 px-3',
          collapsed ? 'justify-center' : 'px-4',
        )}
      >
        <BrandLogo
          size="md"
          alt={workspaceTitle}
          ring="subtle"
          src={workspaceLogo}
        />
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold tracking-tight text-zinc-900">
              {workspaceTitle}
            </p>
            <p className="truncate text-[10px] uppercase tracking-wider text-zinc-400">
              Point de vente
            </p>
          </div>
        ) : null}
      </div>

      {/* Nav */}
      <nav className="ui-scroll flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            {!collapsed ? (
              <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                {section.title}
              </p>
            ) : (
              <div className="mb-1 px-2">
                <div className="ui-divider" />
              </div>
            )}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const isActive = activeView === item.id
                const showStockBadges =
                  'stockBadges' in item && item.stockBadges
                const showOnlineOrdersBadge =
                  item.id === 'onlineOrders' && onlineOrdersPending > 0
                const badgeCount =
                  item.badge === 'lowStock' ? lowStockCount : 0
                const icon = ICON_BY_VIEW[item.id]
                const color = VIEW_ACCENTS[item.id]

                const button = (
                  <button
                    type="button"
                    onClick={() => onSelectView(item.id)}
                    className={cn(
                      'sidebar-nav-item group relative flex w-full items-center gap-2.5 rounded-md text-[13px] transition',
                      isMobile
                        ? 'min-h-11 px-2.5 py-2.5'
                        : 'px-2 py-1.5',
                      collapsed && 'justify-center px-0',
                      isActive
                        ? 'bg-zinc-100 font-semibold text-zinc-900'
                        : 'cursor-pointer text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900',
                    )}
                  >
                    {isActive ? (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-zinc-900"
                      />
                    ) : null}
                    <span
                      aria-hidden
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md [&_svg]:h-4 [&_svg]:w-4',
                        isActive ? color.iconActive : color.icon,
                      )}
                    >
                      {icon}
                    </span>
                    {!collapsed ? (
                      <>
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-left',
                            isActive && color.labelActive,
                          )}
                        >
                          {item.label}
                        </span>
                        {showStockBadges ? (
                          <span className="flex shrink-0 gap-1">
                            {ruptureCount > 0 ? (
                              <Badge tone="danger">{ruptureCount}</Badge>
                            ) : null}
                            {lowStockCount > 0 ? (
                              <Badge tone="warning">{lowStockCount}</Badge>
                            ) : null}
                          </span>
                        ) : showOnlineOrdersBadge ? (
                          <Badge tone="success">{onlineOrdersPending}</Badge>
                        ) : badgeCount > 0 ? (
                          <Badge tone="warning">{badgeCount}</Badge>
                        ) : null}
                      </>
                    ) : null}
                  </button>
                )

                return (
                  <li key={item.id}>
                    {collapsed && !isMobile ? (
                      <Tooltip content={item.label} side="right">
                        {button}
                      </Tooltip>
                    ) : (
                      button
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-100 p-2">
        {/* Store selector */}
        {stores.length > 0 && !collapsed ? (
          <div className="relative mb-2">
            <button
              type="button"
              disabled={!canSwitchStore || stores.length <= 1}
              onClick={() => setStoreMenuOpen((v) => !v)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-left text-[12px] transition',
                canSwitchStore && stores.length > 1
                  ? 'hover:bg-zinc-100'
                  : 'cursor-default opacity-90',
              )}
            >
              <IconStore className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">
                {activeStore?.name ?? '—'}
              </span>
              {canSwitchStore && stores.length > 1 ? (
                <IconChevronDown className="h-3 w-3 shrink-0 text-emerald-500" />
              ) : null}
            </button>
            {storeMenuOpen && canSwitchStore ? (
              <ul className="absolute bottom-full left-0 right-0 z-10 mb-1 max-h-56 overflow-y-auto rounded-md border border-zinc-200 bg-white p-1 shadow-(--shadow-pop)">
                {stores.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onActiveStoreChange(s.id)
                        setStoreMenuOpen(false)
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-[12px] text-left',
                        s.id === activeStoreId
                          ? 'bg-zinc-100 font-semibold text-zinc-900'
                          : 'text-zinc-700 hover:bg-zinc-50',
                      )}
                    >
                      {s.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* User block */}
        <div className="space-y-1.5">
          <div
            className={cn(
              'flex items-center gap-2 rounded-md p-2',
              collapsed ? 'justify-center' : 'bg-zinc-50',
            )}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-bold text-white">
              {user.initials}
            </span>
            {!collapsed ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-zinc-900">
                  {user.displayName}
                </p>
                <p className="truncate text-[10px] text-zinc-500">
                  {roleLabel(user.role)}
                </p>
              </div>
            ) : null}
            {!collapsed ? (
              <Tooltip content="Changer de profil" side="top">
                <button
                  type="button"
                  onClick={onLogout}
                  className="ui-icon-btn inline-flex h-9 w-9 items-center justify-center rounded p-1 text-rose-500 transition hover:bg-rose-50 hover:text-rose-700"
                  aria-label="Se déconnecter"
                >
                  <IconLogout className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            ) : null}
          </div>
        </div>

        {/* Collapse toggle (desktop only) */}
        {!isMobile && onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-medium text-indigo-600 transition hover:bg-indigo-50 hover:text-indigo-800"
            aria-label={collapsed ? 'Étendre la barre' : 'Réduire la barre'}
          >
            {collapsed ? (
              <IconExpand className="h-3.5 w-3.5" />
            ) : (
              <>
                <IconCollapse className="h-3.5 w-3.5" />
                <span>Réduire</span>
              </>
            )}
          </button>
        ) : null}
      </div>
    </>
  )
}

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  onSelectView,
  ...rest
}: DesktopProps) {
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-svh shrink-0 flex-col border-r border-border bg-white/92 backdrop-blur-sm lg:flex',
        collapsed ? 'w-[68px]' : 'w-[244px]',
      )}
    >
      <SidebarBody
        {...rest}
        onSelectView={onSelectView}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        variant="desktop"
      />
    </aside>
  )
}

export function MobileNavDrawer({
  open,
  onClose,
  onSelectView,
  ...rest
}: MobileProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-90 flex lg:hidden" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Fermer le menu"
        onClick={onClose}
        className="absolute inset-0 animate-ui-fade-in bg-zinc-950/40 backdrop-blur-[2px]"
      />
      <aside className="relative z-10 flex h-svh w-[min(280px,85vw)] max-w-[85vw] animate-ui-slide-up flex-col border-r border-border bg-white/95 pt-[env(safe-area-inset-top,0px)] pr-0 pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] shadow-(--shadow-overlay) backdrop-blur-md">
        <button
          type="button"
          onClick={onClose}
          className="ui-icon-btn absolute right-2 top-2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-md text-rose-500 transition hover:bg-rose-50 hover:text-rose-700"
          aria-label="Fermer"
        >
          <IconClose className="h-5 w-5" />
        </button>
        <SidebarBody
          {...rest}
          onSelectView={(id) => {
            onSelectView(id)
            onClose()
          }}
          collapsed={false}
          variant="mobile"
        />
      </aside>
    </div>
  )
}
