import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { effectivePermissions } from './auth/permissions'
import { cn } from './ui/cn'
import { clearStaffSession } from './auth/session'
import type { StaffProfile } from './auth/types'
import { AddProductModal } from './components/AddProductModal'
import {
  CheckoutComplianceModal,
  type CheckoutComplianceResult,
} from './components/CheckoutComplianceModal'
import { CartPanel } from './components/CartPanel'
import { ManagerOverrideModal } from './components/ManagerOverrideModal'
import { CaisseHeader } from './components/CaisseHeader'
import { OfflineBanner } from './components/OfflineBanner'
import { ReceiptModal } from './components/ReceiptModal'
import { ProductGrid, type ProductGridDensity } from './components/ProductGrid'
import { AppChromeHeader, Topbar } from './components/Topbar'
import { DashboardNavGrid } from './components/DashboardNavGrid'
import { useActiveStore } from './context/ActiveStoreContext'
import { useSubscription } from './context/SubscriptionContext'
import {
  filterNavSections,
  flattenedNavViewIds,
  navSectionsForRole,
  type NavViewId,
} from './navigation'
import { domainAllowsView, type BusinessDomain } from './lib/businessDomain'
import { categoryTabsForDomain } from './lib/domainCatalog'
import {
  db,
  ensureAllStoreStockRows,
  syncProductCategoriesFromProducts,
} from './db/db'
import type {
  CartLine,
  OnlineOrder,
  Product,
  ProductWithStock,
  Sale,
  TicketInvoice,
  DiningTableStatus,
} from './db/types'
import {
  confirmCheckoutSummary,
  defaultCheckoutPayment,
  validateCheckoutPayment,
  type CheckoutPaymentState,
} from './lib/checkoutPayment'
import { DEFAULT_VAT_RATE_PCT, formatFCFA, totalsFromLinesTTC } from './lib/money'
import { productImageSrc } from './lib/productImage'
import { appendAuditEvent } from './lib/auditLog'
import { getQuickSaleFavoriteIds } from './lib/posFavorites'
import { logCartCancellation } from './lib/refundApply'
import { SESSION_ID, getOrCreateTerminalId } from './lib/session'
import {
  cleanupStaleTerminalNodes,
  touchTerminalSyncTimestamp,
  upsertTerminalPresence,
} from './lib/terminalSync'
import { useBarcodeScannerWedge } from './hooks/useBarcodeScannerWedge'
import { storeStockRowId } from './lib/storeStockId'
import { assertBarcodeAvailable } from './lib/productBarcode'
import { deductKitchenIngredientStockForLines } from './lib/kitchenStock'
import { deductTrackedStockForLine } from './lib/productTracking'
import { qtyStepForProduct, roundQty } from './lib/saleUnit'
import {
  applyCustomerCreditSale,
  customerCreditAvailable,
} from './lib/customerCredit'
import { fetchFiscalSettings } from './lib/fiscal/api'
import { issueFneForSale } from './lib/fiscal/fneInvoice'
import {
  APP_SETTINGS_CHANGED_EVENT,
  getAppSettings,
} from './lib/appSettings'
import {
  formatLastSyncRelative,
  getLastSyncTimestamp,
} from './lib/syncMeta'
import { saleLocalYmd } from './lib/salesStats'
import { useStorefrontAutoSync } from './hooks/useStorefrontAutoSync'
import { enqueueProductSync, enqueueStockSync, flushSyncQueue } from './lib/sync'
import {
  getDeviceConnectivityDemo,
  getKitchenStationDemo,
  isKitchenModuleDemoOn,
} from './lib/integrationsConfig'
import { Button } from './ui/Button'
import { useToast } from './ui/Toast'
import { IconArrowRight, IconReceipt, IconShield } from './ui/icons'

type Props = {
  staff: StaffProfile
  online: boolean
  onLogout: () => void
}

type FlyToCartAnim = {
  id: number
  src: string
  x: number
  y: number
  dx: number
  dy: number
  active: boolean
}

