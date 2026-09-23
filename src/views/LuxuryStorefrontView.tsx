import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { OfflineBanner } from '../components/OfflineBanner'
import { useActiveStoreOptional } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type {
  CartLine,
  OnlineOrder,
  ProductCategoryRow,
  Promotion,
  ProductWithStock,
} from '../db/types'
import {
  DEFAULT_VAT_RATE_PCT,
  formatFCFA,
  totalsFromLinesTTC,
} from '../lib/money'
import { productImageSrc } from '../lib/productImage'
import { productCardBlurb } from '../lib/productDescription'
import { ProductImage } from '../components/ProductImage'
import { ProductDetailModal } from '../components/ProductDetailModal'
import { storeStockRowId } from '../lib/storeStockId'
import { BRAND_NAME } from '../brand'
import { BrandLogo } from '../components/BrandLogo'
import {
  getDeliveryProviderDemo,
  getKitchenStationDemo,
  isDeliveryModuleDemoOn,
  isKitchenModuleDemoOn,
} from '../lib/integrationsConfig'

import type {
  PublicStorefrontOrderInput,
  StorefrontBranding,
  StorefrontPaymentMethod,
} from '../lib/storefront/types'
import {
  computeDeliveryFeeTTC,
  findStorefrontDeliveryZone,
  normalizeStorefrontBranding,
  orderStorefrontCategories,
  resolveStorefrontDeliveryFeeTTC,
  resolveStorefrontDeliveryZones,
  resolveStorefrontFreeDeliveryThresholdTTC,
  storefrontAccentColor,
  storefrontDisplayName,
  storefrontMapsHref,
  storefrontTelHref,
  storefrontWhatsAppHref,
} from '../lib/storefront/types'
import { openWaveCheckout } from '../lib/wavePayment'

type PublicStorefrontConfig = {
  storeName: string
  storeId: string
  products: ProductWithStock[]
  promotions?: Promotion[]
  categories?: string[]
  waveEnabled?: boolean
  branding?: StorefrontBranding
  submitOrder: (
    order: PublicStorefrontOrderInput,
  ) => Promise<{
    orderId: string
    reference: string
    requiresPayment?: boolean
    paymentUrl?: string
    demo?: boolean
  }>
}

type Props = {
  online: boolean
  seedReady: boolean
  onOpenStaffLogin: () => void
  /** Espace propriétaire (abonnement) — uniquement hors boutique publique. */
  onOpenOwnerSpace?: () => void
  publicStorefront?: PublicStorefrontConfig
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

const DESIRED_TIME_SLOTS: string[] = (() => {
  const slots = ['ASAP (des que possible)']
  const startMin = 7 * 60
  const endMin = 23 * 60
  for (let t = startMin; t < endMin; t += 15) {
    const next = t + 15
    const hh = String(Math.floor(t / 60)).padStart(2, '0')
    const mm = String(t % 60).padStart(2, '0')
    const hhNext = String(Math.floor(next / 60)).padStart(2, '0')
    const mmNext = String(next % 60).padStart(2, '0')
    slots.push(`${hh}h${mm} - ${hhNext}h${mmNext}`)
  }
  return slots
})()

function CartIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className ?? 'h-4 w-4'}
    >
      <path
        d="M3 5h2l1.2 8.2a2 2 0 0 0 2 1.7h8.7a2 2 0 0 0 2-1.6L20 8H7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="19" r="1.5" fill="currentColor" />
      <circle cx="17" cy="19" r="1.5" fill="currentColor" />
    </svg>
  )
}

function StatusIcon({
  tone,
  className,
}: {
  tone: 'success' | 'error'
  className?: string
}) {
  if (tone === 'success') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        className={className ?? 'h-5 w-5'}
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="m8.5 12.3 2.2 2.3 4.8-5.1"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className ?? 'h-5 w-5'}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 7.5v5.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.8" r="1.1" fill="currentColor" />
    </svg>
  )
}

