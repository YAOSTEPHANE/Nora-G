/** Libellé de catégorie (défaut + catégories ajoutées par l’utilisateur). */
export type ProductCategory = string

/** @deprecated Préférer DOMAIN_CATEGORIES / categoriesForDomain — retail par défaut. */
export const DEFAULT_PRODUCT_CATEGORIES = [
  'Boissons',
  'Alimentation',
  'Hygiène',
  'Épicerie',
  'Divers boutique',
  'Autre',
] as const

/** Catégories proposées (liste plate historique — le pack actif dépend du domaine). */
export const PRODUCT_CATEGORY_LIST: ProductCategory[] = [
  ...DEFAULT_PRODUCT_CATEGORIES,
]

/** Unité de vente (quincaillerie / vrac). */
export type SaleUnit =
  | 'piece'
  | 'm'
  | 'kg'
  | 'l'
  | 'pack'
  | 'box'
  | 'set'

export const SALE_UNIT_OPTIONS: { id: SaleUnit; label: string; short: string }[] =
  [
    { id: 'piece', label: 'Pièce', short: 'pce' },
    { id: 'm', label: 'Mètre', short: 'm' },
    { id: 'kg', label: 'Kilogramme', short: 'kg' },
    { id: 'l', label: 'Litre', short: 'L' },
    { id: 'pack', label: 'Paquet', short: 'paq.' },
    { id: 'box', label: 'Boîte', short: 'boîte' },
    { id: 'set', label: 'Lot / set', short: 'lot' },
  ]

/** Ligne de la table Dexie `productCategories` (ordre d’affichage). */
export interface ProductCategoryRow {
  id: string
  name: string
  sortOrder: number
}

/** Produit + stock sur un magasin donné (affichage caisse / listes). */
export type ProductWithStock = Product & { stock: number }

export interface Store {
  id: string
  name: string
  shortCode: string
  sortOrder: number
  /** Masqué du sélecteur ; stocks et ventes historiques conservés. */
  archived?: boolean
  /**
   * `warehouse` = entrepôt central (réassort).
   * Défaut / absent = boutique de vente.
   */
  kind?: 'store' | 'warehouse'
}

export interface StoreStock {
  id: string
  storeId: string
  productId: string
  stock: number
}

export type KitchenStockUnit = 'kg' | 'g' | 'l' | 'ml' | 'piece'

export interface KitchenIngredient {
  id: string
  name: string
  unit: KitchenStockUnit
  lowStockThreshold: number
  /** Produit catalogue source (matière première liée). */
  productId?: string
  archived?: boolean
}

export interface KitchenIngredientStock {
  id: string
  storeId: string
  ingredientId: string
  stock: number
}

/** Quantité d'ingrédient consommée par 1 unité de produit vendu. */
export interface ProductRecipeIngredient {
  id: string
  productId: string
  ingredientId: string
  qtyPerUnit: number
}

export interface StockLocation {
  id: string
  storeId: string
  name: string
  code: string
  sortOrder: number
  active: boolean
}

export interface LocationStock {
  id: string
  storeId: string
  locationId: string
  productId: string
  stock: number
}

export interface StockLocationTransfer {
  id: string
  createdAt: number
  storeId: string
  productId: string
  fromLocationId: string
  toLocationId: string
  qty: number
  note?: string
  createdByProfileId?: string
}

export type DiningTableStatus = 'free' | 'occupied' | 'reserved' | 'cleaning'

export interface DiningTable {
  id: string
  storeId: string
  name: string
  capacity: number
  area?: string
  status: DiningTableStatus
  occupiedSince?: number
  note?: string
  sortOrder: number
}

export type TableReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'seated'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export interface TableReservation {
  id: string
  storeId: string
  tableId: string
  customerName: string
  customerPhone?: string
  guests: number
  startAt: number
  endAt: number
  status: TableReservationStatus
  notes?: string
  createdAt: number
  updatedAt: number
}

export interface Promotion {
  id: string
  code: string
  label: string
  discountPct: number
  active: boolean
  startAt?: number
  endAt?: number
  minCartTTC?: number
  storeId?: string
  usageCount: number
  maxUsage?: number
  createdAt: number
  updatedAt: number
}

export interface LoyaltyCustomer {
  id: string
  phone: string
  displayName?: string
  points: number
  totalSpentTTC: number
  visitCount: number
  createdAt: number
  updatedAt: number
  /** Conservé pour l’historique ventes ; masqué des listes actives. */
  archived?: boolean
  /** Encours client (dette envers le magasin), FCFA. */
  creditBalanceTTC?: number
  /** Plafond d’encours autorisé, FCFA. */
  creditLimitTTC?: number
}

/** Mouvement de compte client (crédit / règlement). */
export interface CustomerCreditEntry {
  id: string
  customerId: string
  createdAt: number
  /** sale = vente à crédit (+), payment = règlement (−), adjustment = ajustement. */
  type: 'sale' | 'payment' | 'adjustment'
  amountTTC: number
  balanceAfterTTC: number
  saleId?: string
  note?: string
  actorProfileId?: string
  actorDisplayName?: string
  storeId?: string
}