function tableStatusLabel(status: DiningTableStatus): string {
  if (status === 'free') return 'libre'
  if (status === 'occupied') return 'occupée'
  if (status === 'reserved') return 'réservée'
  return 'nettoyage'
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

const CatalogueView = lazy(() =>
  import('./views/CatalogueView').then((m) => ({ default: m.CatalogueView })),
)
const StocksView = lazy(() =>
  import('./views/StocksView').then((m) => ({ default: m.StocksView })),
)
const ComptabiliteView = lazy(() =>
  import('./views/ComptabiliteView').then((m) => ({
    default: m.ComptabiliteView,
  })),
)
const RhManagementView = lazy(() =>
  import('./views/RhManagementView').then((m) => ({
    default: m.RhManagementView,
  })),
)
const CrmView = lazy(() =>
  import('./views/CrmView').then((m) => ({ default: m.CrmView })),
)
const SegmentationView = lazy(() =>
  import('./views/SegmentationView').then((m) => ({
    default: m.SegmentationView,
  })),
)
const WhatsAppView = lazy(() =>
  import('./views/WhatsAppView').then((m) => ({ default: m.WhatsAppView })),
)
const MarketingView = lazy(() =>
  import('./views/MarketingView').then((m) => ({ default: m.MarketingView })),
)
const TablesManagementView = lazy(() =>
  import('./views/TablesManagementView').then((m) => ({
    default: m.TablesManagementView,
  })),
)
const PromotionsView = lazy(() =>
  import('./views/PromotionsView').then((m) => ({
    default: m.PromotionsView,
  })),
)
const LoyaltyProgramView = lazy(() =>
  import('./views/LoyaltyProgramView').then((m) => ({
    default: m.LoyaltyProgramView,
  })),
)
const KitchenView = lazy(() =>
  import('./views/KitchenView').then((m) => ({ default: m.KitchenView })),
)
const TicketsFacturesView = lazy(() =>
  import('./views/TicketsFacturesView').then((m) => ({
    default: m.TicketsFacturesView,
  })),
)
const OnlineOrdersValidationView = lazy(() =>
  import('./views/OnlineOrdersValidationView').then((m) => ({
    default: m.OnlineOrdersValidationView,
  })),
)
const JournalReportView = lazy(() =>
  import('./views/JournalReportView').then((m) => ({
    default: m.JournalReportView,
  })),
)
const PersonnelView = lazy(() =>
  import('./views/PersonnelView').then((m) => ({ default: m.PersonnelView })),
)
const VendeusesView = lazy(() =>
  import('./views/VendeusesView').then((m) => ({ default: m.VendeusesView })),
)
const PointageView = lazy(() =>
  import('./views/PointageView').then((m) => ({ default: m.PointageView })),
)
const AnalytiqueView = lazy(() =>
  import('./views/AnalytiqueView').then((m) => ({ default: m.AnalytiqueView })),
)
const ReportingView = lazy(() =>
  import('./views/ReportingView').then((m) => ({ default: m.ReportingView })),
)
const ControleInterneView = lazy(() =>
  import('./views/ControleInterneView').then((m) => ({
    default: m.ControleInterneView,
  })),
)
const EvolutiviteView = lazy(() =>
  import('./views/EvolutiviteView').then((m) => ({
    default: m.EvolutiviteView,
  })),
)
const RentabiliteView = lazy(() =>
  import('./views/RentabiliteView').then((m) => ({ default: m.RentabiliteView })),
)
const IntegrationsView = lazy(() =>
  import('./views/IntegrationsView').then((m) => ({
    default: m.IntegrationsView,
  })),
)
const MultiStoreView = lazy(() =>
  import('./views/MultiStoreView').then((m) => ({ default: m.MultiStoreView })),
)
const ParametresView = lazy(() =>
  import('./views/ParametresView').then((m) => ({
    default: m.ParametresView,
  })),
)
const AchatsView = lazy(() =>
  import('./views/AchatsView').then((m) => ({ default: m.AchatsView })),
)
const DevisView = lazy(() =>
  import('./views/DevisView').then((m) => ({ default: m.DevisView })),
)
const SavView = lazy(() =>
  import('./views/SavView').then((m) => ({ default: m.SavView })),
)
const CreditsView = lazy(() =>
  import('./views/CreditsView').then((m) => ({ default: m.CreditsView })),
)
const InventairePhysiqueView = lazy(() =>
  import('./views/InventairePhysiqueView').then((m) => ({
    default: m.InventairePhysiqueView,
  })),
)
const PeremptionsView = lazy(() =>
  import('./views/PeremptionsView').then((m) => ({ default: m.PeremptionsView })),
)
const LivraisonsView = lazy(() =>
  import('./views/LivraisonsView').then((m) => ({ default: m.LivraisonsView })),
)
const LocationView = lazy(() =>
  import('./views/LocationView').then((m) => ({ default: m.LocationView })),
)
const CarteView = lazy(() =>
  import('./views/CarteView').then((m) => ({ default: m.CarteView })),
)
const CadeauxView = lazy(() =>
  import('./views/CadeauxView').then((m) => ({ default: m.CadeauxView })),
)
const RdvView = lazy(() =>
  import('./views/RdvView').then((m) => ({ default: m.RdvView })),
)
const TarifsView = lazy(() =>
  import('./views/TarifsView').then((m) => ({ default: m.TarifsView })),
)
const RetoursFournisseurView = lazy(() =>
  import('./views/RetoursFournisseurView').then((m) => ({
    default: m.RetoursFournisseurView,
  })),
)
const ProductionView = lazy(() =>
  import('./views/ProductionView').then((m) => ({ default: m.ProductionView })),
)
const BlView = lazy(() =>
  import('./views/BlView').then((m) => ({ default: m.BlView })),
)
const DepensesView = lazy(() =>
  import('./views/DepensesView').then((m) => ({ default: m.DepensesView })),
)
const RetoursClientView = lazy(() =>
  import('./views/RetoursClientView').then((m) => ({
    default: m.RetoursClientView,
  })),
)
const ConsignesView = lazy(() =>
  import('./views/ConsignesView').then((m) => ({ default: m.ConsignesView })),
)
const OrdonnancesView = lazy(() =>
  import('./views/OrdonnancesView').then((m) => ({ default: m.OrdonnancesView })),
)
const ChantiersView = lazy(() =>
  import('./views/ChantiersView').then((m) => ({ default: m.ChantiersView })),
)
const AbonnementsView = lazy(() =>
  import('./views/AbonnementsView').then((m) => ({ default: m.AbonnementsView })),
)
const HaccpView = lazy(() =>
  import('./views/HaccpView').then((m) => ({ default: m.HaccpView })),
)
const VipView = lazy(() =>
  import('./views/VipView').then((m) => ({ default: m.VipView })),
)
const CommissionsView = lazy(() =>
  import('./views/CommissionsView').then((m) => ({ default: m.CommissionsView })),
)
const MisesDeCoteView = lazy(() =>
  import('./views/MisesDeCoteView').then((m) => ({ default: m.MisesDeCoteView })),
)
const PertesView = lazy(() =>
  import('./views/PertesView').then((m) => ({ default: m.PertesView })),
)
const AllergenesView = lazy(() =>
  import('./views/AllergenesView').then((m) => ({ default: m.AllergenesView })),
)
const EvenementsView = lazy(() =>
  import('./views/EvenementsView').then((m) => ({ default: m.EvenementsView })),
)
const ReprisesView = lazy(() =>
  import('./views/ReprisesView').then((m) => ({ default: m.ReprisesView })),
)
const ProtocolesView = lazy(() =>
  import('./views/ProtocolesView').then((m) => ({ default: m.ProtocolesView })),
)
const CaveView = lazy(() =>
  import('./views/CaveView').then((m) => ({ default: m.CaveView })),
)
const MagistralesView = lazy(() =>
  import('./views/MagistralesView').then((m) => ({ default: m.MagistralesView })),
)

export function Shell({ staff, online, onLogout }: Props) {
  const {
    displayProducts,
    activeStoreId,
    activeStore,
    stores,
    setActiveStoreId,
    canSwitchStore,
  } = useActiveStore()

  const toast = useToast()
  const { canAccessView, organization, subscription } = useSubscription()
  useStorefrontAutoSync()

  const perms = useMemo(() => effectivePermissions(staff), [staff])
  const [businessDomain, setBusinessDomain] = useState<BusinessDomain>(
    () => getAppSettings().businessDomain,
  )
  const navSections = useMemo(() => {
    const roleSections = navSectionsForRole(staff.role)
    const planFiltered = filterNavSections(roleSections, canAccessView)
    const domainFiltered = filterNavSections(planFiltered, (view) =>
      domainAllowsView(businessDomain, view),
    )
    if (perms.canConfigureAppSettings) return domainFiltered
    return domainFiltered
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => item.id !== 'parametres'),
      }))
      .filter((section) => section.items.length > 0)
  }, [
    staff.role,
    canAccessView,
    perms.canConfigureAppSettings,
    businessDomain,
  ])
  const allowedViews = useMemo(() => {
    return flattenedNavViewIds(navSections)
  }, [navSections])

  useEffect(() => {
    const syncAppSettings = () => {
      const settings = getAppSettings()
      setProductGridDensity(settings.productGridDensity)
      setBlockSaleWhenOutOfStock(settings.blockSaleWhenOutOfStock)
      setAutoPrintReceiptAfterSale(settings.autoPrintReceiptAfterSale)
      setBusinessDomain(settings.businessDomain)
    }
    window.addEventListener(APP_SETTINGS_CHANGED_EVENT, syncAppSettings)
    return () => window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, syncAppSettings)
  }, [])

  const [addProductOpen, setAddProductOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [category, setCategory] = useState<string>('Tous')
  const [productGridDensity, setProductGridDensity] = useState<ProductGridDensity>(
    () => getAppSettings().productGridDensity,
  )
  const [blockSaleWhenOutOfStock, setBlockSaleWhenOutOfStock] = useState(
    () => getAppSettings().blockSaleWhenOutOfStock,
  )
  const [, setAutoPrintReceiptAfterSale] = useState(
    () => getAppSettings().autoPrintReceiptAfterSale,
  )
  const [fneEnabled, setFneEnabled] = useState(false)
  const [fneNif, setFneNif] = useState<string | null>(null)
  const [fneRegime, setFneRegime] = useState('REEL')

  useEffect(() => {
    let cancelled = false
    const apply = (settings: {
      fneEnabled?: boolean
      taxId?: string | null
      fiscalRegime?: string
    }) => {
      if (cancelled) return
      setFneEnabled(Boolean(settings.fneEnabled))
      setFneNif(settings.taxId ?? null)
      setFneRegime(settings.fiscalRegime || 'REEL')
    }
    void fetchFiscalSettings().then((settings) => {
      if (settings) apply(settings)
    })
    const onFiscal = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | {
            fneEnabled?: boolean
            taxId?: string | null
            fiscalRegime?: string
          }
        | undefined
      if (detail) apply(detail)
    }
    window.addEventListener('nora-fiscal-settings-changed', onFiscal)
    return () => {
      cancelled = true
      window.removeEventListener('nora-fiscal-settings-changed', onFiscal)
    }
  }, [])

  const [cart, setCart] = useState<CartLine[]>([])
  const [discountPct, setDiscountPct] = useState(0)
  const [discountOverrideActive, setDiscountOverrideActive] = useState(false)
  const [pendingDiscountOverride, setPendingDiscountOverride] = useState<
    number | null
  >(null)
  const [promoInput, setPromoInput] = useState('')
  const [promoFeedback, setPromoFeedback] = useState<string | null>(null)
  const [appliedPromotionId, setAppliedPromotionId] = useState<string | null>(null)
  const [selectedTableId, setSelectedTableId] = useState('')
  const [loyaltyPhoneInput, setLoyaltyPhoneInput] = useState('')
  const [loyaltyRedeemInput, setLoyaltyRedeemInput] = useState('')
  const [checkoutPayment, setCheckoutPayment] = useState<CheckoutPaymentState>(
    () => defaultCheckoutPayment(),
  )
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checkoutComplianceOpen, setCheckoutComplianceOpen] = useState(false)
  const [activeView, setActiveView] = useState<NavViewId>(() => 'dash')
  const [isFloatingCartOpen, setIsFloatingCartOpen] = useState(false)
  const [mobileCartPulse, setMobileCartPulse] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState<
    | { type: 'sale'; sale: Sale; autoPrint: boolean }
    | { type: 'onlineOrder'; order: OnlineOrder; autoPrint: boolean }
    | { type: 'ticketInvoice'; ticketInvoice: TicketInvoice; autoPrint: boolean }
    | null
  >(null)
  const [syncMetaTick, setSyncMetaTick] = useState(0)
  const [syncBusy, setSyncBusy] = useState(false)
  const [pendingLeaveCartUntil, setPendingLeaveCartUntil] = useState(0)
  const [pendingCancelCartUntil, setPendingCancelCartUntil] = useState(0)
  const [, setPendingCashDrawerBypassUntil] = useState(0)
  const [, setPendingCheckoutUntil] = useState(0)
  const [deviceConnectivity, setDeviceConnectivity] = useState(() =>
    getDeviceConnectivityDemo(),
  )

  const barcodeFieldRef = useRef<HTMLInputElement>(null)
  const sidebarCartCountRef = useRef<HTMLSpanElement>(null)
  const drawerCartCountRef = useRef<HTMLSpanElement>(null)
  const mobileFabBadgeRef = useRef<HTMLSpanElement>(null)
  const mobileFabEmptyRef = useRef<HTMLButtonElement>(null)
  const flyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevCartItemCountRef = useRef(0)
  const [, setFlyToCart] = useState<FlyToCartAnim | null>(null)

  const queueItems = useLiveQuery(() => db.syncQueue.toArray(), [], []) ?? []
  const productCategoryRows =
    useLiveQuery(
      () => db.productCategories.orderBy('sortOrder').toArray(),
      [],
      [],
    ) ?? []
  const categoryTabs = useMemo<string[]>(() => {
    return categoryTabsForDomain(
      businessDomain,
      productCategoryRows.map((r) => r.name),
    )
  }, [businessDomain, productCategoryRows])

  useEffect(() => {
    if (categoryTabs.length === 0) return
    if (!categoryTabs.includes(category)) {
      setCategory('Tous')
    }
  }, [categoryTabs, category])

  const onlineOrdersPending =
    useLiveQuery(
      () => db.onlineOrders.where('status').equals('pending').count(),
      [],
      0,
    ) ?? 0
  const diningTables =
    useLiveQuery(
      () =>
        db.diningTables.where('storeId').equals(activeStoreId).sortBy('sortOrder'),
      [activeStoreId],
      [],
    ) ?? []
  const promotions = useLiveQuery(() => db.promotions.toArray(), [], []) ?? []
  const dayClosureToday = useLiveQuery(
    () => db.dayClosures.get(saleLocalYmd(Date.now())),
    [],
    undefined,
  )
  const loyaltyCustomers =
    useLiveQuery(() => db.loyaltyCustomers.toArray(), [], []) ?? []

  useEffect(() => {
    if (!selectedTableId) return
    if (!diningTables.some((t) => t.id === selectedTableId)) {
      setSelectedTableId('')
    }
  }, [diningTables, selectedTableId])

  const refreshSyncMeta = useCallback(() => {
    setSyncMetaTick((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!online) return
    void flushSyncQueue().then((r) => {
      if (r.mode === 'cloud' || r.mode === 'local') {
        refreshSyncMeta()
      }
      if (r.mode === 'failed' && r.error) {
        console.warn('[Sync]', r.error)
      }
    })
  }, [online, refreshSyncMeta])

  useEffect(() => {
    let disposed = false
    const tick = async () => {
      if (disposed) return
      await upsertTerminalPresence({
        storeId: activeStoreId,
        storeName: activeStore?.name,
        profileId: staff.id,
        profileDisplayName: staff.displayName,
      })
      await cleanupStaleTerminalNodes()
    }
    void tick()
    const id = window.setInterval(() => {
      void tick()
    }, 15_000)
    return () => {
      disposed = true
      window.clearInterval(id)
    }
  }, [activeStoreId, activeStore?.name, staff.id, staff.displayName])

  useEffect(() => {
    if (online) return
    setCheckoutPayment((p) => {
      if (p.mixed) {
        return { ...p, mixed: false, method: 'cash' }
      }
      if (p.method !== 'cash') {
        return { ...p, method: 'cash' }
      }
      return p
    })
  }, [online])

  useEffect(() => {
    if (cart.length === 0) return
    setCheckoutPayment((p) => {
      if (p.mixed || p.method !== 'cash') return p
      if (p.cashReceived.trim() !== '') return p
      const t = Math.round(totalsFromLinesTTC(cart, discountPct).totalTTC)
      return { ...p, cashReceived: String(t) }
    })
  }, [cart, discountPct])

  useEffect(() => {
    if (activeView !== 'caisse' && isFloatingCartOpen) {
      setIsFloatingCartOpen(false)
    }
  }, [activeView, isFloatingCartOpen])

  useEffect(() => {
    return () => {
      if (flyTimeoutRef.current) {
        clearTimeout(flyTimeoutRef.current)
      }
    }
  }, [])

  const patchCheckoutPayment = useCallback(
    (patch: Partial<CheckoutPaymentState>) => {
      setCheckoutPayment((prev) => ({ ...prev, ...patch }))
    },
    [],
  )

  useEffect(() => {
    if (activeView === 'dash') return
    if (!allowedViews.has(activeView)) {
      setActiveView('dash')
    }
  }, [activeView, allowedViews])

  useEffect(() => {
    setDeviceConnectivity(getDeviceConnectivityDemo())
  }, [activeView])

  useEffect(() => {
    if (discountOverrideActive) return
    setDiscountPct((d) => Math.min(d, perms.maxDiscountPct))
  }, [perms.maxDiscountPct, discountOverrideActive])

  const handleApplyManualDiscount = useCallback(
    (pct: number) => {
      const max = perms.maxDiscountPct
      const next = Math.max(0, Math.min(100, pct))
      if (next === 0) {
        setDiscountPct(0)
        setDiscountOverrideActive(false)
        setAppliedPromotionId(null)
        setPromoFeedback(null)
        return
      }
      if (next <= max) {
        setDiscountPct(next)
        setDiscountOverrideActive(false)
        setAppliedPromotionId(null)
        setPromoFeedback(`Remise manuelle ${next} %`)
        return
      }
      setPendingDiscountOverride(next)
    },
    [perms.maxDiscountPct],
  )

  const handleRequestDiscountOverride = useCallback((pct: number) => {
    const next = Math.max(0, Math.min(100, pct))
    if (next <= 0) return
    setPendingDiscountOverride(next)
  }, [])

  const handleDiscountOverrideVerified = useCallback(
    (manager: {
      profileId: string
      displayName: string
      role: string
    }) => {
      const pct = pendingDiscountOverride
      setPendingDiscountOverride(null)
      if (pct == null || pct <= 0) return
      const prevPct = discountPct
      setDiscountPct(pct)
      setDiscountOverrideActive(true)
      setAppliedPromotionId(null)
      setPromoFeedback(
        `Remise ${pct} % autorisée par ${manager.displayName}`,
      )
      void appendAuditEvent({
        kind: 'discount_override',
        actor: { profileId: staff.id, displayName: staff.displayName },
        reason: `Remise ${pct} % (plafond ${perms.maxDiscountPct} %) — validée par ${manager.displayName}`,
        payload: {
          requestedPct: pct,
          appliedPct: pct,
          previousPct: prevPct,
          maxDiscountPct: perms.maxDiscountPct,
          managerProfileId: manager.profileId,
          managerDisplayName: manager.displayName,
          managerRole: manager.role,
        },
      })
    },
    [
      pendingDiscountOverride,
      discountPct,
      staff.id,
      staff.displayName,
      perms.maxDiscountPct,
    ],
  )

  const lowStockCount = useMemo(
    () =>
      displayProducts.filter(
        (p) => p.stock > 0 && p.stock <= p.lowStockThreshold,
      ).length,
    [displayProducts],
  )

  const ruptureCount = useMemo(
    () => displayProducts.filter((p) => p.stock <= 0).length,
    [displayProducts],
  )
  const cartItemCount = useMemo(
    () => cart.reduce((sum, line) => sum + line.qty, 0),
    [cart],
  )

  const canLeaveCaisseWithCart = useCallback(
    (targetView: NavViewId) => {
      if (activeView !== 'caisse') return true
      if (targetView === 'caisse') return true
      if (cartItemCount === 0) return true
      const now = new Date().getTime()
      if (now > pendingLeaveCartUntil) {
        setPendingLeaveCartUntil(now + 7000)
        toast.warning(
          'Panier en cours',
          'Cliquez encore pour quitter la caisse sans encaisser (7s).',
        )
        return false
      }
      return true
    },
    [activeView, cartItemCount, pendingLeaveCartUntil, toast],
  )

  const handleSelectView = useCallback(
    (targetView: NavViewId) => {
      if (!canLeaveCaisseWithCart(targetView)) return
      setActiveView(targetView)
    },
    [canLeaveCaisseWithCart],
  )

  useEffect(() => {
    if (cartItemCount === 0) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [cartItemCount])

  useEffect(() => {
    const prev = prevCartItemCountRef.current
    if (cartItemCount > prev) {
      setMobileCartPulse(true)
    }
    if (prev > 0 && cartItemCount === 0 && isFloatingCartOpen) {
      setIsFloatingCartOpen(false)
    }
    prevCartItemCountRef.current = cartItemCount
  }, [cartItemCount, isFloatingCartOpen])

  useEffect(() => {
    if (!mobileCartPulse) return
    const pulseTimer = window.setTimeout(() => setMobileCartPulse(false), 520)
    return () => window.clearTimeout(pulseTimer)
  }, [mobileCartPulse])

  const cartTotalTTC = useMemo(
    () => Math.round(totalsFromLinesTTC(cart, discountPct).totalTTC),
    [cart, discountPct],
  )
  const activeLoyaltyCustomer = useMemo(() => {
    const phone = normalizePhone(loyaltyPhoneInput)
    if (!phone) return null
    return loyaltyCustomers.find((c) => c.phone === phone) ?? null
  }, [loyaltyCustomers, loyaltyPhoneInput])
  const loyaltyRedeemPoints = useMemo(() => {
    const raw = Number.parseInt(loyaltyRedeemInput.trim() || '0', 10)
    if (!Number.isFinite(raw) || raw <= 0) return 0
    const maxByWallet = activeLoyaltyCustomer?.points ?? 0
    return Math.max(0, Math.min(raw, maxByWallet))
  }, [loyaltyRedeemInput, activeLoyaltyCustomer?.points])
  const loyaltyRedeemAmountTTC = useMemo(() => {
    const gross = Math.round(totalsFromLinesTTC(cart, discountPct).totalTTC)
    const byPoints = loyaltyRedeemPoints * 10
    return Math.max(0, Math.min(byPoints, gross))
  }, [cart, discountPct, loyaltyRedeemPoints])
  const payableTotalTTC = useMemo(() => {
    const gross = Math.round(totalsFromLinesTTC(cart, discountPct).totalTTC)
    return Math.max(0, gross - loyaltyRedeemAmountTTC)
  }, [cart, discountPct, loyaltyRedeemAmountTTC])
  const creditAvailableTTC = useMemo(() => {
    if (!activeLoyaltyCustomer) return 0
    return customerCreditAvailable(activeLoyaltyCustomer)
  }, [activeLoyaltyCustomer])

  const syncLabel = useMemo(() => {
    const pending = queueItems.length
    const last = formatLastSyncRelative(getLastSyncTimestamp())
    if (online) {
      const base =
        pending === 0
          ? 'En ligne · File vide'
          : `En ligne · ${pending} à envoyer`
      return `${base} · Dernier envoi : ${last}`
    }
    return `Hors ligne · ${pending} en file · Dernier envoi : ${last}`
  }, [online, queueItems.length, syncMetaTick])

  const handleSyncNow = useCallback(async () => {
    if (!online) return
    setSyncBusy(true)
    try {
      const r = await flushSyncQueue()
      if (r.mode === 'cloud' || r.mode === 'local') {
        refreshSyncMeta()
        await touchTerminalSyncTimestamp()
        toast.success('Synchronisation terminée')
      }
      if (r.mode === 'failed' && r.error) {
        toast.error('Synchronisation échouée', r.error)
      }
    } finally {
      setSyncBusy(false)
    }
  }, [online, refreshSyncMeta, toast])

  const refocusBarcodeField = useCallback(() => {
    requestAnimationFrame(() => barcodeFieldRef.current?.focus())
  }, [])

  const pickFlyCartTargetEl = useCallback((): HTMLElement | null => {
    if (isFloatingCartOpen) {
      const d = drawerCartCountRef.current
      if (d && d.getClientRects().length > 0) return d
    }
    const s = sidebarCartCountRef.current
    if (s && s.getClientRects().length > 0) return s
    const b = mobileFabBadgeRef.current
    if (b && b.getClientRects().length > 0) return b
    const f = mobileFabEmptyRef.current
    if (f && f.getClientRects().length > 0) return f
    return null
  }, [isFloatingCartOpen])

  const triggerFlyToCart = useCallback(
    (product: ProductWithStock, originEl?: HTMLElement | null) => {
      const target = pickFlyCartTargetEl()
      if (!originEl || !target) return
      const from = originEl.getBoundingClientRect()
      const to = target.getBoundingClientRect()
      const fromX = from.left + from.width / 2
      const fromY = from.top + from.height / 2
      const toX = to.left + to.width / 2
      const toY = to.top + to.height / 2

      const animId = Date.now()
      setFlyToCart({
        id: animId,
        src: productImageSrc(product),
        x: fromX,
        y: fromY,
        dx: toX - fromX,
        dy: toY - fromY,
        active: false,
      })

      requestAnimationFrame(() => {
        setFlyToCart((prev) =>
          prev && prev.id === animId ? { ...prev, active: true } : prev,
        )
      })

      if (flyTimeoutRef.current) {
        clearTimeout(flyTimeoutRef.current)
      }
      flyTimeoutRef.current = setTimeout(() => {
        setFlyToCart((prev) => (prev && prev.id === animId ? null : prev))
        flyTimeoutRef.current = null
      }, 620)
    },
    [pickFlyCartTargetEl],
  )

  const handleAdd = useCallback(
    (
      p: ProductWithStock,
      originEl?: HTMLElement | null,
      variant?: { id: string; label: string; priceTTC?: number },
    ) => {
      if (p.archived) return
      const vat = p.vatRatePct ?? DEFAULT_VAT_RATE_PCT
      const step = qtyStepForProduct(p)
      const unitPrice = variant?.priceTTC ?? p.priceTTC
      const lineName = variant ? `${p.name} · ${variant.label}` : p.name
      let didAdd = false
      setCart((prev) => {
        const line = prev.find(
          (l) =>
            l.productId === p.id &&
            (l.variantId ?? undefined) === (variant?.id ?? undefined),
        )
        const currentQty = line?.qty ?? 0
        const nextQty = roundQty(currentQty + step, step)
        if (blockSaleWhenOutOfStock && nextQty > p.stock + 1e-9) return prev
        if (!line) {
          didAdd = true
          return [
            ...prev,
            {
              productId: p.id,
              name: lineName,
              unitPriceTTC: unitPrice,
              qty: step,
              vatRatePct: vat,
              ...(variant
                ? { variantId: variant.id, variantLabel: variant.label }
                : {}),
            },
          ]
        }
        didAdd = true
        return prev.map((l) =>
          l.productId === p.id &&
          (l.variantId ?? undefined) === (variant?.id ?? undefined)
            ? {
                ...l,
                qty: nextQty,
                unitPriceTTC: unitPrice,
                name: lineName,
                vatRatePct: vat,
              }
            : l,
        )
      })
      if (didAdd) {
        triggerFlyToCart(p, originEl)
      }
    },
    [triggerFlyToCart, blockSaleWhenOutOfStock],
  )

  const handleAddFromGrid = useCallback(
    (p: ProductWithStock, originEl?: HTMLElement | null) => {
      handleAdd(p, originEl)
      refocusBarcodeField()
    },
    [handleAdd, refocusBarcodeField],
  )

  useEffect(() => {
    if (activeView !== 'caisse') return
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      const n = Number.parseInt(e.key, 10)
      if (!Number.isFinite(n) || n < 1 || n > 9) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) {
        return
      }
      const favId = getQuickSaleFavoriteIds()[n - 1]
      if (!favId) return
      const product = displayProducts.find((p) => p.id === favId)
      if (!product) return
      e.preventDefault()
      handleAddFromGrid(product)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeView, displayProducts, handleAddFromGrid])

  const handleInc = useCallback(
    (productId: string) => {
      setCart((prev) => {
        const prod = displayProducts.find((x) => x.id === productId)
        if (!prod) return prev
        const step = qtyStepForProduct(prod)
        return prev.map((l) => {
          if (l.productId !== productId) return l
          const nextQty = roundQty(l.qty + step, step)
          if (blockSaleWhenOutOfStock && nextQty > prod.stock + 1e-9) return l
          return {
            ...l,
            qty: nextQty,
            unitPriceTTC: prod.priceTTC,
            name: prod.name,
            vatRatePct: prod.vatRatePct ?? DEFAULT_VAT_RATE_PCT,
          }
        })
      })
    },
    [displayProducts, blockSaleWhenOutOfStock],
  )

  const handleDec = useCallback(
    (productId: string) => {
      setCart((prev) => {
        const prod = displayProducts.find((x) => x.id === productId)
        const step = qtyStepForProduct(prod)
        return prev
          .map((l) =>
            l.productId === productId
              ? { ...l, qty: roundQty(l.qty - step, step) }
              : l,
          )
          .filter((l) => l.qty > 1e-9)
      })
    },
    [displayProducts],
  )

  const handleSetQty = useCallback(
    (productId: string, qty: number) => {
      setCart((prev) => {
        const prod = displayProducts.find((x) => x.id === productId)
        if (!prod) return prev
        const step = qtyStepForProduct(prod)
        let next = roundQty(Math.max(0, qty), step)
        if (blockSaleWhenOutOfStock && next > prod.stock + 1e-9) {
          next = roundQty(prod.stock, step)
        }
        if (next <= 1e-9) {
          return prev.filter((l) => l.productId !== productId)
        }
        return prev.map((l) =>
          l.productId === productId
            ? {
                ...l,
                qty: next,
                unitPriceTTC: prod.priceTTC,
                name: prod.name,
                vatRatePct: prod.vatRatePct ?? DEFAULT_VAT_RATE_PCT,
              }
            : l,
        )
      })
    },
    [displayProducts, blockSaleWhenOutOfStock],
  )

  const handleRemove = useCallback((productId: string) => {
    setCart((prev) => prev.filter((l) => l.productId !== productId))
  }, [])

  const handleClear = useCallback(() => {
    setCart([])
    setDiscountPct(0)
    setDiscountOverrideActive(false)
    setPendingDiscountOverride(null)
    setPromoInput('')
    setPromoFeedback(null)
    setAppliedPromotionId(null)
    setLoyaltyRedeemInput('')
    setLoyaltyPhoneInput('')
    setCheckoutPayment(defaultCheckoutPayment())
  }, [])

  const handleCancelCartTransaction = useCallback(async () => {
    if (cart.length === 0) return
    const now = new Date().getTime()
    if (now > pendingCancelCartUntil) {
      setPendingCancelCartUntil(now + 7000)
      toast.warning(
        'Confirmer annulation',
        'Cliquez encore sur annuler transaction dans les 7 secondes.',
      )
      return
    }
    const reason = ''
    try {
      await logCartCancellation({
        actor: {
          profileId: staff.id,
          displayName: staff.displayName,
        },
        reason: reason.trim(),
        cartSnapshot: {
          lines: cart.map((l) => ({
            productId: l.productId,
            name: l.name,
            qty: l.qty,
            unitPriceTTC: l.unitPriceTTC,
          })),
          discountPct,
        },
      })
      toast.info('Transaction annulée', 'Consignée dans le journal d’audit')
      setPendingCancelCartUntil(0)
    } catch (e) {
      toast.error(
        'Échec de l’annulation',
        e instanceof Error ? e.message : String(e),
      )
      return
    }
    handleClear()
  }, [cart, discountPct, staff.displayName, staff.id, handleClear, pendingCancelCartUntil, toast])

  const handleApplyPromo = useCallback(() => {
    const c = promoInput.trim().toUpperCase()
    const max = perms.maxDiscountPct
    const prevPct = discountPct
    const totalTTC = Math.round(totalsFromLinesTTC(cart, discountPct).totalTTC)
    const apply = (requestedPct: number, promotionId?: string) => {
      if (max <= 0) {
        setDiscountPct(0)
        setAppliedPromotionId(null)
        setPromoFeedback('Aucune remise autorisée pour ce profil')
        void appendAuditEvent({
          kind: 'promo_applied',
          actor: { profileId: staff.id, displayName: staff.displayName },
          reason: `Code ${c} refusé (remise non autorisée pour le profil)`,
          payload: {
            code: c,
            requestedPct,
            appliedPct: 0,
            previousPct: prevPct,
            maxDiscountPct: max,
          },
        })
        return
      }
      const applied = Math.min(requestedPct, max)
      setDiscountPct(applied)
      setAppliedPromotionId(promotionId ?? null)
      setPromoFeedback(
        applied < requestedPct
          ? `Remise plafonnée à ${max} % (profil)`
          : `Remise ${applied} % appliquée`,
      )
      void appendAuditEvent({
        kind: 'promo_applied',
        actor: { profileId: staff.id, displayName: staff.displayName },
        reason:
          applied < requestedPct
            ? `Code ${c} — remise ${applied} % (plafond profil ${max} %)`
            : `Code ${c} — remise ${applied} % appliquée`,
        payload: {
          code: c,
          requestedPct,
          appliedPct: applied,
          previousPct: prevPct,
          maxDiscountPct: max,
        },
      })
    }
    const now = Date.now()
    const promo = promotions.find((p) => p.code.toUpperCase() === c)
    if (!promo) {
      setAppliedPromotionId(null)
      setPromoFeedback('Code promo non reconnu')
      return
    }
    if (!promo.active) {
      setAppliedPromotionId(null)
      setPromoFeedback('Promotion inactive')
      return
    }
    if (promo.storeId && promo.storeId !== activeStoreId) {
      setAppliedPromotionId(null)
      setPromoFeedback('Code non valable pour ce magasin')
      return
    }
    if (promo.startAt != null && now < promo.startAt) {
      setAppliedPromotionId(null)
      setPromoFeedback('Promotion pas encore active')
      return
    }
    if (promo.endAt != null && now > promo.endAt) {
      setAppliedPromotionId(null)
      setPromoFeedback('Promotion expirée')
      return
    }
    if (promo.maxUsage != null && promo.usageCount >= promo.maxUsage) {
      setAppliedPromotionId(null)
      setPromoFeedback('Limite d’utilisation atteinte')
      return
    }
    if (promo.minCartTTC != null && totalTTC < promo.minCartTTC) {
      setAppliedPromotionId(null)
      setPromoFeedback(`Panier minimum requis: ${formatFCFA(promo.minCartTTC)}`)
      return
    }
    apply(promo.discountPct, promo.id)
  }, [
    promoInput,
    perms.maxDiscountPct,
    discountPct,
    staff.displayName,
    staff.id,
    promotions,
    activeStoreId,
    cart,
  ])

  const processScannedBarcode = useCallback(
    (raw: string) => {
      const code = raw.trim()
      if (!code) return
      void (async () => {
        const variant = await db.productVariants
          .where('barcode')
          .equals(code)
          .first()
        if (variant && variant.active) {
          const p = displayProducts.find((x) => x.id === variant.productId)
          if (p) {
            handleAdd(p, null, {
              id: variant.id,
              label: variant.label,
              priceTTC: variant.priceTTC,
            })
            setBarcodeInput('')
            refocusBarcodeField()
            return
          }
        }
        const p = displayProducts.find((x) => x.barcode === code)
        if (p) {
          handleAdd(p)
        } else {
          setSearch(code)
        }
        setBarcodeInput('')
        refocusBarcodeField()
      })()
    },
    [displayProducts, handleAdd, refocusBarcodeField],
  )

  const handleBarcodeSubmit = useCallback(() => {
    processScannedBarcode(barcodeInput)
  }, [barcodeInput, processScannedBarcode])

  const wedgeEnabled =
    activeView === 'caisse' &&
    !receiptOpen &&
    !addProductOpen &&
    !checkoutComplianceOpen

  useBarcodeScannerWedge(wedgeEnabled, processScannedBarcode)

  useEffect(() => {
    if (!wedgeEnabled) return
    const id = requestAnimationFrame(() => barcodeFieldRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [wedgeEnabled])

  const handleSaveNewProduct = useCallback(
    async (product: Product, initialStock: number) => {
      await assertBarcodeAvailable(product.barcode)
      await db.products.add(product)
      await ensureAllStoreStockRows()
      await db.storeStocks.put({
        id: storeStockRowId(activeStoreId, product.id),
        storeId: activeStoreId,
        productId: product.id,
        stock: initialStock,
      })
      await syncProductCategoriesFromProducts()
      await enqueueProductSync({
        action: 'upsert',
        productId: product.id,
        product,
      })
      await enqueueStockSync({
        productId: product.id,
        stock: initialStock,
        lowStockThreshold: product.lowStockThreshold,
        storeId: activeStoreId,
      })
    },
    [activeStoreId],
  )

  const cartNeedsCompliance = useMemo(() => {
    const map = new Map(displayProducts.map((p) => [p.id, p]))
    return cart.some((line) => {
      const p = map.get(line.productId)
      return (
        !!p?.requiresPrescription || !!p?.trackLots || !!p?.trackSerialNumbers
      )
    })
  }, [cart, displayProducts])

  const executeCheckout = useCallback(
    async (compliance?: CheckoutComplianceResult) => {
      if (cart.length === 0) return
      const now = new Date()
      const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const dayClosure = await db.dayClosures.get(todayYmd)
      if (dayClosure?.closedAt) {
        toast.error(
          'Journée clôturée',
          'Réouvrez la journée dans le journal de caisse pour encaisser à nouveau.',
        )
        return
      }

      const totals = totalsFromLinesTTC(cart, discountPct)
      const totalR = payableTotalTTC
      const canPayElectronicNow = online && deviceConnectivity.paymentTerminals
      const payCheck = validateCheckoutPayment(
        checkoutPayment,
        totalR,
        canPayElectronicNow,
      )
      if (!payCheck.ok) {
        toast.error('Paiement incomplet', payCheck.message)
        return
      }

      const payMethod = checkoutPayment.mixed
        ? 'mixed'
        : checkoutPayment.method
      if (payMethod === 'credit') {
        if (!activeLoyaltyCustomer) {
          toast.error(
            'Crédit client',
            'Saisissez le téléphone d’un client fidélité avec plafond crédit.',
          )
          return
        }
        if (customerCreditAvailable(activeLoyaltyCustomer) < totalR) {
          toast.error(
            'Plafond insuffisant',
            `Disponible : ${formatFCFA(customerCreditAvailable(activeLoyaltyCustomer))}.`,
          )
          return
        }
      }

      const metaByProduct = new Map(
        (compliance?.lineMeta ?? []).map((m) => [m.productId, m]),
      )

      const saleId = crypto.randomUUID()
      const createdAt = Date.now()
      const storeName = activeStore?.name
      const selectedTable = selectedTableId
        ? diningTables.find((t) => t.id === selectedTableId)
        : null
      const kitchenEnabled = isKitchenModuleDemoOn()

      setCheckoutBusy(true)
      try {
        const saleRecord: Sale = {
          id: saleId,
          createdAt,
          lines: cart.map((l) => {
            const meta = metaByProduct.get(l.productId)
            return {
              productId: l.productId,
              name: l.name,
              unitPriceTTC: l.unitPriceTTC,
              qty: l.qty,
              vatRatePct: l.vatRatePct,
              lotAllocations: meta?.lotAllocations,
              serialNumbers: meta?.serialNumbers,
              imeiNumbers: meta?.imeiNumbers,
              variantId: l.variantId,
              variantLabel: l.variantLabel,
            }
          }),
          subtotalHT: totals.subtotalHT,
          tva: totals.tva,
          totalTTC: totals.totalTTC,
          discountPct,
          paymentMethod: checkoutPayment.mixed ? 'mixed' : checkoutPayment.method,
          paymentSplit: payCheck.split,
          cashReceived: payCheck.cashReceived,
          changeDue: payCheck.changeDue,
          cardTpeReference: payCheck.cardTpeReference,
          mobileMoneyReference: payCheck.mobileMoneyReference,
          synced: false,
          storeId: activeStoreId,
          storeName,
          tableId: selectedTable?.id,
          tableName: selectedTable?.name,
          cashierProfileId: staff.id,
          cashierDisplayName: staff.displayName,
          promoCode:
            appliedPromotionId != null
              ? promotions.find((p) => p.id === appliedPromotionId)?.code
              : undefined,
          loyaltyCustomerId: activeLoyaltyCustomer?.id,
          loyaltyCustomerPhone: activeLoyaltyCustomer?.phone,
          loyaltyPointsEarned: Math.floor(totalR / 100),
          loyaltyPointsRedeemed: loyaltyRedeemPoints,
          loyaltyDiscountTTC: loyaltyRedeemAmountTTC,
        }

        const saleWithFne = await issueFneForSale(saleRecord, {
          enabled: fneEnabled,
          nif: fneNif,
          regime: fneRegime,
        })

        await db.transaction(
          'rw',
          [
            db.products,
            db.sales,
            db.syncQueue,
            db.storeStocks,
            db.productLots,
            db.productSerialUnits,
            db.productVariants,
            db.variantStoreStocks,
            db.prescriptions,
            db.promotions,
            db.diningTables,
            db.onlineOrders,
            db.kitchenIngredients,
            db.kitchenIngredientStocks,
            db.productRecipeIngredients,
            db.loyaltyCustomers,
            db.loyaltyTransactions,
            db.customerCreditEntries,
          ],
          async () => {
            for (const line of cart) {
              const p = await db.products.get(line.productId)
              if (!p || p.archived) {
                throw new Error(
                  `Article « ${line.name} » indisponible (archivé ou supprimé).`,
                )
              }
              const lineMeta = {
                ...(metaByProduct.get(line.productId) ?? {
                  productId: line.productId,
                }),
                productId: line.productId,
                variantId:
                  line.variantId ??
                  metaByProduct.get(line.productId)?.variantId,
              }
              const mode = await deductTrackedStockForLine({
                storeId: activeStoreId,
                line,
                meta: lineMeta,
                saleId,
                createdAt,
              })
              if (mode === 'classic') {
                const rid = storeStockRowId(activeStoreId, line.productId)
                const row = await db.storeStocks.get(rid)
                const cur = row?.stock ?? 0
                if (cur < line.qty) {
                  throw new Error(
                    `Stock insuffisant pour « ${line.name} » (disponible : ${cur}).`,
                  )
                }
                await db.storeStocks.put({
                  id: rid,
                  storeId: activeStoreId,
                  productId: line.productId,
                  stock: cur - line.qty,
                })
              }
            }

            const recipeRows = await db.productRecipeIngredients.toArray()
            await deductKitchenIngredientStockForLines(
              activeStoreId,
              cart,
              recipeRows,
            )

            await db.sales.add(saleWithFne)

            if (payMethod === 'credit' && activeLoyaltyCustomer) {
              await applyCustomerCreditSale({
                customerId: activeLoyaltyCustomer.id,
                amountTTC: totalR,
                saleId,
                storeId: activeStoreId,
                actor: {
                  profileId: staff.id,
                  displayName: staff.displayName,
                },
              })
            }

            if (compliance?.prescription) {
              await db.prescriptions.add({
                id: crypto.randomUUID(),
                saleId,
                storeId: activeStoreId,
                createdAt,
                createdByProfileId: staff.id,
                ...compliance.prescription,
              })
            }

            if (kitchenEnabled) {
            const table = selectedTableId
              ? await db.diningTables.get(selectedTableId)
              : null
            const tableLabel = table?.name
              ? `Table ${table.name}`
              : 'Vente caisse'
            const kitchenOrderId = crypto.randomUUID()
            await db.onlineOrders.put({
              id: kitchenOrderId,
              createdAt,
              storeId: activeStoreId,
              storeName,
              customerName: tableLabel,
              customerNote: `Commande sur place · Encaissement ${saleId.slice(0, 8).toUpperCase()}`,
              paymentMethod: saleRecord.paymentMethod,
              lines: saleRecord.lines,
              subtotalHT: saleRecord.subtotalHT,
              tva: saleRecord.tva,
              totalTTC: saleRecord.totalTTC,
              discountPct: saleRecord.discountPct || undefined,
              promoCode: saleRecord.promoCode,
              fulfillmentMode: 'pickup',
              status: 'approved',
              sourcePlatform: 'native',
              externalOrderRef: `onsite-${saleId.slice(0, 8).toUpperCase()}`,
              reviewedAt: createdAt,
              reviewedByProfileId: staff.id,
              reviewedByDisplayName: staff.displayName,
              kitchenStatus: 'queued',
              kitchenPriority: 'normal',
              kitchenStation: getKitchenStationDemo(),
              kitchenTicketCode: `K-${kitchenOrderId.slice(0, 6).toUpperCase()}`,
              kitchenUpdatedAt: createdAt,
              stockDeductedAt: createdAt,
              kitchenIngredientDeductedAt: createdAt,
            })
          }

          if (appliedPromotionId) {
            const promo = await db.promotions.get(appliedPromotionId)
            if (promo) {
              await db.promotions.update(appliedPromotionId, {
                usageCount: (promo.usageCount ?? 0) + 1,
                updatedAt: Date.now(),
              })
            }
          }

          if (selectedTableId) {
            const table = await db.diningTables.get(selectedTableId)
            if (table) {
              await db.diningTables.update(selectedTableId, {
                status: 'occupied',
                occupiedSince: table.occupiedSince ?? Date.now(),
              })
            }
          }

          const cleanPhone = normalizePhone(loyaltyPhoneInput)
          if (cleanPhone) {
            const earnPts = Math.floor(totalR / 100)
            const existing =
              activeLoyaltyCustomer ??
              (await db.loyaltyCustomers.where('phone').equals(cleanPhone).first())
            const customerId = existing?.id ?? crypto.randomUUID()
            const nextPoints =
              (existing?.points ?? 0) + earnPts - loyaltyRedeemPoints
            await db.loyaltyCustomers.put({
              id: customerId,
              phone: cleanPhone,
              displayName: existing?.displayName,
              points: Math.max(0, nextPoints),
              totalSpentTTC: (existing?.totalSpentTTC ?? 0) + totalR,
              visitCount: (existing?.visitCount ?? 0) + 1,
              createdAt: existing?.createdAt ?? Date.now(),
              updatedAt: Date.now(),
            })
            if (earnPts > 0) {
              await db.loyaltyTransactions.add({
                id: crypto.randomUUID(),
                customerId,
                saleId,
                createdAt: Date.now(),
                type: 'earn',
                points: earnPts,
                amountTTC: totalR,
                actorProfileId: staff.id,
              })
            }
            if (loyaltyRedeemPoints > 0) {
              await db.loyaltyTransactions.add({
                id: crypto.randomUUID(),
                customerId,
                saleId,
                createdAt: Date.now(),
                type: 'redeem',
                points: -loyaltyRedeemPoints,
                amountTTC: loyaltyRedeemAmountTTC,
                actorProfileId: staff.id,
              })
            }
          }

          await db.syncQueue.add({
            kind: 'sale',
            payload: JSON.stringify({
              type: 'sale_created',
              schemaVersion: 1,
              terminalId: getOrCreateTerminalId(),
              saleId,
              sale: saleWithFne,
            }),
            createdAt: Date.now(),
          })
        },
      )

      setReceiptOpen({
        type: 'sale',
        sale: saleWithFne,
        // Impression dès validation dès que le module imprimantes tickets est actif.
        autoPrint: deviceConnectivity.receiptPrinters,
      })
      if (!deviceConnectivity.receiptPrinters) {
        toast.info(
          'Imprimante ticket désactivée',
          'Activez « Imprimantes tickets » dans Paramètres → Périphériques.',
        )
      }
      setCart([])
      setDiscountPct(0)
      setDiscountOverrideActive(false)
      setPendingDiscountOverride(null)
      setPromoInput('')
      setPromoFeedback(null)
      setAppliedPromotionId(null)
      setLoyaltyRedeemInput('')
      setLoyaltyPhoneInput('')
      setBarcodeInput('')
      setCheckoutPayment(defaultCheckoutPayment())
      toast.success(
        saleWithFne.fne?.invoiceNumber
          ? `Vente · ${saleWithFne.fne.invoiceNumber}`
          : 'Vente enregistrée',
        `${formatFCFA(totals.totalTTC)} encaissés`,
      )
      setPendingCashDrawerBypassUntil(0)
      setPendingCheckoutUntil(0)

      if (online) {
        const r = await flushSyncQueue()
        if (r.mode === 'cloud' || r.mode === 'local') {
          refreshSyncMeta()
          await touchTerminalSyncTimestamp()
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Encaissement impossible', msg)
    } finally {
      setCheckoutBusy(false)
    }
    },
    [
      cart,
      discountPct,
      checkoutPayment,
      online,
      staff,
      refreshSyncMeta,
      activeStoreId,
      activeStore?.name,
      deviceConnectivity.receiptPrinters,
      deviceConnectivity.paymentTerminals,
      toast,
      appliedPromotionId,
      selectedTableId,
      diningTables,
      payableTotalTTC,
      promotions,
      activeLoyaltyCustomer,
      loyaltyPhoneInput,
      loyaltyRedeemAmountTTC,
      loyaltyRedeemPoints,
      fneEnabled,
      fneNif,
      fneRegime,
    ],
  )

  const handleCheckout = useCallback(async () => {
    if (cart.length === 0) return
    if (discountPct > perms.maxDiscountPct && !discountOverrideActive) {
      toast.error(
        'Remise non autorisée',
        `Plafond de ${perms.maxDiscountPct} % pour ce profil.`,
      )
      return
    }
    const totalR = payableTotalTTC
    const canPayElectronicNow = online && deviceConnectivity.paymentTerminals
    const payCheck = validateCheckoutPayment(
      checkoutPayment,
      totalR,
      canPayElectronicNow,
    )
    if (!payCheck.ok) {
      toast.error('Paiement incomplet', payCheck.message)
      return
    }
    if (payCheck.split.cash > 0 && !deviceConnectivity.cashDrawer) {
      toast.warning(
        'Tiroir-caisse désactivé',
        'Encaissement poursuivi en un clic.',
      )
    }
    toast.info(
      'Encaissement en cours',
      confirmCheckoutSummary(checkoutPayment, payCheck, totalR),
    )
    if (checkoutBusy) return
    if (cartNeedsCompliance) {
      setCheckoutComplianceOpen(true)
      return
    }
    await executeCheckout()
  }, [
    cart.length,
    discountPct,
    discountOverrideActive,
    perms.maxDiscountPct,
    payableTotalTTC,
    online,
    deviceConnectivity.paymentTerminals,
    deviceConnectivity.cashDrawer,
    checkoutPayment,
    checkoutBusy,
    cartNeedsCompliance,
    executeCheckout,
    toast,
  ])

  const handleComplianceConfirm = useCallback(
    (result: CheckoutComplianceResult) => {
      setCheckoutComplianceOpen(false)
      void executeCheckout(result)
    },
    [executeCheckout],
  )

  const handleLogoutClick = useCallback(() => {
    clearStaffSession()
    onLogout()
  }, [onLogout])

  const isDash = activeView === 'dash'
  const isCaisse = activeView === 'caisse'
  const canAddProductFromCaisse =
    staff.role !== 'caissier' && perms.canManageCatalogFull
  const cartHideClass = 'lg:hidden'
  const cartDesktopClass = 'hidden h-full min-h-0 lg:flex lg:flex-col'

  return (
    <div className="caisse-shell flex h-svh max-h-svh w-full max-w-full flex-col overflow-hidden bg-zinc-50">
      <div className="flex min-h-0 min-w-0 flex-1">
      {receiptOpen ? (
        <ReceiptModal
          source={
            receiptOpen.type === 'sale'
              ? { kind: 'sale', sale: receiptOpen.sale }
              : receiptOpen.type === 'onlineOrder'
                ? { kind: 'onlineOrder', order: receiptOpen.order }
                : { kind: 'ticketInvoice', ticketInvoice: receiptOpen.ticketInvoice }
          }
          autoPrint={receiptOpen.autoPrint}
          onClose={() => setReceiptOpen(null)}
        />
      ) : null}
      {addProductOpen ? (
        <AddProductModal
          activeStoreLabel={activeStore?.name ?? 'Magasin'}
          onClose={() => setAddProductOpen(false)}
          onSave={handleSaveNewProduct}
        />
      ) : null}
      {checkoutComplianceOpen ? (
        <CheckoutComplianceModal
          cart={cart}
          products={displayProducts}
          storeId={activeStoreId}
          onClose={() => setCheckoutComplianceOpen(false)}
          onConfirm={handleComplianceConfirm}
        />
      ) : null}
      {pendingDiscountOverride != null ? (
        <ManagerOverrideModal
          subtitle={`Autoriser une remise de ${pendingDiscountOverride} % (plafond profil : ${perms.maxDiscountPct} %).`}
          confirmLabel="Autoriser la remise"
          onCancel={() => setPendingDiscountOverride(null)}
          onVerified={handleDiscountOverrideVerified}
        />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
        <Topbar
          view={activeView}
          onOpenModules={() => handleSelectView('dash')}
          navSections={navSections}
          onSelectView={handleSelectView}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AppChromeHeader
          online={online}
          syncLabel={syncLabel}
          syncBusy={syncBusy}
          onSyncNow={handleSyncNow}
          onLogout={handleLogoutClick}
          stores={stores}
          activeStoreId={activeStoreId}
          onActiveStoreChange={setActiveStoreId}
          canSwitchStore={canSwitchStore}
          productGridDensity={isCaisse ? productGridDensity : undefined}
          onProductGridDensityChange={
            isCaisse ? setProductGridDensity : undefined
          }
        />
        {!online ? <OfflineBanner /> : null}

        {isCaisse ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
            <main className="caisse-main ui-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain app-main-pad pb-safe-caisse pt-3 sm:px-4 sm:pt-4 lg:pb-6 xl:px-6 xl:pt-5">
              <CaisseHeader
                ref={barcodeFieldRef}
                sessionId={SESSION_ID}
                activeStoreLabel={activeStore?.name ?? 'Magasin'}
                barcode={barcodeInput}
                onBarcodeChange={setBarcodeInput}
                onBarcodeSubmit={handleBarcodeSubmit}
                search={search}
                onSearchChange={setSearch}
                onAddProduct={
                  canAddProductFromCaisse
                    ? () => setAddProductOpen(true)
                    : undefined
                }
              />
              {ruptureCount > 0 ? (
                <div
                  className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm shadow-[0_12px_28px_-22px_rgba(23,32,51,0.28)] ${
                    perms.canManageStocks
                      ? 'border-rose-200/80 bg-[linear-gradient(135deg,#fff7f7,#f7f8fc)] text-rose-900'
                      : 'border-amber-200/80 bg-[linear-gradient(135deg,#fffbeb,#f7f8fc)] text-amber-900'
                  }`}
                  role="alert"
                >
                  <span className="inline-flex items-center gap-2">
                    <IconShield className="h-4 w-4 text-rose-600" />
                    <span>
                      <strong>{ruptureCount}</strong> article
                      {ruptureCount > 1 ? 's' : ''} en{' '}
                      <strong>rupture de stock</strong>
                      {!perms.canManageStocks
                        ? ' — prévenir un responsable.'
                        : ''}
                    </span>
                  </span>
                  {perms.canManageStocks ? (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleSelectView('stocks')}
                    >
                      Gérer les stocks
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <ProductGrid
                products={displayProducts}
                categoryTabs={categoryTabs}
                category={category}
                onCategoryChange={setCategory}
                search={search}
                onAdd={handleAddFromGrid}
                density={productGridDensity}
              />
            </main>
            <div className={`${cartDesktopClass} min-h-0 min-w-0`}>
              <CartPanel
                lines={cart}
                products={displayProducts}
                discountPct={discountPct}
                maxDiscountPct={perms.maxDiscountPct}
                promoInput={promoInput}
                onPromoInputChange={setPromoInput}
                onApplyPromo={handleApplyPromo}
                promoFeedback={promoFeedback}
                onApplyManualDiscount={handleApplyManualDiscount}
                onRequestDiscountOverride={handleRequestDiscountOverride}
                tableOptions={diningTables.map((t) => ({
                  id: t.id,
                  name: t.name,
                  status: tableStatusLabel(t.status),
                  statusCode: t.status,
                }))}
                selectedTableId={selectedTableId}
                onSelectedTableIdChange={setSelectedTableId}
                loyaltyPhone={loyaltyPhoneInput}
                onLoyaltyPhoneChange={setLoyaltyPhoneInput}
                loyaltyPointsAvailable={activeLoyaltyCustomer?.points ?? 0}
                loyaltyRedeemPoints={loyaltyRedeemInput}
                onLoyaltyRedeemPointsChange={setLoyaltyRedeemInput}
                loyaltyRedeemAmountTTC={loyaltyRedeemAmountTTC}
                payableTotalTTC={payableTotalTTC}
                creditAvailableTTC={creditAvailableTTC}
                payment={checkoutPayment}
                onPaymentPatch={patchCheckoutPayment}
                online={online}
                canPayElectronic={online && deviceConnectivity.paymentTerminals}
                receiptPrinterEnabled={deviceConnectivity.receiptPrinters}
                onInc={handleInc}
                onDec={handleDec}
                onSetQty={handleSetQty}
                onRemove={handleRemove}
                onClear={handleClear}
                onCancelTransaction={handleCancelCartTransaction}
                onCheckout={handleCheckout}
                checkoutBusy={checkoutBusy}
                countBadgeRef={sidebarCartCountRef}
                dayClosed={!!dayClosureToday?.closedAt}
              />
            </div>
          </div>
        ) : (
          <div className="module-canvas ui-scroll app-main-pad min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-safe pt-3 sm:pt-4">
            <div className="mx-auto w-full max-w-[1680px] px-1 sm:px-2 lg:px-4">
            <Suspense
              fallback={
                <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-ink-subtle">
                  <span className="h-9 w-9 animate-spin rounded-full border-2 border-caisse-gold/25 border-t-caisse-gold" />
                  Chargement du module…
                </div>
              }
            >
              {isDash ? (
                <DashboardNavGrid
                  sections={navSections}
                  onSelectView={handleSelectView}
                  ruptureCount={ruptureCount}
                  lowStockCount={lowStockCount}
                  onlineOrdersPending={onlineOrdersPending}
                  staffName={staff.displayName}
                  storeName={activeStore?.name ?? 'Magasin'}
                  storeId={activeStoreId}
                  online={online}
                  dayClosed={!!dayClosureToday?.closedAt}
                />
              ) : null}
              {activeView === 'catalogue' ? (
                <CatalogueView
                  canManageCatalog={perms.canManageCatalogFull}
                  canEditPrices={perms.canEditPrices}
                  density={productGridDensity}
                  auditActor={{
                    profileId: staff.id,
                    displayName: staff.displayName,
                  }}
                  onSaveNewProduct={handleSaveNewProduct}
                />
              ) : null}
              {activeView === 'stocks' ? (
                <StocksView
                  isAdmin={perms.canManageStocks}
                  auditActor={{
                    profileId: staff.id,
                    displayName: staff.displayName,
                  }}
                />
              ) : null}
              {activeView === 'comptabilite' ? (
                <ComptabiliteView canManageCompta={perms.canDailyClosure} />
              ) : null}
              {activeView === 'rh' ? (
                <RhManagementView
                  actor={{ id: staff.id, displayName: staff.displayName }}
                  canReview={staff.role === 'admin' || staff.role === 'gerant'}
                />
              ) : null}
              {activeView === 'crm' ? (
                <CrmView actor={{ id: staff.id, displayName: staff.displayName }} />
              ) : null}
              {activeView === 'segmentation' ? <SegmentationView /> : null}
              {activeView === 'whatsapp' ? (
                <WhatsAppView
                  canManage={
                    staff.role === 'admin' || staff.role === 'gerant'
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'marketing' ? (
                <MarketingView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canEditPrices
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'tables' ? (
                <TablesManagementView
                  activeStoreId={activeStoreId}
                  activeStoreLabel={activeStore?.name ?? 'Magasin'}
                  canManageTables={perms.canManageStocks || staff.role === 'caissier'}
                />
              ) : null}
              {activeView === 'promotions' ? (
                <PromotionsView
                  activeStoreId={activeStoreId}
                  canManagePromotions={perms.canEditPrices}
                />
              ) : null}
              {activeView === 'loyalty' ? (
                <LoyaltyProgramView canManageLoyalty={perms.canEditPrices} />
              ) : null}
              {activeView === 'kitchen' ? (
                <KitchenView
                  activeStoreId={activeStoreId}
                  canManageKitchenActions={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    staff.role === 'cuisinier'
                  }
                />
              ) : null}
              {activeView === 'ticketsFactures' ? (
                <TicketsFacturesView
                  activeStoreId={activeStoreId}
                  activeStoreLabel={activeStore?.name ?? 'Magasin'}
                  actor={{ id: staff.id, displayName: staff.displayName }}
                  canViewAllDocuments={staff.role === 'admin' || staff.role === 'gerant'}
                  onViewReceipt={(ticketInvoice) =>
                    setReceiptOpen({
                      type: 'ticketInvoice',
                      ticketInvoice,
                      autoPrint: false,
                    })
                  }
                  onPrintReceipt={(ticketInvoice) =>
                    {
                      setReceiptOpen({
                        type: 'ticketInvoice',
                        ticketInvoice,
                        autoPrint: true,
                      })
                    }
                  }
                />
              ) : null}
              {activeView === 'devis' ? (
                <DevisView
                  canManage={perms.canEditPrices || staff.role === 'gerant'}
                  actor={{ id: staff.id, displayName: staff.displayName }}
                  onLoadToCart={(lines, meta) => {
                    setCart(
                      lines.map((l) => ({
                        productId: l.productId,
                        name: l.name,
                        unitPriceTTC: l.unitPriceTTC,
                        qty: l.qty,
                        vatRatePct: l.vatRatePct ?? DEFAULT_VAT_RATE_PCT,
                      })),
                    )
                    if (meta.customerPhone) {
                      setLoyaltyPhoneInput(meta.customerPhone)
                    }
                    setActiveView('caisse')
                    toast.success(
                      'Devis chargé',
                      `${meta.customerName} · panier prêt`,
                    )
                  }}
                />
              ) : null}
              {activeView === 'achats' ? (
                <AchatsView
                  canManage={perms.canManageStocks}
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'sav' ? (
                <SavView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canManageStocks
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'credits' ? (
                <CreditsView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canEditPrices
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'inventairePhysique' ? (
                <InventairePhysiqueView
                  canManage={perms.canManageStocks}
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'peremptions' ? (
                <PeremptionsView
                  canManage={perms.canManageStocks}
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'livraisons' ? (
                <LivraisonsView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canManageStocks
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'location' ? (
                <LocationView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canManageStocks
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'carte' ? (
                <CarteView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canEditPrices
                  }
                />
              ) : null}
              {activeView === 'cadeaux' ? (
                <CadeauxView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canEditPrices
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'rdv' ? (
                <RdvView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canEditPrices
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'tarifs' ? (
                <TarifsView canManage={perms.canEditPrices} />
              ) : null}
              {activeView === 'retoursFournisseur' ? (
                <RetoursFournisseurView
                  canManage={perms.canManageStocks}
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'production' ? (
                <ProductionView
                  canManage={perms.canManageStocks}
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'bl' ? (
                <BlView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canEditPrices
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'depenses' ? (
                <DepensesView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canDailyClosure
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'retoursClient' ? (
                <RetoursClientView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canManageStocks
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'consignes' ? (
                <ConsignesView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canEditPrices
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'ordonnances' ? (
                <OrdonnancesView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canEditPrices
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'chantiers' ? (
                <ChantiersView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canEditPrices
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'abonnements' ? (
                <AbonnementsView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canEditPrices
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'haccp' ? (
                <HaccpView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canManageStocks
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'vip' ? (
                <VipView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canEditPrices
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'commissions' ? (
                <CommissionsView
                  canManage={staff.role === 'admin' || staff.role === 'gerant'}
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'misesDeCote' ? (
                <MisesDeCoteView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canEditPrices
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'pertes' ? (
                <PertesView
                  canManage={perms.canManageStocks}
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'allergenes' ? (
                <AllergenesView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canEditPrices
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'evenements' ? (
                <EvenementsView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canEditPrices
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'reprises' ? (
                <ReprisesView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canEditPrices
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'protocoles' ? (
                <ProtocolesView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canEditPrices
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'cave' ? (
                <CaveView
                  canManage={perms.canManageStocks}
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'magistrales' ? (
                <MagistralesView
                  canManage={
                    staff.role === 'admin' ||
                    staff.role === 'gerant' ||
                    perms.canManageStocks
                  }
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'onlineOrders' ? (
                <OnlineOrdersValidationView
                  online={online}
                  activeStoreId={activeStoreId}
                  activeStoreLabel={activeStore?.name ?? 'Magasin'}
                  canSwitchStore={canSwitchStore}
                  canValidateOnlineOrders={
                    staff.role === 'gerant' ||
                    staff.role === 'admin' ||
                    staff.role === 'caissier'
                  }
                  reviewer={{
                    id: staff.id,
                    displayName: staff.displayName,
                  }}
                  onPrintOrder={(order, autoPrint = false) =>
                    setReceiptOpen({ type: 'onlineOrder', order, autoPrint })
                  }
                />
              ) : null}
              {activeView === 'journal' ? (
                <JournalReportView
                  canDailyClosure={perms.canDailyClosure}
                  canReopenDay={staff.role === 'admin'}
                  canProcessRefunds={perms.canProcessRefunds}
                  currentProfile={{
                    id: staff.id,
                    displayName: staff.displayName,
                  }}
                  currentRole={staff.role}
                  onViewReceipt={(sale) =>
                    setReceiptOpen({ type: 'sale', sale, autoPrint: false })
                  }
                  onLoadExchangeToCart={(lines) => {
                    setCart(lines)
                    setDiscountPct(0)
                    setDiscountOverrideActive(false)
                    setActiveView('caisse')
                    toast.success(
                      'Échange → caisse',
                      'Contrepartie chargée — encaisser le solde',
                    )
                  }}
                />
              ) : null}
              {activeView === 'personnel' ? (
                <PersonnelView currentProfileId={staff.id} />
              ) : null}
              {activeView === 'vendeuses' ? (
                <VendeusesView
                  canManage={
                    staff.role === 'admin' || staff.role === 'gerant'
                  }
                  canManageRights={perms.canManagePersonnel}
                  actor={{ id: staff.id, displayName: staff.displayName }}
                />
              ) : null}
              {activeView === 'pointage' ? (
                <PointageView
                  staff={staff}
                  activeStoreId={activeStoreId}
                  activeStoreLabel={activeStore?.name ?? 'Magasin'}
                  canViewTeamPointage={perms.canViewTeamPointage}
                />
              ) : null}
              {activeView === 'analytique' ? <AnalytiqueView /> : null}
              {activeView === 'rentabilite' ? <RentabiliteView /> : null}
              {activeView === 'reporting' ? <ReportingView /> : null}
              {activeView === 'controleInterne' ? (
                <ControleInterneView />
              ) : null}
              {activeView === 'evolutivite' ? (
                <EvolutiviteView
                  canConfigureStores={perms.canConfigureStoresAdmin}
                  maxStores={
                    subscription?.plan?.maxStores ??
                    (subscription?.planId === 'starter'
                      ? 1
                      : subscription?.planId === 'pro'
                        ? 3
                        : 0)
                  }
                  auditActor={{
                    profileId: staff.id,
                    displayName: staff.displayName,
                  }}
                  onOpenNetwork={() => handleSelectView('network')}
                />
              ) : null}
              {activeView === 'integrations' ? <IntegrationsView /> : null}
              {activeView === 'parametres' ? (
                <ParametresView
                  activeStoreId={activeStoreId}
                  activeStoreName={activeStore?.name ?? 'Magasin'}
                  canManageIntegrations={perms.canManageIntegrations}
                  canResetData={staff.role === 'admin'}
                  organizationName={organization?.name ?? ''}
                  onOpenIntegrations={() => handleSelectView('integrations')}
                />
              ) : null}
              {activeView === 'network' ? (
                <MultiStoreView
                  canConfigureStores={perms.canConfigureStoresAdmin}
                  canCreateTransfers={perms.canManageStocks}
                  profileId={staff.id}
                  maxStores={
                    subscription?.plan?.maxStores ??
                    (subscription?.planId === 'starter'
                      ? 1
                      : subscription?.planId === 'pro'
                        ? 3
                        : 0)
                  }
                  auditActor={{
                    profileId: staff.id,
                    displayName: staff.displayName,
                  }}
                />
              ) : null}
            </Suspense>
            </div>
          </div>
        )}

        {isCaisse ? (
          <>
            {/* Barre flottante panier (mobile / tablette) */}
            {!isFloatingCartOpen && cartItemCount > 0 ? (
              <button
                type="button"
                onClick={() => setIsFloatingCartOpen(true)}
                className={cn(
                  'caisse-mobile-cart fixed z-30 flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-ink backdrop-blur-md transition hover:brightness-[1.02] sm:px-4 sm:py-3.5',
                  mobileCartPulse && 'caisse-mobile-cart--pulse',
                  cartHideClass,
                )}
                aria-label={`Ouvrir le panier, ${cartItemCount} article${cartItemCount > 1 ? 's' : ''}, ${formatFCFA(payableTotalTTC)}`}
              >
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[rgba(0,51,170,0.22)] bg-caisse-gold-soft text-caisse-gold">
                  <IconReceipt className="h-4 w-4 text-caisse-gold" />
                  <span
                    ref={mobileFabBadgeRef}
                    className={cn(
                      'absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#f7f8fc] bg-caisse-gold px-1 text-[10px] font-bold text-white',
                      mobileCartPulse && 'caisse-mobile-cart-badge--pulse',
                    )}
                  >
                    {cartItemCount}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                      Panier
                    </span>
                    <span className="rounded-full bg-white/80 px-1.5 py-px font-mono-nums text-[10px] text-caisse-muted">
                      {cartItemCount} art.
                    </span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0">
                    <span className="caisse-total-display font-mono-nums text-[16px] leading-none">
                      {formatFCFA(payableTotalTTC)}
                    </span>
                    {payableTotalTTC < cartTotalTTC ? (
                      <span className="font-mono-nums text-[11px] text-zinc-400 line-through">
                        {formatFCFA(cartTotalTTC)}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="caisse-mobile-cart-cta inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-[11px] font-semibold shadow-sm sm:gap-1.5 sm:px-3.5 sm:text-[12px]">
                  <span className="sm:hidden">Voir</span>
                  <span className="hidden sm:inline">Voir le panier</span>
                  <IconArrowRight className="h-3.5 w-3.5 text-caisse-gold" />
                </span>
              </button>
            ) : null}

            {/* FAB minimal quand panier vide */}
            {!isFloatingCartOpen && cartItemCount === 0 ? (
              <button
                ref={mobileFabEmptyRef}
                type="button"
                onClick={() => setIsFloatingCartOpen(true)}
                className={`fixed-safe-bottom fixed z-30 flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(0,51,170,0.28)] bg-[linear-gradient(145deg,#f7f8fc,#e8eefa)] text-caisse-gold shadow-(--shadow-caisse-pop) transition hover:brightness-[1.03] ${cartHideClass}`}
                style={{ right: 'max(0.75rem, env(safe-area-inset-right, 0px))' }}
                aria-label="Ouvrir le panier"
              >
                <IconReceipt className="h-5 w-5 text-caisse-gold" />
              </button>
            ) : null}

            {/* Drawer panier (mobile = full-width, tablette = max-w-md) */}
            {isFloatingCartOpen ? (
              <div
                className={`fixed inset-0 z-40 ${cartHideClass}`}
                role="dialog"
                aria-modal="true"
                aria-label="Panier"
              >
                <button
                  type="button"
                  aria-label="Fermer le panier"
                  className="absolute inset-0 animate-ui-fade-in bg-[#1a2332]/35 backdrop-blur-[3px]"
                  onClick={() => setIsFloatingCartOpen(false)}
                />
                <div className="absolute inset-y-0 right-0 flex w-full max-h-svh animate-ui-slide-up flex-col pt-[env(safe-area-inset-top,0px)] sm:w-[min(420px,92vw)]">
                  <div className="caisse-drawer-panel flex min-h-0 h-full min-w-0 flex-col border-l border-[rgba(0,51,170,0.2)] bg-[#f7f8fc] shadow-(--shadow-overlay)">
                    <CartPanel
                      lines={cart}
                      products={displayProducts}
                      discountPct={discountPct}
                      maxDiscountPct={perms.maxDiscountPct}
                      promoInput={promoInput}
                      onPromoInputChange={setPromoInput}
                      onApplyPromo={handleApplyPromo}
                      promoFeedback={promoFeedback}
                      onApplyManualDiscount={handleApplyManualDiscount}
                      onRequestDiscountOverride={handleRequestDiscountOverride}
                      tableOptions={diningTables.map((t) => ({
                        id: t.id,
                        name: t.name,
                        status: tableStatusLabel(t.status),
                        statusCode: t.status,
                      }))}
                      selectedTableId={selectedTableId}
                      onSelectedTableIdChange={setSelectedTableId}
                      loyaltyPhone={loyaltyPhoneInput}
                      onLoyaltyPhoneChange={setLoyaltyPhoneInput}
                      loyaltyPointsAvailable={activeLoyaltyCustomer?.points ?? 0}
                      loyaltyRedeemPoints={loyaltyRedeemInput}
                      onLoyaltyRedeemPointsChange={setLoyaltyRedeemInput}
                      loyaltyRedeemAmountTTC={loyaltyRedeemAmountTTC}
                      payableTotalTTC={payableTotalTTC}
                      creditAvailableTTC={creditAvailableTTC}
                      payment={checkoutPayment}
                      onPaymentPatch={patchCheckoutPayment}
                      online={online}
                      canPayElectronic={online && deviceConnectivity.paymentTerminals}
                      receiptPrinterEnabled={deviceConnectivity.receiptPrinters}
                      onInc={handleInc}
                      onDec={handleDec}
                      onSetQty={handleSetQty}
                      onRemove={handleRemove}
                      onClear={handleClear}
                      onCancelTransaction={handleCancelCartTransaction}
                      onCheckout={handleCheckout}
                      checkoutBusy={checkoutBusy}
                      onClose={() => setIsFloatingCartOpen(false)}
                      countBadgeRef={drawerCartCountRef}
                      dayClosed={!!dayClosureToday?.closedAt}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
        </div>
      </div>
      </div>
    </div>
  )
}