export function LuxuryStorefrontView({
  online,
  seedReady,
  onOpenStaffLogin,
  onOpenOwnerSpace,
  publicStorefront,
}: Props) {
  const storeCtx = useActiveStoreOptional()
  const displayProducts = publicStorefront?.products ?? storeCtx?.displayProducts ?? []
  const activeStoreId = publicStorefront?.storeId ?? storeCtx?.activeStoreId ?? 'store-main'
  const activeStore = publicStorefront
    ? {
        id: publicStorefront.storeId,
        name: publicStorefront.storeName,
        shortCode: '',
        sortOrder: 0,
      }
    : storeCtx?.activeStore
  const isPublicStorefront = Boolean(publicStorefront)
  const branding = normalizeStorefrontBranding(publicStorefront?.branding)
  const shopTitle = storefrontDisplayName(
    branding,
    publicStorefront?.storeName ?? activeStore?.name ?? BRAND_NAME,
  )
  const accentColor = storefrontAccentColor(branding)
  const logoUrl = branding?.logoUrl?.trim() || null
  const bannerUrl = branding?.bannerUrl?.trim() || null
  const welcomeMessage = branding?.welcomeMessage?.trim() || null
  const contactPhone = branding?.phone?.trim() || null
  const contactWhatsappLabel =
    branding?.whatsapp?.trim() || contactPhone
  const shopEmail = branding?.email?.trim() || null
  const contactAddress = branding?.address?.trim() || null
  const contactOpeningHours = branding?.openingHours?.trim() || null
  const footerTagline = branding?.footerTagline?.trim() || null
  const legalMentions = branding?.legalMentions?.trim() || null
  const telHref = storefrontTelHref(contactPhone ?? undefined)
  const whatsappHref = storefrontWhatsAppHref(
    branding?.whatsapp,
    contactPhone ?? undefined,
  )
  const mapsHref = storefrontMapsHref(branding?.mapsUrl, contactAddress ?? undefined)
  const hasContactDetails = Boolean(
    contactPhone ||
      whatsappHref ||
      shopEmail ||
      contactAddress ||
      contactOpeningHours,
  )
  const cardDensity: 'compact' | 'confort' = 'compact'
  const [cart, setCart] = useState<CartLine[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerNote, setCustomerNote] = useState('')
  const [desiredTimeSlot, setDesiredTimeSlot] = useState('')
  const [fulfillmentMode, setFulfillmentMode] = useState<'pickup' | 'delivery'>(
    'pickup',
  )
  const [deliveryZoneId, setDeliveryZoneId] = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [promoFeedback, setPromoFeedback] = useState<string | null>(null)
  const [discountPct, setDiscountPct] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<StorefrontPaymentMethod>('mobile')
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [confirmationTone, setConfirmationTone] = useState<'success' | 'error'>(
    'success',
  )
  const [cartBadgePulse, setCartBadgePulse] = useState(false)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [flyToCart, setFlyToCart] = useState<FlyToCartAnim | null>(null)
  const [detailProduct, setDetailProduct] = useState<ProductWithStock | null>(
    null,
  )
  const localPromotions = useLiveQuery(
    () => db.promotions.toArray(),
    [],
    [],
  ) ?? []
  const promotions = publicStorefront?.promotions ?? localPromotions
  const productsSectionRef = useRef<HTMLElement | null>(null)
  const cartPanelRef = useRef<HTMLElement | null>(null)
  const checkoutFormRef = useRef<HTMLDivElement | null>(null)
  const contactRef = useRef<HTMLElement | null>(null)
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactMessage, setContactMessage] = useState('')
  const [contactSent, setContactSent] = useState(false)
  const cartBadgeRef = useRef<HTMLSpanElement | null>(null)
  const prevItemCountRef = useRef(0)
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const localCategoryRows =
    useLiveQuery(
      () =>
        isPublicStorefront
          ? Promise.resolve([] as ProductCategoryRow[])
          : db.productCategories.orderBy('sortOrder').toArray(),
      [isPublicStorefront],
      [] as ProductCategoryRow[],
    ) ?? []

  const featuredProducts = useMemo(
    () => [...displayProducts].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [displayProducts],
  )
  const storefrontCategories = useMemo(() => {
    const preferred = isPublicStorefront
      ? publicStorefront?.categories
      : localCategoryRows.map((row) => row.name)
    return orderStorefrontCategories(featuredProducts, preferred)
  }, [
    featuredProducts,
    isPublicStorefront,
    localCategoryRows,
    publicStorefront?.categories,
  ])
  const featuredByCategory = useMemo(() => {
    const grouped = new Map<string, ProductWithStock[]>()
    for (const product of featuredProducts) {
      const category = product.category?.trim() || 'Autres'
      const list = grouped.get(category)
      if (list) {
        list.push(product)
      } else {
        grouped.set(category, [product])
      }
    }
    const sections: Array<[string, ProductWithStock[]]> = []
    for (const category of storefrontCategories) {
      const products = grouped.get(category)
      if (products?.length) sections.push([category, products])
    }
    return sections
  }, [featuredProducts, storefrontCategories])
  const visibleCategorySections = useMemo(() => {
    if (selectedCategory === 'all') return featuredByCategory
    return featuredByCategory.filter(([category]) => category === selectedCategory)
  }, [featuredByCategory, selectedCategory])

  useEffect(() => {
    if (selectedCategory === 'all') return
    if (!storefrontCategories.includes(selectedCategory)) {
      setSelectedCategory('all')
    }
  }, [selectedCategory, storefrontCategories])

  const topOrderedProducts = useLiveQuery(async () => {
    if (isPublicStorefront) return []
    const [sales, onlineOrders] = await Promise.all([
      db.sales.toArray(),
      db.onlineOrders.toArray(),
    ])

    const qtyByProductId = new Map<string, number>()
    const addQty = (productId: string, qty: number) => {
      qtyByProductId.set(productId, (qtyByProductId.get(productId) ?? 0) + qty)
    }

    for (const sale of sales) {
      for (const line of sale.lines) {
        addQty(line.productId, line.qty)
      }
    }
    for (const order of onlineOrders) {
      if (order.status === 'rejected') continue
      for (const line of order.lines) {
        addQty(line.productId, line.qty)
      }
    }

    const byId = new Map(displayProducts.map((product) => [product.id, product]))
    return [...qtyByProductId.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([productId, orderedQty]) => {
        const product = byId.get(productId)
        if (!product) return null
        return { product, orderedQty }
      })
      .filter((entry): entry is { product: ProductWithStock; orderedQty: number } =>
        Boolean(entry),
      )
  }, [displayProducts, isPublicStorefront])

  const grossTotals = useMemo(() => totalsFromLinesTTC(cart, 0), [cart])
  const totals = useMemo(
    () => totalsFromLinesTTC(cart, discountPct),
    [cart, discountPct],
  )
  const discountAmount = useMemo(
    () => Math.max(0, grossTotals.totalTTC - totals.totalTTC),
    [grossTotals.totalTTC, totals.totalTTC],
  )
  const deliveryZones = useMemo(
    () => resolveStorefrontDeliveryZones(branding),
    [branding],
  )
  const selectedDeliveryZone = useMemo(
    () => findStorefrontDeliveryZone(branding, deliveryZoneId),
    [branding, deliveryZoneId],
  )
  const configuredDeliveryFeeTTC = useMemo(
    () => resolveStorefrontDeliveryFeeTTC(branding, deliveryZoneId || null),
    [branding, deliveryZoneId],
  )
  const freeDeliveryThresholdTTC = useMemo(
    () => resolveStorefrontFreeDeliveryThresholdTTC(branding),
    [branding],
  )
  const deliveryFeeTTC = useMemo(
    () =>
      computeDeliveryFeeTTC({
        fulfillmentMode,
        cartTTC: totals.totalTTC,
        feeTTC: configuredDeliveryFeeTTC,
        freeThresholdTTC: freeDeliveryThresholdTTC,
      }),
    [
      fulfillmentMode,
      totals.totalTTC,
      configuredDeliveryFeeTTC,
      freeDeliveryThresholdTTC,
    ],
  )
  const grandTotalTTC = useMemo(
    () => totals.totalTTC + deliveryFeeTTC,
    [totals.totalTTC, deliveryFeeTTC],
  )

  const lineQty = useCallback(
    (productId: string): number =>
      cart.find((line) => line.productId === productId)?.qty ?? 0,
    [cart],
  )

  function triggerCartPulse() {
    setCartBadgePulse(true)
    if (pulseTimeoutRef.current) {
      clearTimeout(pulseTimeoutRef.current)
    }
    pulseTimeoutRef.current = setTimeout(() => {
      setCartBadgePulse(false)
      pulseTimeoutRef.current = null
    }, 600)
  }

  const triggerFlyToCart = useCallback(
    (product: ProductWithStock, originEl?: HTMLElement | null) => {
      if (!originEl || !cartBadgeRef.current) return
      const from = originEl.getBoundingClientRect()
      const to = cartBadgeRef.current.getBoundingClientRect()
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
    [],
  )

  const handleAdd = (product: ProductWithStock, originEl?: HTMLElement | null) => {
    if (product.stock <= 0) return
    let didAdd = false
    setCart((prev) => {
      const existing = prev.find((line) => line.productId === product.id)
      const currentQty = existing?.qty ?? 0
      if (currentQty >= product.stock) return prev
      if (!existing) {
        didAdd = true
        return [
          ...prev,
          {
            productId: product.id,
            name: product.name,
            unitPriceTTC: product.priceTTC,
            qty: 1,
            vatRatePct: product.vatRatePct ?? DEFAULT_VAT_RATE_PCT,
          },
        ]
      }
      return prev.map((line) =>
        line.productId === product.id
          ? ((didAdd = true),
            {
              ...line,
              qty: line.qty + 1,
              unitPriceTTC: product.priceTTC,
              vatRatePct: product.vatRatePct ?? DEFAULT_VAT_RATE_PCT,
            })
          : line,
      )
    })
    if (didAdd) {
      triggerCartPulse()
      triggerFlyToCart(product, originEl)
    }
  }

  const handleRemove = useCallback((productId: string) => {
    setCart((prev) => prev.filter((line) => line.productId !== productId))
  }, [])

  const handleClearCart = useCallback(() => {
    setCart([])
    setPromoCode('')
    setPromoFeedback(null)
    setDiscountPct(0)
    setConfirmation(null)
  }, [])

  const handleIncLine = useCallback(
    (productId: string) => {
      setCart((prev) => {
        const product = displayProducts.find((p) => p.id === productId)
        if (!product) return prev
        return prev.map((line) => {
          if (line.productId !== productId) return line
          if (line.qty >= product.stock) return line
          return { ...line, qty: line.qty + 1 }
        })
      })
    },
    [displayProducts],
  )

  const handleDecLine = useCallback((productId: string) => {
    setCart((prev) =>
      prev
        .map((line) =>
          line.productId === productId ? { ...line, qty: line.qty - 1 } : line,
        )
        .filter((line) => line.qty > 0),
    )
  }, [])

  const itemCount = useMemo(
    () => cart.reduce((sum, line) => sum + line.qty, 0),
    [cart],
  )
  const freeDeliveryProgressPct = useMemo(() => {
    if (freeDeliveryThresholdTTC <= 0) return 100
    return Math.min(
      100,
      Math.round(
        (Math.max(0, totals.totalTTC) / freeDeliveryThresholdTTC) * 100,
      ),
    )
  }, [totals.totalTTC, freeDeliveryThresholdTTC])
  const freeDeliveryRemaining = useMemo(
    () => Math.max(0, freeDeliveryThresholdTTC - totals.totalTTC),
    [totals.totalTTC, freeDeliveryThresholdTTC],
  )
  const hasFreeDelivery =
    freeDeliveryThresholdTTC > 0 && freeDeliveryRemaining <= 0
  const showFreeDeliveryProgress = freeDeliveryThresholdTTC > 0
  const estimatedWindow =
    fulfillmentMode === 'delivery' ? 'Livraison 45-90 min' : 'Click & collect 15-30 min'
  const productById = useMemo(
    () => new Map(displayProducts.map((p) => [p.id, p])),
    [displayProducts],
  )

  const openCart = useCallback(() => {
    setIsCartOpen(true)
  }, [])

  const toggleCart = useCallback(() => {
    setIsCartOpen((prev) => !prev)
  }, [])

  const scrollToProducts = useCallback(() => {
    productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const selectCategory = useCallback((category: string) => {
    setSelectedCategory(category)
    requestAnimationFrame(() => {
      productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const scrollToCheckoutForm = useCallback(() => {
    setIsCartOpen(true)
  }, [])

  const scrollToContact = useCallback(() => {
    contactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const submitContact = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!contactName.trim() || !contactMessage.trim()) return
      if (!shopEmail) return
      const subject = encodeURIComponent(
        `Contact boutique — ${contactName.trim()}`,
      )
      const body = encodeURIComponent(
        `${contactMessage.trim()}\n\n— ${contactName.trim()}${
          contactEmail.trim() ? ` (${contactEmail.trim()})` : ''
        }`,
      )
      window.location.href = `mailto:${shopEmail}?subject=${subject}&body=${body}`
      setContactSent(true)
      window.setTimeout(() => setContactSent(false), 4000)
    },
    [contactName, contactEmail, contactMessage, shopEmail],
  )

  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) {
        clearTimeout(pulseTimeoutRef.current)
      }
      if (flyTimeoutRef.current) {
        clearTimeout(flyTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isCartOpen) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsCartOpen(false)
    }
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('keydown', onEscape)
    }
  }, [isCartOpen])

  useEffect(() => {
    const prev = prevItemCountRef.current
    if (prev > 0 && itemCount === 0 && isCartOpen) {
      setIsCartOpen(false)
    }
    prevItemCountRef.current = itemCount
  }, [itemCount, isCartOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'g') {
        event.preventDefault()
        onOpenStaffLogin()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onOpenStaffLogin])

  const handleApplyPromo = useCallback(() => {
    const code = promoCode.trim().toUpperCase()
    if (!code) {
      setDiscountPct(0)
      setPromoFeedback(null)
      return
    }
    const now = Date.now()
    const promo = promotions.find((p) => p.code.toUpperCase() === code)
    if (!promo) {
      setDiscountPct(0)
      setPromoFeedback('Code promo non reconnu')
      return
    }
    if (!promo.active) {
      setDiscountPct(0)
      setPromoFeedback('Promotion inactive')
      return
    }
    if (promo.storeId && promo.storeId !== activeStoreId) {
      setDiscountPct(0)
      setPromoFeedback('Code non valable pour ce magasin')
      return
    }
    if (promo.startAt != null && now < promo.startAt) {
      setDiscountPct(0)
      setPromoFeedback('Promotion pas encore active')
      return
    }
    if (promo.endAt != null && now > promo.endAt) {
      setDiscountPct(0)
      setPromoFeedback('Promotion expirée')
      return
    }
    if (promo.maxUsage != null && promo.usageCount >= promo.maxUsage) {
      setDiscountPct(0)
      setPromoFeedback('Limite d’utilisation atteinte')
      return
    }
    const grossTotal = Math.round(totalsFromLinesTTC(cart, 0).totalTTC)
    if (promo.minCartTTC != null && grossTotal < promo.minCartTTC) {
      setDiscountPct(0)
      setPromoFeedback(
        `Panier minimum requis: ${formatFCFA(promo.minCartTTC)}`,
      )
      return
    }
    setDiscountPct(promo.discountPct)
    setPromoFeedback(`Code ${code} appliqué (${promo.discountPct}%)`)
  }, [activeStoreId, cart, promoCode, promotions])

  const handleCheckout = useCallback(async () => {
    if (cart.length === 0) {
      setConfirmationTone('error')
      setConfirmation('Ajoutez au moins un article pour valider la commande.')
      return
    }
    if (!customerName.trim()) {
      setConfirmationTone('error')
      setConfirmation('Merci de renseigner votre nom pour finaliser la commande.')
      return
    }
    if (fulfillmentMode === 'delivery' && !customerAddress.trim()) {
      setConfirmationTone('error')
      setConfirmation('Adresse requise pour une livraison.')
      return
    }
    if (
      fulfillmentMode === 'delivery' &&
      deliveryZones.length > 0 &&
      !selectedDeliveryZone
    ) {
      setConfirmationTone('error')
      setConfirmation('Choisissez votre zone de livraison.')
      return
    }
    if (!online && paymentMethod !== 'cash') {
      setConfirmationTone('error')
      setConfirmation(
        'Mode hors ligne : utilisez le paiement à la livraison en espèces.',
      )
      return
    }
    if (
      isPublicStorefront &&
      paymentMethod === 'wave' &&
      !customerPhone.trim()
    ) {
      setConfirmationTone('error')
      setConfirmation('Votre numéro Wave est requis pour payer par Wave.')
      return
    }

    setSubmitting(true)
    try {
      const orderId = crypto.randomUUID()
      const createdAt = Date.now()
      const total = totalsFromLinesTTC(cart, discountPct)
      const customerLabel = customerName.trim()
      const kitchenEnabled = isKitchenModuleDemoOn()

      const orderRecord: OnlineOrder = {
        id: orderId,
        createdAt,
        storeId: activeStoreId,
        storeName: activeStore?.name,
        customerName: customerLabel,
        customerPhone: customerPhone.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        customerNote: customerNote.trim() || undefined,
        desiredTimeSlot: desiredTimeSlot.trim() || undefined,
        paymentMethod: paymentMethod === 'wave' ? 'mobile' : paymentMethod,
        lines: cart.map((line) => ({
          productId: line.productId,
          name: line.name,
          unitPriceTTC: line.unitPriceTTC,
          qty: line.qty,
          vatRatePct: line.vatRatePct,
        })),
        subtotalHT: total.subtotalHT,
        tva: total.tva,
        totalTTC: grandTotalTTC,
        netProductsTTC: total.totalTTC,
        discountPct: discountPct || undefined,
        promoCode: promoCode.trim().toUpperCase() || undefined,
        deliveryFeeTTC: deliveryFeeTTC || undefined,
        deliveryZoneId: selectedDeliveryZone?.id,
        deliveryZoneName: selectedDeliveryZone?.name,
        fulfillmentMode,
        status: 'pending',
        kitchenStatus: kitchenEnabled ? 'queued' : undefined,
        kitchenPriority: kitchenEnabled
          ? fulfillmentMode === 'delivery'
            ? 'high'
            : 'normal'
          : undefined,
        kitchenStation: kitchenEnabled ? getKitchenStationDemo() : undefined,
        kitchenTicketCode: kitchenEnabled
          ? `K-${orderId.slice(0, 6).toUpperCase()}`
          : undefined,
        kitchenUpdatedAt: kitchenEnabled ? createdAt : undefined,
        deliveryStatus:
          fulfillmentMode === 'delivery' && isDeliveryModuleDemoOn()
            ? 'queued'
            : undefined,
        deliveryProvider:
          fulfillmentMode === 'delivery' && isDeliveryModuleDemoOn()
            ? getDeliveryProviderDemo()
            : undefined,
        deliveryUpdatedAt:
          fulfillmentMode === 'delivery' && isDeliveryModuleDemoOn()
            ? Date.now()
            : undefined,
      }

      for (const line of cart) {
        if (isPublicStorefront) {
          const product = displayProducts.find((p) => p.id === line.productId)
          if (!product) {
            throw new Error(`Le produit « ${line.name} » n'est plus disponible.`)
          }
          if (product.stock < line.qty) {
            throw new Error(
              `Stock insuffisant pour « ${line.name} » (reste ${product.stock}).`,
            )
          }
          continue
        }
        const product = await db.products.get(line.productId)
        if (!product || product.archived) {
          throw new Error(`Le produit « ${line.name} » n'est plus disponible.`)
        }
        const stockRow = await db.storeStocks.get(
          storeStockRowId(activeStoreId, line.productId),
        )
        const currentStock = stockRow?.stock ?? 0
        if (currentStock < line.qty) {
          throw new Error(
            `Stock insuffisant pour « ${line.name} » (reste ${currentStock}).`,
          )
        }
      }

      if (isPublicStorefront && publicStorefront) {
        const orderPaymentMethod =
          paymentMethod === 'wave' ? 'wave' : paymentMethod
        const result = await publicStorefront.submitOrder({
          customerName: customerLabel,
          customerPhone: customerPhone.trim() || undefined,
          customerAddress: customerAddress.trim() || undefined,
          customerNote: customerNote.trim() || undefined,
          desiredTimeSlot: desiredTimeSlot.trim() || undefined,
          paymentMethod: orderPaymentMethod,
          fulfillmentMode,
          lines: cart.map((line) => ({
            productId: line.productId,
            name: line.name,
            unitPriceTTC: line.unitPriceTTC,
            qty: line.qty,
            vatRatePct: line.vatRatePct,
          })),
          subtotalHT: total.subtotalHT,
          tva: total.tva,
          totalTTC: grandTotalTTC,
          netProductsTTC: total.totalTTC,
          discountPct: discountPct || undefined,
          promoCode: promoCode.trim().toUpperCase() || undefined,
          deliveryFeeTTC: deliveryFeeTTC || undefined,
          deliveryZoneId: selectedDeliveryZone?.id,
          deliveryZoneName: selectedDeliveryZone?.name,
        })

        if (result.requiresPayment && result.paymentUrl) {
          openWaveCheckout(result.paymentUrl)
          return
        }

        setCart([])
        setCustomerName('')
        setCustomerPhone('')
        setCustomerAddress('')
        setCustomerNote('')
        setDesiredTimeSlot('')
        setPromoCode('')
        setPromoFeedback(null)
        setDiscountPct(0)
        setConfirmationTone('success')
        setConfirmation(
          `Commande envoyée pour validation. Référence: ${result.reference}.`,
        )
        return
      }

      await db.onlineOrders.put(orderRecord)

      setCart([])
      setCustomerName('')
      setCustomerPhone('')
      setCustomerAddress('')
      setCustomerNote('')
      setDesiredTimeSlot('')
      setPromoCode('')
      setPromoFeedback(null)
      setDiscountPct(0)
      setConfirmationTone('success')
      setConfirmation(
        `Commande envoyée pour validation. Référence: ${orderId
          .slice(0, 8)
          .toUpperCase()}.`,
      )
    } catch (error) {
      setConfirmationTone('error')
      setConfirmation(
        error instanceof Error
          ? error.message
          : 'Impossible de finaliser la commande pour le moment.',
      )
    } finally {
      setSubmitting(false)
    }
  }, [
    activeStore?.name,
    activeStoreId,
    cart,
    customerAddress,
    customerNote,
    customerName,
    customerPhone,
    desiredTimeSlot,
    deliveryFeeTTC,
    deliveryZones.length,
    discountPct,
    fulfillmentMode,
    grandTotalTTC,
    online,
    paymentMethod,
    promoCode,
    selectedDeliveryZone,
    isPublicStorefront,
    publicStorefront,
    displayProducts,
  ])

  return (
    <div
      className="storefront-shell min-h-svh"
      style={{ ['--storefront-accent' as string]: accentColor }}
    >
      {!online ? <OfflineBanner /> : null}

      {!isPublicStorefront && onOpenOwnerSpace ? (
        <div className="border-b border-stone-300/70 bg-amber-50 px-3 py-2 sm:px-5">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-amber-950">
              Aperçu boutique — vous êtes connecté en tant que propriétaire
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={onOpenOwnerSpace}
                className="rounded-lg bg-stone-900 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-stone-800"
              >
                ← Espace propriétaire
              </button>
              <button
                type="button"
                onClick={onOpenStaffLogin}
                className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-stone-800 transition hover:bg-stone-50"
              >
                Connexion caisse
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <header className="storefront-header sticky top-0 z-30 border-x-0 border-t-0">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2.5 sm:px-5">
          <button
            type="button"
            onClick={() => {
              setIsCartOpen(false)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            title={shopTitle}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full border border-stone-200 object-cover bg-white"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <BrandLogo size="md" alt="" ring="gold" />
            )}
            <span className="min-w-0 truncate text-[15px] font-bold tracking-tight text-stone-900">
              {shopTitle}
            </span>
          </button>
          <nav className="hidden items-center gap-1 sm:flex">
            <button
              type="button"
              onClick={scrollToProducts}
              className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
            >
              Menu
            </button>
            <button
              type="button"
              onClick={() =>
                checkoutFormRef.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                })
              }
              className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
            >
              Commander
            </button>
          </nav>
          <button
            type="button"
            onClick={toggleCart}
            aria-label="Afficher le panier"
            className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-800 transition hover:border-stone-400"
          >
            <span
              ref={cartBadgeRef}
              className={`absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-bold leading-none text-stone-900 transition ${
                cartBadgePulse ? 'animate-pulse ring-2 ring-white' : ''
              }`}
              style={{ backgroundColor: 'var(--storefront-accent)' }}
            >
              {itemCount}
            </span>
            <CartIcon className="h-4 w-4" />
          </button>
        </div>
      </header>

      <section
        className={`storefront-hero${bannerUrl ? ' storefront-hero--banner' : ''}`}
      >
        {bannerUrl ? (
          <div className="storefront-hero-media">
            <img
              src={bannerUrl}
              alt=""
              className="storefront-hero-banner"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          </div>
        ) : null}
        <div
          className={
            bannerUrl
              ? 'storefront-hero-content mx-auto w-full max-w-6xl px-4 py-5 sm:px-5 sm:py-7'
              : 'storefront-hero-content mx-auto flex min-h-[inherit] max-w-6xl flex-col justify-end px-4 pb-10 pt-20 sm:px-5 sm:pb-14'
          }
        >
          <h1
            className={
              bannerUrl
                ? 'max-w-2xl font-display text-2xl font-bold tracking-tight text-balance text-stone-900 sm:text-4xl lg:text-5xl'
                : 'max-w-2xl font-display text-4xl font-bold tracking-tight text-balance text-stone-900 sm:text-5xl lg:text-6xl'
            }
          >
            {shopTitle}
          </h1>
          <p
            className={
              bannerUrl
                ? 'mt-2 max-w-xl text-sm leading-relaxed text-stone-600 sm:text-base'
                : 'mt-3 max-w-xl text-base leading-relaxed text-stone-700 sm:text-lg'
            }
          >
            {welcomeMessage ??
              'Commandez en ligne, retirez en boutique ou faites-vous livrer près de chez vous.'}
          </p>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-6xl flex-col px-3 pb-24 pt-6 sm:px-5">
        {confirmation ? (
          <div className="mb-4 flex justify-center">
            <div
              className={`inline-flex max-w-3xl items-center justify-center gap-2 rounded-xl border px-4 py-2 text-center text-sm ${
                confirmationTone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/80">
                <StatusIcon tone={confirmationTone} className="h-4 w-4" />
              </span>
              <span>{confirmation}</span>
            </div>
          </div>
        ) : null}

        {isCartOpen ? (
          <>
            <button
              type="button"
              aria-label="Fermer le panier"
              onClick={() => setIsCartOpen(false)}
              className="fixed inset-0 z-30 bg-stone-900/35 backdrop-blur-[1px]"
            />
            <aside
              ref={cartPanelRef}
              className="storefront-cart-panel fixed left-1/2 top-16 z-40 max-h-[calc(100svh-5rem)] w-[calc(100%-1.25rem)] max-w-lg -translate-x-1/2 overflow-y-auto rounded-2xl p-4 sm:left-auto sm:right-4 sm:w-[min(92vw,34rem)] sm:translate-x-0"
            >
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-stone-900">
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-900"
                style={{ backgroundColor: 'var(--storefront-accent)' }}
              >
                <CartIcon className="h-4 w-4" />
              </span>
              Votre panier
            </h2>
            <button
              type="button"
              onClick={() => setIsCartOpen(false)}
              className="rounded-md border border-stone-300 px-2 py-1 text-xs text-stone-600 hover:border-stone-400 hover:text-stone-900"
            >
              Fermer
            </button>
          </div>
          {showFreeDeliveryProgress ? (
            <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-stone-600">
                  Livraison offerte dès{' '}
                  {formatFCFA(freeDeliveryThresholdTTC)}
                </span>
                <span className="font-semibold text-stone-800">
                  {freeDeliveryProgressPct}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${freeDeliveryProgressPct}%`,
                    backgroundColor: 'var(--storefront-accent)',
                  }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-stone-600">
                {hasFreeDelivery
                  ? 'Bravo, la livraison est offerte.'
                  : `Encore ${formatFCFA(freeDeliveryRemaining)} pour débloquer la livraison offerte.`}
              </p>
            </div>
          ) : null}

          <div className="mt-4 space-y-2">
            {cart.length === 0 ? (
              <p className="rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-500">
                Votre panier est vide.
              </p>
            ) : (
              cart.map((line) => (
                <div
                  key={line.productId}
                  className="rounded-xl border border-stone-200 bg-white px-2.5 py-2"
                >
                  <div className="flex items-center gap-2">
                    <ProductImage
                      product={
                        productById.get(line.productId) ?? {
                          id: line.productId,
                          name: line.name,
                        }
                      }
                      className="h-9 w-9 rounded-lg border border-stone-200 object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-stone-900">
                        {line.name}
                      </p>
                      <p className="text-[10px] text-stone-500">
                        {formatFCFA(line.unitPriceTTC)} / unité
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-1.5">
                    <div className="inline-flex items-center overflow-hidden rounded-lg border border-stone-300 bg-stone-50">
                      <button
                        type="button"
                        onClick={() => handleDecLine(line.productId)}
                        className="px-2 py-1 text-[11px] text-stone-700 hover:bg-stone-100"
                      >
                        −
                      </button>
                      <span className="border-x border-stone-300 px-2 py-1 text-[11px] font-semibold text-stone-900">
                        {line.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleIncLine(line.productId)}
                        className="px-2 py-1 text-[11px] text-stone-700 hover:bg-stone-100"
                      >
                        +
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-semibold text-stone-900">
                        {formatFCFA(line.unitPriceTTC * line.qty)}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleRemove(line.productId)}
                        className="rounded-lg border border-stone-300 px-2 py-1 text-[10px] text-stone-600 hover:border-rose-300 hover:text-rose-700"
                      >
                        Retirer
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                Résumé
              </p>
              <div className="flex items-center justify-between text-stone-600">
                <span>Sous-total HT</span>
                <span>{formatFCFA(totals.subtotalHT)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-stone-600">
                <span>TVA</span>
                <span>{formatFCFA(totals.tva)}</span>
              </div>
              {discountAmount > 0 ? (
                <div className="mt-1 flex items-center justify-between text-emerald-700">
                  <span>Remise promo</span>
                  <span>- {formatFCFA(discountAmount)}</span>
                </div>
              ) : null}
              {fulfillmentMode === 'delivery' ? (
                <div className="mt-1 flex items-center justify-between text-stone-600">
                  <span>
                    Livraison
                    {selectedDeliveryZone
                      ? ` (${selectedDeliveryZone.name})`
                      : ''}
                  </span>
                  <span>
                    {deliveryZones.length > 0 && !selectedDeliveryZone
                      ? 'Choisir une zone'
                      : deliveryFeeTTC > 0
                        ? formatFCFA(deliveryFeeTTC)
                        : 'Offerte'}
                  </span>
                </div>
              ) : null}
              <div className="mt-1 flex items-center justify-between text-stone-600">
                <span>Délai estimé</span>
                <span>{estimatedWindow}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-base font-semibold text-stone-900">
                <span>Total à payer</span>
                <span>{formatFCFA(grandTotalTTC)}</span>
              </div>
            </div>

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={handleClearCart}
              disabled={cart.length === 0}
              className="rounded-md border border-stone-300 px-2.5 py-1 text-xs text-stone-600 hover:border-stone-400 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Vider le panier
            </button>
          </div>

          <div ref={checkoutFormRef} className="mt-2 max-w-md space-y-3">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nom complet"
                className="storefront-input w-full rounded-xl px-3 py-2 text-sm"
              />
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Téléphone"
                className="storefront-input w-full rounded-xl px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  value={fulfillmentMode}
                  onChange={(e) => {
                    const next = e.target.value as 'pickup' | 'delivery'
                    setFulfillmentMode(next)
                    if (next === 'pickup') setDeliveryZoneId('')
                  }}
                  aria-label="Mode de réception"
                  className="storefront-input w-full rounded-xl px-3 py-2 text-sm"
                >
                  <option value="pickup">Click & collect</option>
                  <option value="delivery">
                    {deliveryZones.length > 0
                      ? 'Livraison locale'
                      : configuredDeliveryFeeTTC > 0
                        ? `Livraison locale (+${configuredDeliveryFeeTTC})`
                        : 'Livraison locale (gratuite)'}
                  </option>
                </select>
                <div className="flex gap-1.5">
                  <input
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value)
                      setPromoFeedback(null)
                    }}
                    placeholder="Code promo"
                    className="storefront-input w-full rounded-xl px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleApplyPromo}
                    className="rounded-lg border border-stone-300 px-2.5 text-xs font-semibold text-stone-800 hover:bg-stone-100"
                  >
                    OK
                  </button>
                  {discountPct > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPromoCode('')
                        setPromoFeedback(null)
                        setDiscountPct(0)
                      }}
                      className="rounded-lg border border-stone-300 px-2.5 text-xs font-semibold text-stone-600 hover:border-stone-400"
                    >
                      X
                    </button>
                  ) : null}
                </div>
              </div>
              {fulfillmentMode === 'delivery' && deliveryZones.length > 0 ? (
                <select
                  value={deliveryZoneId}
                  onChange={(e) => setDeliveryZoneId(e.target.value)}
                  aria-label="Zone de livraison"
                  className="storefront-input w-full rounded-xl px-3 py-2 text-sm"
                >
                  <option value="">Choisir une zone de livraison</option>
                  {deliveryZones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name} (+{zone.feeTTC.toLocaleString('fr-FR')} FCFA)
                    </option>
                  ))}
                </select>
              ) : null}
              <textarea
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder={
                  fulfillmentMode === 'delivery'
                    ? 'Adresse de livraison'
                    : 'Adresse de livraison (optionnelle)'
                }
                rows={2}
                className="storefront-input w-full resize-none rounded-xl px-3 py-2 text-sm"
              />
              <select
                value={desiredTimeSlot}
                onChange={(e) => setDesiredTimeSlot(e.target.value)}
                aria-label="Créneau souhaité"
                className="storefront-input w-full rounded-xl px-3 py-2 text-sm"
              >
                <option value="">Choisir un créneau horaire</option>
                {DESIRED_TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
              <textarea
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                placeholder="Note client (code portail, instruction de livraison…)"
                rows={2}
                className="storefront-input w-full resize-none rounded-xl px-3 py-2 text-sm"
              />
              {promoFeedback ? (
                <p className="text-xs text-stone-700">{promoFeedback}</p>
              ) : null}
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as StorefrontPaymentMethod)
                }
                aria-label="Mode de paiement"
                className="storefront-input w-full rounded-xl px-3 py-2 text-sm"
              >
                {isPublicStorefront && publicStorefront?.waveEnabled ? (
                  <option value="wave">Wave (paiement immédiat FCFA)</option>
                ) : null}
                <option value="mobile">Mobile Money (OM / MTN / Moov)</option>
                <option value="card">Carte bancaire</option>
                <option value="cash">Espèces à la livraison (FCFA)</option>
              </select>
              {isPublicStorefront &&
              publicStorefront?.waveEnabled &&
              paymentMethod === 'wave' ? (
                <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
                  <img
                    src="/branding/wave-logo.png"
                    alt="Wave"
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                  <p className="text-xs text-sky-900">
                    Vous serez redirigé vers Wave CI pour valider le paiement.
                  </p>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => void handleCheckout()}
                disabled={submitting || cart.length === 0}
                className="storefront-btn-accent w-full rounded-xl px-4 py-2.5 text-sm"
              >
                {submitting
                  ? 'Validation en cours…'
                  : paymentMethod === 'wave'
                    ? 'Payer avec Wave'
                    : 'Valider la commande'}
              </button>
            </div>

            </aside>
          </>
        ) : null}

        <main className="mt-2">
          {topOrderedProducts && topOrderedProducts.length > 0 ? (
            <section className="mb-6">
              <div className="mb-3 flex items-end justify-between gap-3">
                <h2 className="text-lg font-bold tracking-tight text-stone-900">
                  Les plus commandés
                </h2>
                <span className="text-[11px] font-semibold text-stone-500">
                  Top {topOrderedProducts.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {topOrderedProducts.map(({ product, orderedQty }, index) => {
                  const qty = lineQty(product.id)
                  const soldOut = product.stock <= 0
                  const blurb = productCardBlurb(product)
                  return (
                    <article
                      key={product.id}
                      className={`storefront-product-card overflow-hidden rounded-2xl ${
                        soldOut ? 'opacity-70' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setDetailProduct(product)}
                        className="relative block w-full"
                        aria-label={`Voir le détail : ${product.name}`}
                      >
                        <ProductImage
                          product={product}
                          className="h-28 w-full object-cover"
                        />
                        <span className="absolute left-2 top-2 rounded-full bg-stone-900/80 px-2 py-0.5 text-[10px] font-semibold text-white">
                          #{index + 1}
                        </span>
                        {soldOut ? (
                          <span className="absolute right-2 top-2 rounded-full bg-stone-700 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                            Rupture
                          </span>
                        ) : null}
                      </button>
                      <div className="space-y-1 p-2.5">
                        <button
                          type="button"
                          onClick={() => setDetailProduct(product)}
                          className="block w-full text-left"
                        >
                          <p className="line-clamp-2 text-xs font-semibold text-stone-900">
                            {product.name}
                          </p>
                          {blurb ? (
                            <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-stone-500">
                              {blurb}
                            </p>
                          ) : null}
                          <p className="mt-0.5 font-mono-nums text-xs font-bold text-stone-800">
                            {formatFCFA(
                              discountPct > 0
                                ? product.priceTTC * (1 - discountPct / 100)
                                : product.priceTTC,
                            )}
                          </p>
                          <p className="text-[10px] text-stone-500">
                            {orderedQty} commande(s) · panier {qty}
                          </p>
                        </button>
                        <button
                          type="button"
                          disabled={soldOut}
                          onClick={(e) => handleAdd(product, e.currentTarget)}
                          className="storefront-btn-accent mt-1 w-full rounded-lg px-2 py-1.5 text-[11px]"
                        >
                          Ajouter
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ) : null}
          <section ref={productsSectionRef} className="scroll-mt-24">
            {seedReady && storefrontCategories.length > 0 ? (
              <nav
                className="storefront-category-nav"
                aria-label="Catégories du menu"
              >
                <div className="storefront-category-nav-track">
                  <button
                    type="button"
                    className={`storefront-category-chip${
                      selectedCategory === 'all'
                        ? ' storefront-category-chip--active'
                        : ''
                    }`}
                    aria-pressed={selectedCategory === 'all'}
                    onClick={() => selectCategory('all')}
                  >
                    Tous
                    <span className="storefront-category-chip-count">
                      {featuredProducts.length}
                    </span>
                  </button>
                  {storefrontCategories.map((category) => {
                    const count =
                      featuredByCategory.find(([name]) => name === category)?.[1]
                        .length ?? 0
                    return (
                      <button
                        key={category}
                        type="button"
                        className={`storefront-category-chip${
                          selectedCategory === category
                            ? ' storefront-category-chip--active'
                            : ''
                        }`}
                        aria-pressed={selectedCategory === category}
                        onClick={() => selectCategory(category)}
                      >
                        {category}
                        <span className="storefront-category-chip-count">
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </nav>
            ) : null}
            {!seedReady ? (
              <div className="mt-6 flex flex-col items-center gap-3 py-8">
                <div className="relative flex h-20 w-20 items-center justify-center">
                  <span
                    className="absolute inset-0 rounded-full border-2 opacity-40"
                    style={{ borderColor: 'var(--storefront-accent)' }}
                  />
                  <BrandLogo
                    size="xl"
                    alt="Chargement catalogue"
                    ring="gold"
                    className="animate-pulse"
                  />
                </div>
                <p className="text-sm text-stone-500">Chargement du catalogue…</p>
              </div>
            ) : (
              <div className="space-y-8">
                {visibleCategorySections.map(([category, products]) => (
                  <section key={category} className="storefront-category-section space-y-3">
                    <div className="storefront-category-heading">
                      <h2>{category}</h2>
                      <span>
                        {products.length} article{products.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div
                      className={`${
                        cardDensity === 'compact'
                          ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
                          : 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'
                      }`}
                    >
                      {products.map((product) => {
                        const qty = lineQty(product.id)
                        const soldOut = product.stock <= 0
                        const blurb = productCardBlurb(product)
                        return (
                          <article
                            key={product.id}
                            className={`storefront-product-card group overflow-hidden rounded-2xl ${
                              soldOut ? 'opacity-70' : ''
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setDetailProduct(product)}
                              className="relative block w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                              aria-label={`Voir le détail : ${product.name}`}
                            >
                              <ProductImage
                                product={product}
                                className={`w-full object-cover ${
                                  cardDensity === 'compact'
                                    ? 'h-32 sm:h-36'
                                    : 'h-40 sm:h-44'
                                }`}
                              />
                              {soldOut ? (
                                <span className="absolute right-2 top-2 rounded-full bg-stone-800 px-2 py-1 text-[10px] font-semibold uppercase text-white">
                                  Rupture
                                </span>
                              ) : null}
                            </button>
                            <div className={cardDensity === 'compact' ? 'p-2.5' : 'p-3'}>
                              <button
                                type="button"
                                onClick={() => setDetailProduct(product)}
                                className="block w-full cursor-pointer text-left"
                              >
                                <h3 className="line-clamp-2 text-sm font-semibold text-stone-900">
                                  {product.name}
                                </h3>
                                {blurb && cardDensity !== 'compact' ? (
                                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-stone-500">
                                    {blurb}
                                  </p>
                                ) : null}
                                <p className="mt-1 font-mono-nums text-sm font-bold text-stone-900">
                                  {formatFCFA(
                                    discountPct > 0
                                      ? product.priceTTC * (1 - discountPct / 100)
                                      : product.priceTTC,
                                  )}
                                </p>
                                {qty > 0 ? (
                                  <p className="mt-0.5 text-[11px] text-stone-500">
                                    Dans le panier : {qty}
                                  </p>
                                ) : null}
                              </button>
                              <button
                                type="button"
                                disabled={soldOut}
                                onClick={(e) => handleAdd(product, e.currentTarget)}
                                className="storefront-btn-accent mt-2 w-full rounded-xl px-3 py-2 text-xs"
                              >
                                Ajouter
                              </button>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
            {seedReady && featuredProducts.length === 0 ? (
              <p className="mt-8 text-sm text-stone-500">Aucun article disponible.</p>
            ) : null}
            {seedReady &&
            featuredProducts.length > 0 &&
            visibleCategorySections.length === 0 ? (
              <p className="mt-8 text-sm text-stone-500">
                Aucun article dans cette catégorie.
              </p>
            ) : null}
          </section>

          <section
            ref={contactRef}
            id="contact"
            className="mt-10 scroll-mt-24 rounded-2xl border border-stone-200 bg-white p-5 sm:p-7"
          >
            <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">
                  Restons en contact
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
                  Une question ? Une commande spéciale ?
                </h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-stone-600">
                  Notre équipe vous répond du lundi au samedi. Pour les
                  livraisons groupées, événements ou demandes professionnelles,
                  contactez-nous directement.
                </p>

                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                  {contactPhone && telHref ? (
                    <li>
                      <a
                        href={telHref}
                        className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 transition hover:border-stone-300"
                      >
                        <span
                          aria-hidden
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-200 text-stone-800"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-4 w-4"
                          >
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />
                          </svg>
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                            Téléphone
                          </span>
                          <span className="block font-mono-nums text-sm font-semibold text-stone-900">
                            {contactPhone}
                          </span>
                          <span className="block text-[11px] text-stone-500">
                            Appel direct
                          </span>
                        </span>
                      </a>
                    </li>
                  ) : null}
                  {whatsappHref && contactWhatsappLabel ? (
                    <li>
                      <a
                        href={whatsappHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 transition hover:border-stone-300"
                      >
                        <span
                          aria-hidden
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="h-4 w-4"
                          >
                            <path d="M20.52 3.48A11.86 11.86 0 0 0 12.04 0C5.46 0 .12 5.34.12 11.92c0 2.1.55 4.15 1.6 5.96L0 24l6.3-1.66a11.9 11.9 0 0 0 5.74 1.46h.01c6.58 0 11.92-5.34 11.92-11.92 0-3.18-1.24-6.18-3.45-8.4ZM12.04 21.78h-.01a9.86 9.86 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.85 9.85 0 0 1-1.51-5.23c0-5.45 4.43-9.88 9.89-9.88a9.83 9.83 0 0 1 7 2.9 9.82 9.82 0 0 1 2.9 7c0 5.45-4.44 9.88-9.9 9.88Zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.49-.9-.8-1.5-1.78-1.67-2.08-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.03 1-1.03 2.45 0 1.45 1.06 2.85 1.21 3.05.15.2 2.08 3.18 5.04 4.46.7.3 1.25.48 1.68.62.7.22 1.34.19 1.84.12.56-.08 1.76-.72 2.01-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z" />
                          </svg>
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                            WhatsApp
                          </span>
                          <span className="block font-mono-nums text-sm font-semibold text-stone-900">
                            {contactWhatsappLabel}
                          </span>
                          <span className="block text-[11px] text-emerald-700">
                            Message instantané
                          </span>
                        </span>
                      </a>
                    </li>
                  ) : null}
                  {shopEmail ? (
                    <li>
                      <a
                        href={`mailto:${shopEmail}`}
                        className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 transition hover:border-stone-300"
                      >
                        <span
                          aria-hidden
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-200 text-stone-800"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-4 w-4"
                          >
                            <rect x="3" y="5" width="18" height="14" rx="2" />
                            <path d="m3 7 9 6 9-6" />
                          </svg>
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                            Email
                          </span>
                          <span className="block truncate text-sm font-semibold text-stone-900">
                            {shopEmail}
                          </span>
                          <span className="block text-[11px] text-stone-500">
                            Réponse sous 24 h
                          </span>
                        </span>
                      </a>
                    </li>
                  ) : null}
                  {contactAddress ? (
                    <li>
                      <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3">
                        <span
                          aria-hidden
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-200 text-stone-800"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-4 w-4"
                          >
                            <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                            Adresse
                          </span>
                          <span className="block text-sm font-semibold text-stone-900">
                            {contactAddress}
                          </span>
                          {mapsHref ? (
                            <a
                              href={mapsHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-stone-700 underline decoration-dotted underline-offset-2 hover:text-stone-900"
                            >
                              Voir l&apos;itinéraire
                            </a>
                          ) : null}
                        </span>
                      </div>
                    </li>
                  ) : null}
                </ul>

                {!hasContactDetails ? (
                  <p className="mt-6 text-sm text-stone-500">
                    Les coordonnées de contact seront affichées ici une fois
                    renseignées par le commerçant.
                  </p>
                ) : null}

                {contactOpeningHours ? (
                  <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      Horaires d&apos;ouverture
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm text-stone-800">
                      {contactOpeningHours}
                    </p>
                  </div>
                ) : null}
              </div>

              {shopEmail ? (
              <form
                onSubmit={submitContact}
                className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
                  Écrivez-nous
                </p>
                <h3 className="mt-1 text-lg font-semibold text-stone-900">
                  Message rapide
                </h3>
                <p className="mt-1 text-xs text-stone-500">
                  Votre client mail s&apos;ouvrira pré-rempli.
                </p>

                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      Nom *
                    </span>
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Votre nom"
                      required
                      className="storefront-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      Email
                    </span>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="vous@domaine.com"
                      className="storefront-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                      Message *
                    </span>
                    <textarea
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                      placeholder="Votre demande, commande spéciale, événement…"
                      rows={4}
                      required
                      className="storefront-input mt-1 w-full resize-none rounded-xl px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={!contactName.trim() || !contactMessage.trim()}
                  className="storefront-btn-accent mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Envoyer le message
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <path d="m22 2-11 11" />
                    <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
                  </svg>
                </button>
                {contactSent ? (
                  <p
                    role="status"
                    className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
                  >
                    Votre client mail s&apos;est ouvert. Si rien ne s&apos;affiche,
                    écrivez directement à{' '}
                    <span className="font-semibold">{shopEmail}</span>.
                  </p>
                ) : null}

                <p className="mt-3 text-[11px] text-stone-500">
                  En soumettant, vous acceptez d&apos;être recontacté à propos de
                  votre demande.
                </p>
              </form>
              ) : (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 sm:p-5">
                  <p className="text-sm text-stone-600">
                    Le formulaire de contact sera disponible lorsque le
                    commerçant aura renseigné une adresse email.
                  </p>
                </div>
              )}
            </div>
          </section>
        </main>

        <footer className="mt-10 border-t border-stone-200 pt-6 pb-2">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={shopTitle}
                  className="h-16 w-16 rounded-2xl object-cover ring-1 ring-stone-200 bg-white"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <BrandLogo size="xl" alt={BRAND_NAME} ring="gold" />
              )}
              <p className="mt-2 text-sm font-semibold text-stone-900">{shopTitle}</p>
              {footerTagline ? (
                <p className="mt-1 text-sm text-stone-600">{footerTagline}</p>
              ) : null}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-600">
                Navigation
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={scrollToProducts}
                  className="rounded-lg border border-stone-300 px-2 py-1 text-[11px] text-stone-700 transition hover:border-stone-400 hover:bg-stone-100"
                >
                  Produits
                </button>
                <button
                  type="button"
                  onClick={openCart}
                  className="rounded-lg border border-stone-300 px-2 py-1 text-[11px] text-stone-700 transition hover:border-stone-400 hover:bg-stone-100"
                >
                  Panier
                </button>
                <button
                  type="button"
                  onClick={scrollToCheckoutForm}
                  className="rounded-lg border border-stone-300 px-2 py-1 text-[11px] text-stone-700 transition hover:border-stone-400 hover:bg-stone-100"
                >
                  Commander
                </button>
                <button
                  type="button"
                  onClick={scrollToContact}
                  className="rounded-lg border border-stone-300 px-2 py-1 text-[11px] font-semibold text-stone-800 transition hover:bg-stone-100"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--storefront-accent) 45%, #d6d3d1)',
                    backgroundColor: 'color-mix(in srgb, var(--storefront-accent) 12%, white)',
                  }}
                >
                  Contact
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-600">
                Contact & Horaires
              </p>
              {contactPhone && telHref ? (
                <a
                  href={telHref}
                  className="mt-2 block text-sm text-stone-800 hover:text-stone-900"
                >
                  {contactPhone}
                </a>
              ) : null}
              {shopEmail ? (
                <a
                  href={`mailto:${shopEmail}`}
                  className="block text-sm text-stone-800 hover:text-stone-900"
                >
                  {shopEmail}
                </a>
              ) : null}
              {contactOpeningHours ? (
                <p className="mt-1 whitespace-pre-line text-xs text-stone-500">
                  {contactOpeningHours}
                </p>
              ) : null}
              {!contactPhone && !shopEmail && !contactOpeningHours ? (
                <p className="mt-2 text-sm text-stone-500">—</p>
              ) : null}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-600">
                Mentions
              </p>
              {legalMentions ? (
                <p className="mt-2 whitespace-pre-line text-sm text-stone-600">
                  {legalMentions}
                </p>
              ) : (
                <p className="mt-2 text-sm text-stone-500">
                  Informations légales à venir.
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-stone-200 pt-3 text-[11px] text-stone-500">
            <p>Propulsé par {BRAND_NAME}</p>
          </div>
        </footer>
      </div>
      {itemCount > 0 ? (
        <div
          className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] left-1/2 z-20 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl shadow-stone-900/15 lg:hidden"
        >
          <button
            type="button"
            onClick={openCart}
            className="storefront-btn-accent flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2 text-left"
          >
            <span className="text-sm font-bold">{formatFCFA(grandTotalTTC)}</span>
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <span
                className={`inline-flex min-w-6 items-center justify-center rounded-full bg-stone-900 px-1.5 py-0.5 text-[10px] font-bold text-white transition ${
                  cartBadgePulse ? 'animate-pulse' : ''
                }`}
              >
                {itemCount}
              </span>
              <CartIcon className="h-4 w-4" />
            </span>
          </button>
        </div>
      ) : null}
      {flyToCart ? (
        <img
          src={flyToCart.src}
          alt=""
          aria-hidden
          className="pointer-events-none fixed z-40 h-10 w-10 rounded-lg border border-white object-cover shadow-xl shadow-stone-900/40"
          style={{
            left: flyToCart.x - 20,
            top: flyToCart.y - 20,
            transform: flyToCart.active
              ? `translate(${flyToCart.dx}px, ${flyToCart.dy}px) scale(0.28)`
              : 'translate(0px, 0px) scale(1)',
            opacity: flyToCart.active ? 0.25 : 0.98,
            transition:
              'transform 560ms cubic-bezier(0.2, 0.9, 0.2, 1), opacity 560ms ease',
          }}
        />
      ) : null}

      <ProductDetailModal
        product={detailProduct}
        cartQty={detailProduct ? lineQty(detailProduct.id) : 0}
        allProducts={featuredProducts}
        variant="storefront"
        onClose={() => setDetailProduct(null)}
        onAdd={(p, q) => {
          for (let i = 0; i < q; i++) handleAdd(p)
        }}
        onSelect={(p) => setDetailProduct(p)}
      />
    </div>
  )
}