export interface LoyaltyTransaction {
  id: string
  customerId: string
  saleId?: string
  createdAt: number
  type: 'earn' | 'redeem' | 'adjustment'
  points: number
  amountTTC?: number
  note?: string
  actorProfileId?: string
}

export type HrRequestStatus = 'pending' | 'approved' | 'rejected'

export type HrRequestType = 'leave' | 'advance' | 'expense'

export interface HrRequest {
  id: string
  createdAt: number
  staffProfileId: string
  staffDisplayName: string
  storeId?: string
  type: HrRequestType
  startDate?: string
  endDate?: string
  amountFCFA?: number
  reason: string
  status: HrRequestStatus
  reviewedAt?: number
  reviewedByProfileId?: string
  reviewedByDisplayName?: string
  reviewNote?: string
}

export type CrmInteractionKind =
  | 'call'
  | 'sms'
  | 'whatsapp'
  | 'email'
  | 'visit'
  | 'note'

export interface CrmInteraction {
  id: string
  createdAt: number
  customerId: string
  customerPhone: string
  customerName?: string
  kind: CrmInteractionKind
  note: string
  nextActionAt?: number
  actorProfileId?: string
  actorDisplayName?: string
}

/** Campagne WhatsApp ciblée (relance, invitation, réactivation…). */
export type WhatsAppCampaignKind =
  | 'promo'
  | 'relance'
  | 'invitation'
  | 'reactivation'
  | 'custom'

export type WhatsAppCampaignStatus =
  | 'draft'
  | 'ready'
  | 'completed'
  | 'cancelled'

export type WhatsAppMessageStatus =
  | 'pending'
  | 'sent'
  | 'failed'
  | 'skipped'

export interface WhatsAppCampaign {
  id: string
  storeId: string
  storeName?: string
  name: string
  kind: WhatsAppCampaignKind
  status: WhatsAppCampaignStatus
  messageTemplate: string
  /**
   * Ciblage : all | vip | inactive | product | store | spend | frequency | manual
   */
  audience:
    | 'all'
    | 'vip'
    | 'inactive'
    | 'product'
    | 'store'
    | 'spend'
    | 'frequency'
    | 'manual'
  inactiveDays?: number
  productId?: string
  minSpendTTC?: number
  minFrequency?: number
  /** IDs clientes si audience = manual */
  manualCustomerIds?: string[]
  /** Code promo lié pour mesurer le CA généré. */
  promoCode?: string
  /** Fenêtre d’attribution (jours) après envoi / démarrage. */
  attributionWindowDays?: number
  createdAt: number
  updatedAt: number
  completedAt?: number
  createdByProfileId?: string
  createdByDisplayName?: string
  targetedCount: number
  sentCount: number
  failedCount: number
  openedCount: number
}

export type MarketingCampaignStatus =
  | 'draft'
  | 'active'
  | 'ended'
  | 'cancelled'

export type MarketingCampaignAudience =
  | 'all'
  | 'vip'
  | 'inactive'
  | 'product'
  | 'store'
  | 'spend'
  | 'frequency'
  | 'manual'

/**
 * Campagne marketing / fidélisation : segment + promo + mesure du CA.
 */
export interface MarketingCampaign {
  id: string
  storeId: string
  storeName?: string
  name: string
  status: MarketingCampaignStatus
  description?: string
  audience: MarketingCampaignAudience
  inactiveDays?: number
  productId?: string
  minSpendTTC?: number
  minFrequency?: number
  manualCustomerIds?: string[]
  /** Code promo de suivi (recommandé pour mesurer le CA). */
  promoCode?: string
  promotionId?: string
  /** Remise % si création auto du code promo. */
  discountPct?: number
  attributionWindowDays: number
  /** Campagne WhatsApp liée (optionnel). */
  whatsappCampaignId?: string
  targetedCount: number
  startedAt?: number
  endedAt?: number
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
  /** Dernières métriques calculées (cache). */
  attributedCaTTC?: number
  attributedSalesCount?: number
  attributedCustomersCount?: number
  promoCaTTC?: number
  audienceCaTTC?: number
  lastMetricsAt?: number
}

export interface WhatsAppCampaignMessage {
  id: string
  campaignId: string
  customerId: string
  customerName: string
  customerPhone: string
  body: string
  status: WhatsAppMessageStatus
  createdAt: number
  sentAt?: number
  openedAt?: number
  error?: string
}

export type TicketInvoiceKind = 'ticket' | 'facture'

export type TicketInvoiceStatus = 'draft' | 'issued' | 'paid' | 'cancelled'

export interface TicketInvoice {
  id: string
  createdAt: number
  updatedAt: number
  reference: string
  kind: TicketInvoiceKind
  status: TicketInvoiceStatus
  storeId?: string
  storeName?: string
  customerName?: string
  customerPhone?: string
  notes?: string
  dueAt?: number
  issuedAt?: number
  paidAt?: number
  currency: 'XOF'
  lines: SaleLine[]
  subtotalHT: number
  tva: number
  totalTTC: number
  linkedSaleId?: string
  createdByProfileId?: string
  createdByDisplayName?: string
  updatedByProfileId?: string
  updatedByDisplayName?: string
}

export interface TerminalNode {
  id: string
  label: string
  storeId?: string
  storeName?: string
  profileId?: string
  profileDisplayName?: string
  lastSeenAt: number
  lastSyncAt?: number
  pendingSyncCount: number
  online: boolean
  appVersion?: string
}

export interface StockTransfer {
  id: string
  createdAt: number
  fromStoreId: string
  toStoreId: string
  productId: string
  /** Libellé figé au moment du transfert. */
  productName?: string
  qty: number
  note?: string
  reference?: string
  /** completed = stock déjà déplacé (flux immédiat caisse). */
  status?: 'completed' | 'cancelled'
  createdByProfileId?: string
}

/** Entrée / sortie pointage (magasin courant au moment du pointage). */
export type TimePunchKind = 'in' | 'out'
export type TimePunchSource = 'self' | 'manager'

export interface TimePunch {
  id: string
  createdAt: number
  profileId: string
  /** Libellé figé au moment du pointage (historique si le profil change). */
  profileDisplayName: string
  storeId: string
  storeName?: string
  kind: TimePunchKind
  note?: string
  /** Origine du pointage (auto par défaut = self). */
  source?: TimePunchSource
  addedByProfileId?: string
  addedByDisplayName?: string
}

export interface Product {
  id: string
  name: string
  /** Prix unitaire TTC en FCFA */
  priceTTC: number
  /** Prix de revient TTC unitaire (optionnel) — pour marge analytique. */
  purchasePriceTTC?: number
  category: ProductCategory
  barcode: string
  lowStockThreshold: number
  /** Taux de TVA en % (ex. 18). Sert à ventiler HT / TVA sur le ticket. */
  vatRatePct: number
  /** Aperçu catalogue / grille caisse (data URL locale ou URL https — ex. Vercel Blob). */
  imageDataUrl?: string
  imageUrl?: string
  /**
   * Texte boutique (fiche produit). Si absent, une description automatique
   * peut être proposée à partir du nom / catégorie.
   */
  description?: string
  /** Points forts boutique (puces), max ~5 en UI. */
  highlights?: string[]
  /** Masqué de la caisse ; réactivable depuis le catalogue. */
  archived: boolean
  /**
   * Domaine métier du produit (pharmacie, quincaillerie…).
   * Filtre catalogue / caisse selon le domaine actif.
   */
  businessDomain?:
    | 'retail'
    | 'pharmacy'
    | 'it'
    | 'hardware'
    | 'restaurant'
    | 'bakery'
    | 'beauty'
    | 'wholesale'
    | 'fashion'
    | 'hotel'
  /** Pharmacie : vente soumise à ordonnance. */
  requiresPrescription?: boolean
  /** Pharmacie : stock géré par lots (n° lot + DLC). */
  trackLots?: boolean
  /** Informatique : stock unitaire par n° de série / IMEI. */
  trackSerialNumbers?: boolean
  /** Quincaillerie : unité de vente (pièce, m, kg…). Défaut = pièce. */
  saleUnit?: SaleUnit
  /**
   * Quincaillerie : quantités décimales (câble au mètre, peinture au L, vrac au kg).
   * Incompatible avec le suivi n° de série.
   */
  allowFractionalQty?: boolean
  /** Quincaillerie : contenu d’un conditionnement (ex. 100 vis / boîte). */
  packContentQty?: number
  /** Libellé du contenu (ex. « vis », « clous »). */
  packContentLabel?: string
  /** Marque / fabricant. */
  brand?: string
  /** Référence fournisseur / catalogue. */
  supplierRef?: string
  /** Si true, le stock magasin est la somme des variantes. */
  hasVariants?: boolean
  /**
   * Champs des sections de formulaire personnalisées (par activité).
   * Clé = ProductFormField.key
   */
  customFields?: Record<string, string | number | boolean | null>
}

/** Type de champ dans une section formulaire article. */
export type ProductFormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'boolean'
  | 'date'

export interface ProductFormField {
  id: string
  /** Clé de stockage dans product.customFields */
  key: string
  label: string
  type: ProductFormFieldType
  required?: boolean
  hint?: string
  placeholder?: string
  /** Options pour type select */
  options?: string[]
  /** Largeur grille (1–3 colonnes selon la section) */
  span?: 1 | 2 | 3
}

/** Section du formulaire article, scoped à une activité métier. */
export interface ProductFormSection {
  id: string
  domain:
    | 'retail'
    | 'pharmacy'
    | 'it'
    | 'hardware'
    | 'restaurant'
    | 'bakery'
    | 'beauty'
    | 'wholesale'
    | 'fashion'
    | 'hotel'
  title: string
  description?: string
  sortOrder: number
  columns: 1 | 2 | 3
  fields: ProductFormField[]
  active: boolean
  /** true = section fournie par défaut (modifiables) */
  isDefault?: boolean
  createdAt: number
  updatedAt: number
}

/** Variante produit (taille, couleur, conditionnement…). */
export interface ProductVariant {
  id: string
  productId: string
  /** Ex. « M / Rouge », « 50 cl », « Pack 6 ». */
  label: string
  sku?: string
  barcode?: string
  /** Surcoût ou prix dédié ; sinon prix produit. */
  priceTTC?: number
  active: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

/** Stock d’une variante sur un magasin. */
export interface VariantStoreStock {
  id: string
  storeId: string
  productId: string
  variantId: string
  stock: number
}

/** Lot pharmacie — traçabilité péremption (FEFO à la caisse). */
export interface ProductLot {
  id: string
  productId: string
  storeId: string
  lotNumber: string
  /** Date limite de consommation ISO (YYYY-MM-DD). */
  expiryDate: string
  qty: number
  receivedAt?: number
}

export type SerialUnitStatus =
  | 'in_stock'
  | 'sold'
  | 'reserved'
  | 'returned'
  | 'warranty'

/** Unité sérialisée (informatique / téléphonie). */
export interface ProductSerialUnit {
  id: string
  productId: string
  storeId: string
  serialNumber: string
  imei?: string
  /** Fin de garantie ISO (YYYY-MM-DD). */
  warrantyUntil?: string
  status: SerialUnitStatus
  saleId?: string
  soldAt?: number
  notes?: string
}

/** Ordonnance liée à une vente (produits soumis à prescription). */
export interface Prescription {
  id: string
  /** Absent pour une saisie manuelle (registre pharmacie). */
  saleId?: string
  storeId: string
  patientName: string
  patientPhone?: string
  prescriberName?: string
  prescriptionNumber?: string
  /** Date de délivrance ISO (YYYY-MM-DD). */
  issuedAt?: string
  notes?: string
  /** Tiers payant / mutuelle (optionnel). */
  mutuelleName?: string
  mutuelleCoveragePct?: number
  mutuelleAmountTTC?: number
  createdAt: number
  createdByProfileId?: string
}

export interface LotAllocation {
  lotId: string
  lotNumber: string
  expiryDate: string
  qty: number
}

export type PaymentMethod = 'cash' | 'card' | 'mobile' | 'credit' | 'mixed'

export type MobileMoneyOperator = 'orange' | 'mtn' | 'wave' | 'moov'

/** Ventilation TTC d’une vente (simple ou mixte). */
export interface SalePaymentSplit {
  cash: number
  card: number
  mobile: number
  mobileOperator?: MobileMoneyOperator
  /** Numéro client mobile money (E.164 +225…). */
  mobilePhone?: string
}

export interface CartLine {
  productId: string
  name: string
  unitPriceTTC: number
  qty: number
  vatRatePct: number
  lotAllocations?: LotAllocation[]
  serialUnitIds?: string[]
  serialNumbers?: string[]
  /** Variante vendue (taille / couleur…) si le produit en a. */
  variantId?: string
  variantLabel?: string
}

export interface SaleLine {
  productId: string
  name: string
  unitPriceTTC: number
  qty: number
  /** Taux TVA % au moment de la vente (traçabilité). */
  vatRatePct?: number
  lotAllocations?: LotAllocation[]
  serialNumbers?: string[]
  imeiNumbers?: string[]
  variantId?: string
  variantLabel?: string
}

export type OnlineOrderStatus = 'pending' | 'approved' | 'rejected'

export type OnlineOrderPlatform =
  | 'native'
  | 'glovo'
  | 'ubereats'
  | 'jumia'
  | 'shopify'
  | 'whatsapp'
  | 'web_storefront'

export type DeliveryStatus =
  | 'queued'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | 'cancelled'

export type KitchenStatus =
  | 'queued'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'cancelled'

export type KitchenPriority = 'low' | 'normal' | 'high'

export interface OnlineOrder {
  id: string
  createdAt: number
  storeId: string
  storeName?: string
  customerName: string
  customerPhone?: string
  customerAddress?: string
  customerNote?: string
  desiredTimeSlot?: string
  paymentMethod: PaymentMethod
  lines: SaleLine[]
  subtotalHT: number
  tva: number
  totalTTC: number
  netProductsTTC?: number
  discountPct?: number
  promoCode?: string
  deliveryFeeTTC?: number
  deliveryZoneId?: string
  deliveryZoneName?: string
  fulfillmentMode?: 'pickup' | 'delivery'
  status: OnlineOrderStatus
  sourcePlatform?: OnlineOrderPlatform
  externalOrderRef?: string
  importedAt?: number
  reviewedAt?: number
  reviewedByProfileId?: string
  reviewedByDisplayName?: string
  reviewNote?: string
  /** Message destiné au client (SMS/WhatsApp/canal externe). */
  customerMessage?: string
  /** Note interne visible uniquement par l’équipe. */
  internalMessage?: string
  messageUpdatedAt?: number
  messageUpdatedByProfileId?: string
  messageUpdatedByDisplayName?: string
  customerNotifiedAt?: number
  customerNotificationStatus?: 'sent' | 'failed'
  customerNotificationError?: string
  deliveryStatus?: DeliveryStatus
  deliveryProvider?: string
  deliveryTrackingCode?: string
  deliveryRiderName?: string
  deliveryEtaAt?: number
  deliveryLastEvent?: string
  deliveryUpdatedAt?: number
  kitchenStatus?: KitchenStatus
  kitchenPriority?: KitchenPriority
  kitchenStation?: string
  kitchenTicketCode?: string
  kitchenUpdatedAt?: number
  /** Horodatage de la déduction de stock produit (vente / préparation). */
  stockDeductedAt?: number
  /** Horodatage de la déduction des ingrédients cuisine (recettes). */
  kitchenIngredientDeductedAt?: number
}

export interface OnlineOrderMessage {
  id: string
  orderId: string
  createdAt: number
  authorProfileId: string
  authorDisplayName: string
  customerMessage?: string
  internalMessage?: string
}

export interface Sale {
  id: string
  createdAt: number
  lines: SaleLine[]
  subtotalHT: number
  tva: number
  totalTTC: number
  discountPct: number
  paymentMethod: PaymentMethod
  /** Ventilation par canal ; les anciennes ventes peuvent s’en passer (déduit de paymentMethod). */
  paymentSplit?: SalePaymentSplit
  /** Espèces : montant remis par le client (pour monnaie). */
  cashReceived?: number
  /** Monnaie à rendre (cashReceived − part espèces). */
  changeDue?: number
  /** Référence transaction TPE (démo / saisie caisse). */
  cardTpeReference?: string
  /** Référence opérateur mobile money (démo / saisie). */
  mobileMoneyReference?: string
  synced: boolean
  /** Magasin où la vente a été enregistrée. */
  storeId?: string
  storeName?: string
  /** Table associée à la vente (service sur place). */
  tableId?: string
  tableName?: string
  /** Utilisateur connecté au moment de la vente (reçu / rapport). */
  cashierProfileId?: string
  cashierDisplayName?: string
  /** Cumul des remboursements TTC (pour CA net). */
  refundsTotalTTC?: number
  /** Quantités déjà remboursées par produit (clé = productId). */
  refundedLineQty?: Record<string, number>
  promoCode?: string
  loyaltyCustomerId?: string
  loyaltyCustomerPhone?: string
  loyaltyPointsEarned?: number
  loyaltyPointsRedeemed?: number
  loyaltyDiscountTTC?: number
  /**
   * Facture Normalisée Électronique (CI) générée à l’encaissement
   * à partir des lignes / totaux de la vente (sans double saisie).
   */
  fne?: {
    invoiceNumber: string
    issuedAt: number
    nif: string | null
    regime: string
    status: 'issued'
  }
}

/** Remboursement enregistré (traçabilité). */
export interface RefundRecord {
  id: string
  createdAt: number
  saleId: string
  amountTTC: number
  reason: string
  actorProfileId: string
  actorDisplayName: string
  lineAdjustments: { productId: string; qty: number }[]
}

/** Journal d’audit append-only (horodaté, non modifiable depuis l’app). */
export type AuditEventKind =
  | 'cart_cancelled'
  | 'sale_refund'
  | 'sale_void'
  | 'sale_exchange'
  | 'promo_applied'
  | 'discount_override'
  | 'stock_adjusted'
  | 'stock_transfer'
  | 'product_deleted'
  | 'time_punch'
  | 'ticket_invoice_updated'
  | 'day_closure'
  | 'day_reopen'
  | 'price_changed'
  | 'customer_return'
  | 'shrinkage'

export interface AuditEvent {
  id: string
  createdAt: number
  kind: AuditEventKind
  actorProfileId: string
  actorDisplayName: string
  /** Motif obligatoire pour remboursement ; recommandé pour annulation panier. */
  reason: string
  relatedSaleId?: string
  payloadJson: string
}

export interface SyncQueueItem {
  id?: number
  kind: 'sale' | 'stock' | 'product'
  payload: string
  createdAt: number
}

/**
 * État du jour pour le rapport de caisse : fond de caisse, clôture, instantanés.
 * Clé primaire = dateYmd (jour local).
 */
export interface DayClosure {
  dateYmd: string
  /** Fond de caisse en espèces au début de journée (FCFA). */
  openingFloat: number
  /** Horodatage de la clôture ; absent = journée ouverte. */
  closedAt?: number
  snapshotTotalTTC?: number
  snapshotTransactionCount?: number
  snapshotCash?: number
  snapshotCard?: number
  snapshotMobile?: number
  snapshotCashCount?: number
  snapshotCardCount?: number
  snapshotMobileCount?: number
  /** Total des sorties de caisse (espèces) figé à la clôture. */
  snapshotCashOutflows?: number
  /** openingFloat + encaissements espèces − sorties au moment de la clôture. */
  expectedCashAtClose?: number
  /** Montant physique compté en caisse à la clôture (optionnel). */
  countedCash?: number
  /** countedCash - expectedCashAtClose */
  cashDifference?: number
  note?: string
  closedByProfileId?: string
  closedByDisplayName?: string
}

/** Sortie d’espèces hors ventes (dépense, achat, retrait). */
export interface CashOutflow {
  id: string
  dateYmd: string
  amount: number
  label: string
  createdAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
  storeId?: string
}

/** Fournisseur (achats / quincaillerie / pharmacie / IT). */
export interface Supplier {
  id: string
  name: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  active: boolean
  createdAt: number
  updatedAt: number
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'ordered'
  | 'partial'
  | 'received'
  | 'cancelled'

export interface PurchaseOrderLine {
  productId: string
  name: string
  qtyOrdered: number
  qtyReceived: number
  unitCostTTC: number
}

/** Bon de commande fournisseur. */
export interface PurchaseOrder {
  id: string
  reference: string
  supplierId: string
  supplierName: string
  storeId: string
  storeName?: string
  status: PurchaseOrderStatus
  lines: PurchaseOrderLine[]
  notes?: string
  /** Frais de transport / livraison TTC. */
  shippingCostTTC?: number
  /** Autres frais d’approvisionnement (dédouanement, manutention…). */
  otherCostTTC?: number
  orderedAt?: number
  receivedAt?: number
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

/**
 * Historique des prix d’achat (réception, saisie manuelle, commande).
 * Sert au suivi des coûts d’approvisionnement et à la marge.
 */
export interface PurchasePriceHistoryEntry {
  id: string
  productId: string
  productName: string
  supplierId?: string
  supplierName?: string
  purchaseOrderId?: string
  purchaseOrderRef?: string
  storeId?: string
  unitCostTTC: number
  previousUnitCostTTC?: number
  qty?: number
  source: 'reception' | 'manual' | 'order'
  note?: string
  createdAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type QuoteStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'converted'

/** Devis commercial (quincaillerie, IT, BTP…). */
export interface Quote {
  id: string
  reference: string
  storeId: string
  storeName?: string
  customerName: string
  customerPhone?: string
  customerId?: string
  status: QuoteStatus
  lines: SaleLine[]
  subtotalHT: number
  tva: number
  totalTTC: number
  discountPct?: number
  notes?: string
  validUntil?: number
  convertedSaleId?: string
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type RepairTicketStatus =
  | 'received'
  | 'diagnosing'
  | 'waiting_parts'
  | 'in_progress'
  | 'ready'
  | 'delivered'
  | 'cancelled'

/** Ticket SAV / atelier (informatique, électroménager…). */
export interface RepairTicket {
  id: string
  reference: string
  storeId: string
  storeName?: string
  customerName: string
  customerPhone?: string
  deviceLabel: string
  serialNumber?: string
  imei?: string
  issueDescription: string
  status: RepairTicketStatus
  estimatedCostTTC?: number
  finalCostTTC?: number
  warrantyClaim?: boolean
  notes?: string
  linkedSerialUnitId?: string
  createdAt: number
  updatedAt: number
  readyAt?: number
  deliveredAt?: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

/** Échéance de crédit client (livre / à terme). */
export type CreditScheduleStatus = 'open' | 'partial' | 'paid' | 'overdue' | 'cancelled'

export interface CreditSchedule {
  id: string
  customerId: string
  customerName: string
  customerPhone?: string
  storeId: string
  saleId?: string
  amountTTC: number
  paidTTC: number
  dueDate: number
  status: CreditScheduleStatus
  notes?: string
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type InventorySessionStatus = 'draft' | 'counting' | 'closed' | 'cancelled'

export interface InventorySession {
  id: string
  reference: string
  storeId: string
  storeName?: string
  locationId?: string
  status: InventorySessionStatus
  notes?: string
  startedAt: number
  closedAt?: number
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export interface InventoryCountLine {
  id: string
  sessionId: string
  productId: string
  productName: string
  expectedQty: number
  countedQty: number | null
  variance: number | null
  updatedAt: number
}

export type LotDisposalReason = 'expired' | 'damaged' | 'recall' | 'other'

export interface LotDisposal {
  id: string
  lotId: string
  productId: string
  productName: string
  storeId: string
  lotNumber: string
  qty: number
  reason: LotDisposalReason
  notes?: string
  disposedAt: number
  actorProfileId?: string
  actorDisplayName?: string
}

export interface DeliveryRider {
  id: string
  storeId: string
  name: string
  phone?: string
  active: boolean
  createdAt: number
  updatedAt: number
}

export type DeliveryRunStatus =
  | 'pending'
  | 'assigned'
  | 'picked_up'
  | 'delivered'
  | 'failed'
  | 'cancelled'

export interface DeliveryRun {
  id: string
  storeId: string
  orderId?: string
  customerName: string
  customerPhone?: string
  address: string
  riderId?: string
  riderName?: string
  status: DeliveryRunStatus
  feeTTC?: number
  notes?: string
  assignedAt?: number
  deliveredAt?: number
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type RentalContractStatus =
  | 'draft'
  | 'active'
  | 'overdue'
  | 'returned'
  | 'cancelled'

export interface RentalLine {
  productId: string
  productName: string
  qty: number
  serialNumber?: string
  conditionOut?: string
  conditionIn?: string
}

export interface RentalContract {
  id: string
  reference: string
  storeId: string
  storeName?: string
  customerName: string
  customerPhone?: string
  status: RentalContractStatus
  depositTTC: number
  dailyRateTTC: number
  startAt: number
  dueBackAt: number
  returnedAt?: number
  lines: RentalLine[]
  notes?: string
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export interface MenuDay {
  id: string
  storeId: string
  dateYmd: string
  productIds: string[]
  note?: string
  updatedAt: number
  createdAt: number
}

export interface ProductModifierOption {
  label: string
  priceDeltaTTC: number
}

export interface ProductModifier {
  id: string
  productId: string
  groupLabel: string
  options: ProductModifierOption[]
  required: boolean
  maxSelect: number
  createdAt: number
  updatedAt: number
}

export type GiftCardStatus = 'active' | 'redeemed' | 'expired' | 'cancelled'

export interface GiftCard {
  id: string
  code: string
  storeId: string
  initialAmountTTC: number
  balanceTTC: number
  status: GiftCardStatus
  customerName?: string
  customerPhone?: string
  expiresAt?: number
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type AppointmentStatus =
  | 'booked'
  | 'confirmed'
  | 'done'
  | 'no_show'
  | 'cancelled'

export interface Appointment {
  id: string
  storeId: string
  customerName: string
  customerPhone?: string
  serviceLabel: string
  staffName?: string
  startAt: number
  durationMin: number
  status: AppointmentStatus
  notes?: string
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export interface PriceList {
  id: string
  storeId: string
  name: string
  code: string
  active: boolean
  discountPct: number
  notes?: string
  createdAt: number
  updatedAt: number
}

export interface PriceListItem {
  id: string
  priceListId: string
  productId: string
  productName: string
  priceTTC: number
  updatedAt: number
}

export type SupplierReturnStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'cancelled'

export interface SupplierReturnLine {
  productId: string
  productName: string
  qty: number
  unitCostTTC: number
  reason?: string
}

export interface SupplierReturn {
  id: string
  reference: string
  storeId: string
  supplierId: string
  supplierName: string
  status: SupplierReturnStatus
  lines: SupplierReturnLine[]
  notes?: string
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type ProductionOrderStatus = 'planned' | 'in_progress' | 'done' | 'cancelled'

export interface ProductionOrderLine {
  productId: string
  productName: string
  qtyPlanned: number
  qtyProduced: number
}

export interface ProductionOrder {
  id: string
  reference: string
  storeId: string
  status: ProductionOrderStatus
  lines: ProductionOrderLine[]
  plannedFor: string
  notes?: string
  createdAt: number
  updatedAt: number
  completedAt?: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type DeliveryNoteStatus = 'draft' | 'delivered' | 'invoiced' | 'cancelled'

export interface DeliveryNoteLine {
  productId: string
  productName: string
  qty: number
  unitPriceTTC: number
}

export interface DeliveryNote {
  id: string
  reference: string
  storeId: string
  customerName: string
  customerPhone?: string
  status: DeliveryNoteStatus
  lines: DeliveryNoteLine[]
  totalTTC: number
  notes?: string
  createdAt: number
  updatedAt: number
  deliveredAt?: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type ExpenseCategory =
  | 'transport'
  | 'utilities'
  | 'supplies'
  | 'salaries'
  | 'rent'
  | 'other'

export interface BusinessExpense {
  id: string
  storeId: string
  category: ExpenseCategory
  label: string
  amountTTC: number
  dateYmd: string
  notes?: string
  createdAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type CustomerReturnStatus =
  | 'open'
  | 'refunded'
  | 'exchanged'
  | 'cancelled'

export interface CustomerReturn {
  id: string
  reference: string
  storeId: string
  status: CustomerReturnStatus
  customerName: string
  customerPhone?: string
  productId?: string
  productName: string
  qty: number
  amountTTC: number
  reason: string
  notes?: string
  restocked?: boolean
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type DepositSlipStatus = 'open' | 'returned' | 'forfeited'

export interface DepositSlip {
  id: string
  storeId: string
  status: DepositSlipStatus
  customerName: string
  customerPhone?: string
  itemLabel: string
  qty: number
  unitDepositTTC: number
  createdAt: number
  updatedAt: number
  returnedAt?: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type JobSiteStatus =
  | 'open'
  | 'in_progress'
  | 'done'
  | 'invoiced'
  | 'cancelled'

export interface JobSite {
  id: string
  storeId: string
  status: JobSiteStatus
  name: string
  clientName: string
  clientPhone?: string
  address?: string
  budgetTTC?: number
  notes?: string
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type SubscriptionCycle = 'weekly' | 'monthly'

export type CustomerSubscriptionStatus =
  | 'active'
  | 'paused'
  | 'expired'
  | 'cancelled'

export interface CustomerSubscription {
  id: string
  storeId: string
  status: CustomerSubscriptionStatus
  customerName: string
  customerPhone?: string
  planLabel: string
  amountTTC: number
  cycle: SubscriptionCycle
  nextDueYmd: string
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type HaccpLogKind = 'temperature' | 'cleaning' | 'reception'

export interface HaccpLog {
  id: string
  storeId: string
  kind: HaccpLogKind
  dateYmd: string
  label: string
  value?: string
  ok: boolean
  notes?: string
  createdAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type VipTier = 'gold' | 'platinum' | 'black'

export interface VipClient {
  id: string
  storeId: string
  name: string
  phone?: string
  tier: VipTier
  preferences?: string
  personalShopper?: string
  lifetimeTTC: number
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export interface StaffCommission {
  id: string
  storeId: string
  staffName: string
  /** Lien profil équipe (si commission rattachée à une vendeuse). */
  staffProfileId?: string
  saleLabel: string
  amountTTC: number
  ratePct: number
  commissionTTC: number
  status: 'accrued' | 'paid'
  createdAt: number
  paidAt?: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

/** Objectif de CA / volume pour une vendeuse sur une période. */
export interface SalespersonGoal {
  id: string
  staffProfileId: string
  staffDisplayName: string
  storeId?: string
  storeName?: string
  periodKind: 'week' | 'month' | 'custom'
  periodStartYmd: string
  periodEndYmd: string
  targetCaTTC: number
  targetSalesCount?: number
  /** Taux de commission suggéré sur le CA net (%). */
  commissionRatePct?: number
  notes?: string
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type LayawayStatus = 'open' | 'collected' | 'cancelled' | 'expired'

export interface Layaway {
  id: string
  reference: string
  storeId: string
  status: LayawayStatus
  customerName: string
  customerPhone?: string
  itemLabel: string
  totalTTC: number
  depositTTC: number
  dueYmd: string
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type ShrinkageKind = 'breakage' | 'theft' | 'expiry' | 'error'

export interface ShrinkageEvent {
  id: string
  storeId: string
  kind: ShrinkageKind
  productName: string
  qty: number
  amountTTC: number
  notes?: string
  createdAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export interface AllergenCard {
  id: string
  storeId: string
  dishName: string
  allergens: string
  traces?: string
  active: boolean
  updatedAt: number
  createdAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type VenueEventStatus = 'inquiry' | 'confirmed' | 'done' | 'cancelled'

export interface VenueEvent {
  id: string
  storeId: string
  status: VenueEventStatus
  title: string
  clientName: string
  clientPhone?: string
  covers: number
  dateYmd: string
  budgetTTC?: number
  notes?: string
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type TradeInStatus = 'quoted' | 'accepted' | 'credited' | 'rejected'

export interface TradeIn {
  id: string
  storeId: string
  status: TradeInStatus
  deviceLabel: string
  serialOrImei?: string
  customerName: string
  offerTTC: number
  notes?: string
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type CareProtocolStatus = 'active' | 'completed' | 'paused'

export interface CareProtocol {
  id: string
  storeId: string
  status: CareProtocolStatus
  clientName: string
  clientPhone?: string
  protocolLabel: string
  sessionsDone: number
  sessionsTotal: number
  notes?: string
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type WineLotStatus = 'cellar' | 'by_the_glass' | 'depleted'

export interface WineCellarLot {
  id: string
  storeId: string
  status: WineLotStatus
  cuvee: string
  vintage?: string
  bottles: number
  unitPriceTTC: number
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}

export type CompoundingStatus = 'queued' | 'prepared' | 'dispensed' | 'cancelled'

export interface CompoundingOrder {
  id: string
  storeId: string
  status: CompoundingStatus
  patientName: string
  formula: string
  prescriberName?: string
  dueYmd: string
  notes?: string
  createdAt: number
  updatedAt: number
  createdByProfileId?: string
  createdByDisplayName?: string
}
