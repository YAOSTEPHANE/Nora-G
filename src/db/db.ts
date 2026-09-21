import Dexie, { type Table } from 'dexie'
import { kitchenIngredientStockRowId } from '../lib/kitchenStock'
import { storeStockRowId } from '../lib/storeStockId'
import { locationStockRowId } from '../lib/locationStockId'
import type {
  AuditEvent,
  CashOutflow,
  DayClosure,
  DiningTable,
  OnlineOrder,
  Promotion,
  Product,
  ProductCategoryRow,
  RefundRecord,
  Sale,
  StockTransfer,
  Store,
  StoreStock,
  SyncQueueItem,
  TimePunch,
  LoyaltyCustomer,
  LoyaltyTransaction,
  HrRequest,
  CrmInteraction,
  TicketInvoice,
  TerminalNode,
  StockLocation,
  LocationStock,
  StockLocationTransfer,
  TableReservation,
  KitchenIngredient,
  KitchenIngredientStock,
  ProductRecipeIngredient,
  OnlineOrderMessage,
  ProductLot,
  ProductSerialUnit,
  Prescription,
  Supplier,
  PurchaseOrder,
  Quote,
  RepairTicket,
  CustomerCreditEntry,
  CreditSchedule,
  InventorySession,
  InventoryCountLine,
  LotDisposal,
  DeliveryRider,
  DeliveryRun,
  RentalContract,
  MenuDay,
  ProductModifier,
  GiftCard,
  Appointment,
  PriceList,
  PriceListItem,
  SupplierReturn,
  ProductionOrder,
  DeliveryNote,
  BusinessExpense,
  CustomerReturn,
  DepositSlip,
  JobSite,
  CustomerSubscription,
  HaccpLog,
  VipClient,
  StaffCommission,
  Layaway,
  ShrinkageEvent,
  AllergenCard,
  VenueEvent,
  TradeIn,
  CareProtocol,
  WineCellarLot,
  CompoundingOrder,
} from './types'
import { DEFAULT_PRODUCT_CATEGORIES } from './types'

const ORG_CREDENTIALS_KEY = 'nora-org-credentials-v1'
const ORG_DATABASE_MAP_KEY = 'nora-org-database-map-v1'

function databaseNameForCurrentOrganization(): string {
  if (typeof window === 'undefined') return 'nora-unassigned'

  try {
    const credentialsRaw = localStorage.getItem(ORG_CREDENTIALS_KEY)
    if (!credentialsRaw) return 'nora-unassigned'
    const credentials = JSON.parse(credentialsRaw) as unknown
    if (
      typeof credentials !== 'object' ||
      credentials === null ||
      !('organizationId' in credentials) ||
      typeof credentials.organizationId !== 'string'
    ) {
      return 'nora-unassigned'
    }

    const organizationId = credentials.organizationId
    const mapRaw = localStorage.getItem(ORG_DATABASE_MAP_KEY)
    const parsedMap = mapRaw ? (JSON.parse(mapRaw) as unknown) : {}
    const map =
      typeof parsedMap === 'object' && parsedMap !== null
        ? (parsedMap as Record<string, string>)
        : {}
    const existing = map[organizationId]
    if (typeof existing === 'string' && existing) return existing

    // La première organisation récupère la base historique existante.
    // Les suivantes reçoivent chacune une base IndexedDB isolée.
    const databaseName =
      Object.keys(map).length === 0 ? 'nora' : `nora-org-${organizationId}`
    map[organizationId] = databaseName
    localStorage.setItem(ORG_DATABASE_MAP_KEY, JSON.stringify(map))
    return databaseName
  } catch {
    return 'nora-unassigned'
  }
}
import type { BusinessDomain } from '../lib/businessDomain'
import { getAppSettings } from '../lib/appSettings'
import {
  categoriesForDomain,
  inferDomainFromCategory,
  sampleProductsForDomain,
} from '../lib/domainCatalog'
import {
  DEMO_KITCHEN_INGREDIENT_IDS,
  DEMO_PRODUCT_IDS,
  DEMO_PROMO_CODES,
  DEMO_STORE_ANNEX_ID,
  SEED_INITIAL_STOCK_ANNEX,
  SEED_INITIAL_STOCK_MAIN,
  SEED_KITCHEN_INGREDIENTS,
  SEED_KITCHEN_STOCK_MAIN,
  SEED_LOYALTY_CUSTOMERS,
  SEED_PRODUCTS,
  SEED_RECIPES,
  buildSeedDiningTables,
  buildSeedPromotions,
  buildSeedSales,
} from './seed'
import { DEFAULT_STORE_ID, SEED_STORES, TEST_STORE_ANNEX_ID } from './seedStores'
import { getOrganizationCredentials } from '../lib/subscription/store'
import { setLastSyncTimestamp } from '../lib/syncMeta'
import {
  getAppliedLocalWipeAt,
  getStoredForceClientWipeAt,
  setAppliedLocalWipeAt,
} from '../lib/clientDataWipe'

export class NoraDB extends Dexie {
  products!: Table<Product, string>
  sales!: Table<Sale, string>
  syncQueue!: Table<SyncQueueItem, number>
  stores!: Table<Store, string>
  storeStocks!: Table<StoreStock, string>
  stockLocations!: Table<StockLocation, string>
  locationStocks!: Table<LocationStock, string>
  locationTransfers!: Table<StockLocationTransfer, string>
  stockTransfers!: Table<StockTransfer, string>
  dayClosures!: Table<DayClosure, string>
  cashOutflows!: Table<CashOutflow, string>
  refunds!: Table<RefundRecord, string>
  auditEvents!: Table<AuditEvent, string>
  onlineOrders!: Table<OnlineOrder, string>
  productCategories!: Table<ProductCategoryRow, string>
  timePunches!: Table<TimePunch, string>
  diningTables!: Table<DiningTable, string>
  promotions!: Table<Promotion, string>
  loyaltyCustomers!: Table<LoyaltyCustomer, string>
  loyaltyTransactions!: Table<LoyaltyTransaction, string>
  hrRequests!: Table<HrRequest, string>
  crmInteractions!: Table<CrmInteraction, string>
  ticketInvoices!: Table<TicketInvoice, string>
  terminalNodes!: Table<TerminalNode, string>
  tableReservations!: Table<TableReservation, string>
  kitchenIngredients!: Table<KitchenIngredient, string>
  kitchenIngredientStocks!: Table<KitchenIngredientStock, string>
  productRecipeIngredients!: Table<ProductRecipeIngredient, string>
  onlineOrderMessages!: Table<OnlineOrderMessage, string>
  productLots!: Table<ProductLot, string>
  productSerialUnits!: Table<ProductSerialUnit, string>
  prescriptions!: Table<Prescription, string>
  suppliers!: Table<Supplier, string>
  purchaseOrders!: Table<PurchaseOrder, string>
  quotes!: Table<Quote, string>
  repairTickets!: Table<RepairTicket, string>
  customerCreditEntries!: Table<CustomerCreditEntry, string>
  creditSchedules!: Table<CreditSchedule, string>
  inventorySessions!: Table<InventorySession, string>
  inventoryCountLines!: Table<InventoryCountLine, string>
  lotDisposals!: Table<LotDisposal, string>
  deliveryRiders!: Table<DeliveryRider, string>
  deliveryRuns!: Table<DeliveryRun, string>
  rentalContracts!: Table<RentalContract, string>
  menuDays!: Table<MenuDay, string>
  productModifiers!: Table<ProductModifier, string>
  giftCards!: Table<GiftCard, string>
  appointments!: Table<Appointment, string>
  priceLists!: Table<PriceList, string>
  priceListItems!: Table<PriceListItem, string>
  supplierReturns!: Table<SupplierReturn, string>
  productionOrders!: Table<ProductionOrder, string>
  deliveryNotes!: Table<DeliveryNote, string>
  businessExpenses!: Table<BusinessExpense, string>
  customerReturns!: Table<CustomerReturn, string>
  depositSlips!: Table<DepositSlip, string>
  jobSites!: Table<JobSite, string>
  customerSubscriptions!: Table<CustomerSubscription, string>
  haccpLogs!: Table<HaccpLog, string>
  vipClients!: Table<VipClient, string>
  staffCommissions!: Table<StaffCommission, string>
  layaways!: Table<Layaway, string>
  shrinkageEvents!: Table<ShrinkageEvent, string>
  allergenCards!: Table<AllergenCard, string>
  venueEvents!: Table<VenueEvent, string>
  tradeIns!: Table<TradeIn, string>
  careProtocols!: Table<CareProtocol, string>
  wineCellarLots!: Table<WineCellarLot, string>
  compoundingOrders!: Table<CompoundingOrder, string>

  constructor() {
    super(databaseNameForCurrentOrganization())
    this.version(1).stores({
      products: 'id, barcode, category',
      sales: 'id, createdAt, synced',
      syncQueue: '++id, createdAt',
    })
    this.version(2)
      .stores({
        products: 'id, barcode, category, archived',
        sales: 'id, createdAt, synced',
        syncQueue: '++id, createdAt',
      })
      .upgrade(async (tx) => {
        const table = tx.table('products')
        await table.toCollection().modify((row: Record<string, unknown>) => {
          if (row.vatRatePct === undefined) row.vatRatePct = 18
          if (row.archived === undefined) row.archived = false
        })
      })
    this.version(3)
      .stores({
        products: 'id, barcode, category, archived',
        sales: 'id, createdAt, synced, storeId',
        syncQueue: '++id, createdAt',
        stores: 'id, sortOrder',
        storeStocks: 'id, storeId, productId, [storeId+productId]',
        stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      })
      .upgrade(async (tx) => {
        const storeTable = tx.table('stores')
        if ((await storeTable.count()) === 0) {
          await storeTable.bulkAdd(SEED_STORES)
        }
        const main = DEFAULT_STORE_ID
        const prodTable = tx.table('products')
        const products = (await prodTable.toArray()) as Record<
          string,
          unknown
        >[]
        const ss = tx.table('storeStocks')
        for (const p of products) {
          const pid = p.id as string
          const rid = storeStockRowId(main, pid)
          const prev =
            typeof p.stock === 'number' ? (p.stock as number) : 0
          await ss.put({
            id: rid,
            storeId: main,
            productId: pid,
            stock: prev,
          })
        }
        await prodTable.toCollection().modify((row: Record<string, unknown>) => {
          delete row.stock
        })
      })
    this.version(4).stores({
      products: 'id, barcode, category, archived',
      sales: 'id, createdAt, synced, storeId',
      syncQueue: '++id, createdAt',
      stores: 'id, sortOrder',
      storeStocks: 'id, storeId, productId, [storeId+productId]',
      stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      dayClosures: 'dateYmd',
    })
    this.version(5).stores({
      products: 'id, barcode, category, archived',
      sales: 'id, createdAt, synced, storeId',
      syncQueue: '++id, createdAt',
      stores: 'id, sortOrder',
      storeStocks: 'id, storeId, productId, [storeId+productId]',
      stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      dayClosures: 'dateYmd',
      refunds: 'id, saleId, createdAt',
      /** Append-only : n’utiliser que `add` (voir `appendAuditEvent`). */
      auditEvents: 'id, createdAt, kind',
    })
    this.version(6).stores({
      products: 'id, barcode, category, archived',
      sales: 'id, createdAt, synced, storeId',
      syncQueue: '++id, createdAt',
      stores: 'id, sortOrder',
      storeStocks: 'id, storeId, productId, [storeId+productId]',
      stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      dayClosures: 'dateYmd',
      refunds: 'id, saleId, createdAt',
      auditEvents: 'id, createdAt, kind',
      onlineOrders: 'id, createdAt, status, storeId',
    })
    this.version(7)
      .stores({
        products: 'id, barcode, category, archived',
        sales: 'id, createdAt, synced, storeId',
        syncQueue: '++id, createdAt',
        stores: 'id, sortOrder',
        storeStocks: 'id, storeId, productId, [storeId+productId]',
        stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
        dayClosures: 'dateYmd',
        refunds: 'id, saleId, createdAt',
        auditEvents: 'id, createdAt, kind',
        onlineOrders: 'id, createdAt, status, storeId',
        productCategories: 'id, sortOrder',
      })
      .upgrade(async (tx) => {
        const catTable = tx.table('productCategories')
        let rows = (await catTable.toArray()) as ProductCategoryRow[]
        if (rows.length === 0) {
          let i = 0
          for (const name of DEFAULT_PRODUCT_CATEGORIES) {
            await catTable.add({
              id: crypto.randomUUID(),
              name,
              sortOrder: i++,
            })
          }
          rows = (await catTable.toArray()) as ProductCategoryRow[]
        }
        const seen = new Set(rows.map((r) => r.name.toLowerCase()))
        let sortOrder =
          rows.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1
        const products = (await tx.table('products').toArray()) as Product[]
        for (const p of products) {
          const c =
            typeof p.category === 'string'
              ? p.category.replace(/\s+/g, ' ').trim()
              : ''
          if (!c) continue
          const key = c.toLowerCase()
          if (seen.has(key)) continue
          await catTable.add({
            id: crypto.randomUUID(),
            name: c,
            sortOrder: sortOrder++,
          })
          seen.add(key)
        }
      })
    this.version(8).stores({
      products: 'id, barcode, category, archived',
      sales: 'id, createdAt, synced, storeId',
      syncQueue: '++id, createdAt',
      stores: 'id, sortOrder',
      storeStocks: 'id, storeId, productId, [storeId+productId]',
      stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      dayClosures: 'dateYmd',
      refunds: 'id, saleId, createdAt',
      auditEvents: 'id, createdAt, kind',
      onlineOrders: 'id, createdAt, status, storeId',
      productCategories: 'id, sortOrder',
      timePunches: 'id, profileId, storeId, createdAt',
    })
    this.version(9).stores({
      products: 'id, barcode, category, archived',
      sales: 'id, createdAt, synced, storeId',
      syncQueue: '++id, createdAt',
      stores: 'id, sortOrder',
      storeStocks: 'id, storeId, productId, [storeId+productId]',
      stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      dayClosures: 'dateYmd',
      refunds: 'id, saleId, createdAt',
      auditEvents: 'id, createdAt, kind',
      onlineOrders: 'id, createdAt, status, storeId',
      productCategories: 'id, sortOrder',
      timePunches: 'id, profileId, storeId, createdAt',
      diningTables: 'id, storeId, status, sortOrder, [storeId+sortOrder]',
    })
    this.version(10).stores({
      products: 'id, barcode, category, archived',
      sales: 'id, createdAt, synced, storeId',
      syncQueue: '++id, createdAt',
      stores: 'id, sortOrder',
      storeStocks: 'id, storeId, productId, [storeId+productId]',
      stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      dayClosures: 'dateYmd',
      refunds: 'id, saleId, createdAt',
      auditEvents: 'id, createdAt, kind',
      onlineOrders: 'id, createdAt, status, storeId',
      productCategories: 'id, sortOrder',
      timePunches: 'id, profileId, storeId, createdAt',
      diningTables: 'id, storeId, status, sortOrder, [storeId+sortOrder]',
      promotions: 'id, code, active, storeId, [active+code]',
    })
    this.version(11).stores({
      products: 'id, barcode, category, archived',
      sales: 'id, createdAt, synced, storeId',
      syncQueue: '++id, createdAt',
      stores: 'id, sortOrder',
      storeStocks: 'id, storeId, productId, [storeId+productId]',
      stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      dayClosures: 'dateYmd',
      refunds: 'id, saleId, createdAt',
      auditEvents: 'id, createdAt, kind',
      onlineOrders: 'id, createdAt, status, storeId',
      productCategories: 'id, sortOrder',
      timePunches: 'id, profileId, storeId, createdAt',
      diningTables: 'id, storeId, status, sortOrder, [storeId+sortOrder]',
      promotions: 'id, code, active, storeId, [active+code]',
      loyaltyCustomers: 'id, phone, updatedAt',
      loyaltyTransactions: 'id, customerId, createdAt, type',
    })
    this.version(12).stores({
      products: 'id, barcode, category, archived',
      sales: 'id, createdAt, synced, storeId',
      syncQueue: '++id, createdAt',
      stores: 'id, sortOrder',
      storeStocks: 'id, storeId, productId, [storeId+productId]',
      stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      dayClosures: 'dateYmd',
      refunds: 'id, saleId, createdAt',
      auditEvents: 'id, createdAt, kind',
      onlineOrders: 'id, createdAt, status, storeId',
      productCategories: 'id, sortOrder',
      timePunches: 'id, profileId, storeId, createdAt',
      diningTables: 'id, storeId, status, sortOrder, [storeId+sortOrder]',
      promotions: 'id, code, active, storeId, [active+code]',
      loyaltyCustomers: 'id, phone, updatedAt',
      loyaltyTransactions: 'id, customerId, createdAt, type',
      hrRequests: 'id, createdAt, staffProfileId, status, type, [staffProfileId+createdAt]',
      crmInteractions:
        'id, createdAt, customerId, customerPhone, kind, [customerId+createdAt]',
    })
    this.version(13).stores({
      products: 'id, barcode, category, archived',
      sales: 'id, createdAt, synced, storeId',
      syncQueue: '++id, createdAt',
      stores: 'id, sortOrder',
      storeStocks: 'id, storeId, productId, [storeId+productId]',
      stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      dayClosures: 'dateYmd',
      refunds: 'id, saleId, createdAt',
      auditEvents: 'id, createdAt, kind',
      onlineOrders: 'id, createdAt, status, storeId',
      productCategories: 'id, sortOrder',
      timePunches: 'id, profileId, storeId, createdAt',
      diningTables: 'id, storeId, status, sortOrder, [storeId+sortOrder]',
      promotions: 'id, code, active, storeId, [active+code]',
      loyaltyCustomers: 'id, phone, updatedAt',
      loyaltyTransactions: 'id, customerId, createdAt, type',
      hrRequests: 'id, createdAt, staffProfileId, status, type, [staffProfileId+createdAt]',
      crmInteractions:
        'id, createdAt, customerId, customerPhone, kind, [customerId+createdAt]',
      terminalNodes: 'id, storeId, online, lastSeenAt, [storeId+lastSeenAt]',
    })
    this.version(14).stores({
      products: 'id, barcode, category, archived',
      sales: 'id, createdAt, synced, storeId',
      syncQueue: '++id, createdAt',
      stores: 'id, sortOrder',
      storeStocks: 'id, storeId, productId, [storeId+productId]',
      stockLocations: 'id, storeId, active, sortOrder, [storeId+sortOrder]',
      locationStocks:
        'id, storeId, locationId, productId, [storeId+productId], [storeId+locationId]',
      locationTransfers: 'id, createdAt, storeId, productId, fromLocationId, toLocationId',
      stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      dayClosures: 'dateYmd',
      refunds: 'id, saleId, createdAt',
      auditEvents: 'id, createdAt, kind',
      onlineOrders: 'id, createdAt, status, storeId',
      productCategories: 'id, sortOrder',
      timePunches: 'id, profileId, storeId, createdAt',
      diningTables: 'id, storeId, status, sortOrder, [storeId+sortOrder]',
      promotions: 'id, code, active, storeId, [active+code]',
      loyaltyCustomers: 'id, phone, updatedAt',
      loyaltyTransactions: 'id, customerId, createdAt, type',
      hrRequests: 'id, createdAt, staffProfileId, status, type, [staffProfileId+createdAt]',
      crmInteractions:
        'id, createdAt, customerId, customerPhone, kind, [customerId+createdAt]',
      terminalNodes: 'id, storeId, online, lastSeenAt, [storeId+lastSeenAt]',
    })
    this.version(15).stores({
      products: 'id, barcode, category, archived',
      sales: 'id, createdAt, synced, storeId',
      syncQueue: '++id, createdAt',
      stores: 'id, sortOrder',
      storeStocks: 'id, storeId, productId, [storeId+productId]',
      stockLocations: 'id, storeId, active, sortOrder, [storeId+sortOrder]',
      locationStocks:
        'id, storeId, locationId, productId, [storeId+productId], [storeId+locationId]',
      locationTransfers: 'id, createdAt, storeId, productId, fromLocationId, toLocationId',
      stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      dayClosures: 'dateYmd',
      refunds: 'id, saleId, createdAt',
      auditEvents: 'id, createdAt, kind',
      onlineOrders: 'id, createdAt, status, storeId',
      productCategories: 'id, sortOrder',
      timePunches: 'id, profileId, storeId, createdAt',
      diningTables: 'id, storeId, status, sortOrder, [storeId+sortOrder]',
      promotions: 'id, code, active, storeId, [active+code]',
      loyaltyCustomers: 'id, phone, updatedAt',
      loyaltyTransactions: 'id, customerId, createdAt, type',
      hrRequests: 'id, createdAt, staffProfileId, status, type, [staffProfileId+createdAt]',
      crmInteractions:
        'id, createdAt, customerId, customerPhone, kind, [customerId+createdAt]',
      ticketInvoices: 'id, createdAt, updatedAt, kind, status, storeId, reference, [storeId+createdAt]',
      terminalNodes: 'id, storeId, online, lastSeenAt, [storeId+lastSeenAt]',
    })
    this.version(16).stores({
      products: 'id, barcode, category, archived',
      sales: 'id, createdAt, synced, storeId',
      syncQueue: '++id, createdAt',
      stores: 'id, sortOrder',
      storeStocks: 'id, storeId, productId, [storeId+productId]',
      stockLocations: 'id, storeId, active, sortOrder, [storeId+sortOrder]',
      locationStocks:
        'id, storeId, locationId, productId, [storeId+productId], [storeId+locationId]',
      locationTransfers: 'id, createdAt, storeId, productId, fromLocationId, toLocationId',
      stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      dayClosures: 'dateYmd',
      refunds: 'id, saleId, createdAt',
      auditEvents: 'id, createdAt, kind',
      onlineOrders: 'id, createdAt, status, storeId',
      productCategories: 'id, sortOrder',
      timePunches: 'id, profileId, storeId, createdAt',
      diningTables: 'id, storeId, status, sortOrder, [storeId+sortOrder]',
      promotions: 'id, code, active, storeId, [active+code]',
      loyaltyCustomers: 'id, phone, updatedAt',
      loyaltyTransactions: 'id, customerId, createdAt, type',
      hrRequests: 'id, createdAt, staffProfileId, status, type, [staffProfileId+createdAt]',
      crmInteractions:
        'id, createdAt, customerId, customerPhone, kind, [customerId+createdAt]',
      ticketInvoices: 'id, createdAt, updatedAt, kind, status, storeId, reference, [storeId+createdAt]',
      terminalNodes: 'id, storeId, online, lastSeenAt, [storeId+lastSeenAt]',
      tableReservations:
        'id, storeId, tableId, status, startAt, endAt, [storeId+startAt], [tableId+startAt]',
    })
    this.version(17).stores({
      products: 'id, barcode, category, archived',
      sales: 'id, createdAt, synced, storeId',
      syncQueue: '++id, createdAt',
      stores: 'id, sortOrder',
      storeStocks: 'id, storeId, productId, [storeId+productId]',
      stockLocations: 'id, storeId, active, sortOrder, [storeId+sortOrder]',
      locationStocks:
        'id, storeId, locationId, productId, [storeId+productId], [storeId+locationId]',
      locationTransfers: 'id, createdAt, storeId, productId, fromLocationId, toLocationId',
      stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      dayClosures: 'dateYmd',
      refunds: 'id, saleId, createdAt',
      auditEvents: 'id, createdAt, kind',
      onlineOrders:
        'id, createdAt, status, storeId, sourcePlatform, externalOrderRef, [storeId+createdAt]',
      productCategories: 'id, sortOrder',
      timePunches: 'id, profileId, storeId, createdAt',
      diningTables: 'id, storeId, status, sortOrder, [storeId+sortOrder]',
      promotions: 'id, code, active, storeId, [active+code]',
      loyaltyCustomers: 'id, phone, updatedAt',
      loyaltyTransactions: 'id, customerId, createdAt, type',
      hrRequests: 'id, createdAt, staffProfileId, status, type, [staffProfileId+createdAt]',
      crmInteractions:
        'id, createdAt, customerId, customerPhone, kind, [customerId+createdAt]',
      ticketInvoices: 'id, createdAt, updatedAt, kind, status, storeId, reference, [storeId+createdAt]',
      terminalNodes: 'id, storeId, online, lastSeenAt, [storeId+lastSeenAt]',
      tableReservations:
        'id, storeId, tableId, status, startAt, endAt, [storeId+startAt], [tableId+startAt]',
    })
    this.version(18).stores({
      products: 'id, barcode, category, archived',
      sales: 'id, createdAt, synced, storeId',
      syncQueue: '++id, createdAt',
      stores: 'id, sortOrder',
      storeStocks: 'id, storeId, productId, [storeId+productId]',
      stockLocations: 'id, storeId, active, sortOrder, [storeId+sortOrder]',
      locationStocks:
        'id, storeId, locationId, productId, [storeId+productId], [storeId+locationId]',
      locationTransfers: 'id, createdAt, storeId, productId, fromLocationId, toLocationId',
      stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      dayClosures: 'dateYmd',
      refunds: 'id, saleId, createdAt',
      auditEvents: 'id, createdAt, kind',
      onlineOrders:
        'id, createdAt, status, storeId, sourcePlatform, externalOrderRef, [storeId+createdAt]',
      productCategories: 'id, sortOrder',
      timePunches: 'id, profileId, storeId, createdAt',
      diningTables: 'id, storeId, status, sortOrder, [storeId+sortOrder]',
      promotions: 'id, code, active, storeId, [active+code]',
      loyaltyCustomers: 'id, phone, updatedAt',
      loyaltyTransactions: 'id, customerId, createdAt, type',
      hrRequests: 'id, createdAt, staffProfileId, status, type, [staffProfileId+createdAt]',
      crmInteractions:
        'id, createdAt, customerId, customerPhone, kind, [customerId+createdAt]',
      ticketInvoices: 'id, createdAt, updatedAt, kind, status, storeId, reference, [storeId+createdAt]',
      terminalNodes: 'id, storeId, online, lastSeenAt, [storeId+lastSeenAt]',
      tableReservations:
        'id, storeId, tableId, status, startAt, endAt, [storeId+startAt], [tableId+startAt]',
      kitchenIngredients: 'id, name, archived',
      kitchenIngredientStocks: 'id, storeId, ingredientId, [storeId+ingredientId]',
      productRecipeIngredients: 'id, productId, ingredientId, [productId+ingredientId]',
    })
    this.version(19).stores({
      products: 'id, barcode, category, archived',
      sales: 'id, createdAt, synced, storeId',
      syncQueue: '++id, createdAt',
      stores: 'id, sortOrder',
      storeStocks: 'id, storeId, productId, [storeId+productId]',
      stockLocations: 'id, storeId, active, sortOrder, [storeId+sortOrder]',
      locationStocks:
        'id, storeId, locationId, productId, [storeId+productId], [storeId+locationId]',
      locationTransfers: 'id, createdAt, storeId, productId, fromLocationId, toLocationId',
      stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      dayClosures: 'dateYmd',
      refunds: 'id, saleId, createdAt',
      auditEvents: 'id, createdAt, kind',
      onlineOrders:
        'id, createdAt, status, storeId, sourcePlatform, externalOrderRef, [storeId+createdAt]',
      onlineOrderMessages: 'id, orderId, createdAt',
      productCategories: 'id, sortOrder',
      timePunches: 'id, profileId, storeId, createdAt',
      diningTables: 'id, storeId, status, sortOrder, [storeId+sortOrder]',
      promotions: 'id, code, active, storeId, [active+code]',
      loyaltyCustomers: 'id, phone, updatedAt',
      loyaltyTransactions: 'id, customerId, createdAt, type',
      hrRequests: 'id, createdAt, staffProfileId, status, type, [staffProfileId+createdAt]',
      crmInteractions:
        'id, createdAt, customerId, customerPhone, kind, [customerId+createdAt]',
      ticketInvoices: 'id, createdAt, updatedAt, kind, status, storeId, reference, [storeId+createdAt]',
      terminalNodes: 'id, storeId, online, lastSeenAt, [storeId+lastSeenAt]',
      tableReservations:
        'id, storeId, tableId, status, startAt, endAt, [storeId+startAt], [tableId+startAt]',
      kitchenIngredients: 'id, name, archived, productId',
      kitchenIngredientStocks: 'id, storeId, ingredientId, [storeId+ingredientId]',
      productRecipeIngredients: 'id, productId, ingredientId, [productId+ingredientId]',
    })
    this.version(20).stores({
      products: 'id, barcode, category, archived',
      sales: 'id, createdAt, synced, storeId',
      syncQueue: '++id, createdAt',
      stores: 'id, sortOrder',
      storeStocks: 'id, storeId, productId, [storeId+productId]',
      stockLocations: 'id, storeId, active, sortOrder, [storeId+sortOrder]',
      locationStocks:
        'id, storeId, locationId, productId, [storeId+productId], [storeId+locationId]',
      locationTransfers: 'id, createdAt, storeId, productId, fromLocationId, toLocationId',
      stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      dayClosures: 'dateYmd',
      refunds: 'id, saleId, createdAt',
      auditEvents: 'id, createdAt, kind',
      onlineOrders:
        'id, createdAt, status, storeId, sourcePlatform, externalOrderRef, [storeId+createdAt]',
      onlineOrderMessages: 'id, orderId, createdAt',
      productCategories: 'id, sortOrder',
      timePunches: 'id, profileId, storeId, createdAt',
      diningTables: 'id, storeId, status, sortOrder, [storeId+sortOrder]',
      promotions: 'id, code, active, storeId, [active+code]',
      loyaltyCustomers: 'id, phone, updatedAt',
      loyaltyTransactions: 'id, customerId, createdAt, type',
      hrRequests: 'id, createdAt, staffProfileId, status, type, [staffProfileId+createdAt]',
      crmInteractions:
        'id, createdAt, customerId, customerPhone, kind, [customerId+createdAt]',
      ticketInvoices: 'id, createdAt, updatedAt, kind, status, storeId, reference, [storeId+createdAt]',
      terminalNodes: 'id, storeId, online, lastSeenAt, [storeId+lastSeenAt]',
      tableReservations:
        'id, storeId, tableId, status, startAt, endAt, [storeId+startAt], [tableId+startAt]',
      kitchenIngredients: 'id, name, archived, productId',
      kitchenIngredientStocks: 'id, storeId, ingredientId, [storeId+ingredientId]',
      productRecipeIngredients: 'id, productId, ingredientId, [productId+ingredientId]',
    })
    this.version(21).stores({
      products: 'id, barcode, category, archived',
      sales: 'id, createdAt, synced, storeId',
      syncQueue: '++id, createdAt',
      stores: 'id, sortOrder',
      storeStocks: 'id, storeId, productId, [storeId+productId]',
      stockLocations: 'id, storeId, active, sortOrder, [storeId+sortOrder]',
      locationStocks:
        'id, storeId, locationId, productId, [storeId+productId], [storeId+locationId]',
      locationTransfers: 'id, createdAt, storeId, productId, fromLocationId, toLocationId',
      stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      dayClosures: 'dateYmd',
      cashOutflows: 'id, dateYmd, createdAt',
      refunds: 'id, saleId, createdAt',
      auditEvents: 'id, createdAt, kind',
      onlineOrders:
        'id, createdAt, status, storeId, sourcePlatform, externalOrderRef, [storeId+createdAt]',
      onlineOrderMessages: 'id, orderId, createdAt',
      productCategories: 'id, sortOrder',
      timePunches: 'id, profileId, storeId, createdAt',
      diningTables: 'id, storeId, status, sortOrder, [storeId+sortOrder]',
      promotions: 'id, code, active, storeId, [active+code]',
      loyaltyCustomers: 'id, phone, updatedAt',
      loyaltyTransactions: 'id, customerId, createdAt, type',
      hrRequests: 'id, createdAt, staffProfileId, status, type, [staffProfileId+createdAt]',
      crmInteractions:
        'id, createdAt, customerId, customerPhone, kind, [customerId+createdAt]',
      ticketInvoices: 'id, createdAt, updatedAt, kind, status, storeId, reference, [storeId+createdAt]',
      terminalNodes: 'id, storeId, online, lastSeenAt, [storeId+lastSeenAt]',
      tableReservations:
        'id, storeId, tableId, status, startAt, endAt, [storeId+startAt], [tableId+startAt]',
      kitchenIngredients: 'id, name, archived, productId',
      kitchenIngredientStocks: 'id, storeId, ingredientId, [storeId+ingredientId]',
      productRecipeIngredients: 'id, productId, ingredientId, [productId+ingredientId]',
    })
    this.version(22).stores({
      products: 'id, barcode, category, archived',
      sales: 'id, createdAt, synced, storeId',
      syncQueue: '++id, createdAt, kind',
      stores: 'id, sortOrder, archived',
      storeStocks: 'id, storeId, productId, [storeId+productId]',
      stockLocations: 'id, storeId, active, sortOrder, [storeId+sortOrder]',
      locationStocks:
        'id, storeId, locationId, productId, [storeId+productId], [storeId+locationId]',
      locationTransfers: 'id, createdAt, storeId, productId, fromLocationId, toLocationId',
      stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
      dayClosures: 'dateYmd',
      cashOutflows: 'id, dateYmd, createdAt',
      refunds: 'id, saleId, createdAt',
      auditEvents: 'id, createdAt, kind',
      onlineOrders:
        'id, createdAt, status, storeId, sourcePlatform, externalOrderRef, [storeId+createdAt]',
      onlineOrderMessages: 'id, orderId, createdAt',
      productCategories: 'id, sortOrder',
      timePunches: 'id, profileId, storeId, createdAt',
      diningTables: 'id, storeId, status, sortOrder, [storeId+sortOrder]',
      promotions: 'id, code, active, storeId, [active+code]',
      loyaltyCustomers: 'id, phone, updatedAt, archived',
      loyaltyTransactions: 'id, customerId, createdAt, type',
      hrRequests: 'id, createdAt, staffProfileId, status, type, [staffProfileId+createdAt]',
      crmInteractions:
        'id, createdAt, customerId, customerPhone, kind, [customerId+createdAt]',
      ticketInvoices: 'id, createdAt, updatedAt, kind, status, storeId, reference, [storeId+createdAt]',
      terminalNodes: 'id, storeId, online, lastSeenAt, [storeId+lastSeenAt]',
      tableReservations:
        'id, storeId, tableId, status, startAt, endAt, [storeId+startAt], [tableId+startAt]',
      kitchenIngredients: 'id, name, archived, productId',
      kitchenIngredientStocks: 'id, storeId, ingredientId, [storeId+ingredientId]',
      productRecipeIngredients: 'id, productId, ingredientId, [productId+ingredientId]',
    })
    this.version(23)
      .stores({
        products: 'id, barcode, category, archived',
        sales: 'id, createdAt, synced, storeId',
        syncQueue: '++id, createdAt, kind',
        stores: 'id, sortOrder, archived',
        storeStocks: 'id, storeId, productId, [storeId+productId]',
        stockLocations: 'id, storeId, active, sortOrder, [storeId+sortOrder]',
        locationStocks:
          'id, storeId, locationId, productId, [storeId+productId], [storeId+locationId]',
        locationTransfers: 'id, createdAt, storeId, productId, fromLocationId, toLocationId',
        stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
        dayClosures: 'dateYmd',
        cashOutflows: 'id, dateYmd, createdAt',
        refunds: 'id, saleId, createdAt',
        auditEvents: 'id, createdAt, kind',
        onlineOrders:
          'id, createdAt, status, storeId, sourcePlatform, externalOrderRef, [storeId+createdAt]',
        onlineOrderMessages: 'id, orderId, createdAt',
        productCategories: 'id, sortOrder',
        timePunches: 'id, profileId, storeId, createdAt',
        diningTables: 'id, storeId, status, sortOrder, [storeId+sortOrder]',
        promotions: 'id, code, active, storeId, [active+code]',
        loyaltyCustomers: 'id, phone, updatedAt, archived',
        loyaltyTransactions: 'id, customerId, createdAt, type',
        hrRequests: 'id, createdAt, staffProfileId, status, type, [staffProfileId+createdAt]',
        crmInteractions:
          'id, createdAt, customerId, customerPhone, kind, [customerId+createdAt]',
        ticketInvoices: 'id, createdAt, updatedAt, kind, status, storeId, reference, [storeId+createdAt]',
        terminalNodes: 'id, storeId, online, lastSeenAt, [storeId+lastSeenAt]',
        tableReservations:
          'id, storeId, tableId, status, startAt, endAt, [storeId+startAt], [tableId+startAt]',
        kitchenIngredients: 'id, name, archived, productId',
        kitchenIngredientStocks: 'id, storeId, ingredientId, [storeId+ingredientId]',
        productRecipeIngredients: 'id, productId, ingredientId, [productId+ingredientId]',
        productLots:
          'id, productId, storeId, lotNumber, expiryDate, [storeId+productId], [storeId+expiryDate]',
        productSerialUnits:
          'id, productId, storeId, serialNumber, imei, status, saleId, [storeId+productId], [storeId+serialNumber]',
        prescriptions: 'id, saleId, storeId, createdAt, patientName, [storeId+createdAt]',
      })
      .upgrade(async (tx) => {
        await tx.table('products').toCollection().modify((row: Record<string, unknown>) => {
          if (row.requiresPrescription === undefined) row.requiresPrescription = false
          if (row.trackLots === undefined) row.trackLots = false
          if (row.trackSerialNumbers === undefined) row.trackSerialNumbers = false
        })
      })
    this.version(24)
      .stores({
        products: 'id, barcode, category, archived',
        sales: 'id, createdAt, synced, storeId',
        syncQueue: '++id, createdAt, kind',
        stores: 'id, sortOrder, archived',
        storeStocks: 'id, storeId, productId, [storeId+productId]',
        stockLocations: 'id, storeId, active, sortOrder, [storeId+sortOrder]',
        locationStocks:
          'id, storeId, locationId, productId, [storeId+productId], [storeId+locationId]',
        locationTransfers: 'id, createdAt, storeId, productId, fromLocationId, toLocationId',
        stockTransfers: 'id, createdAt, fromStoreId, toStoreId',
        dayClosures: 'dateYmd',
        cashOutflows: 'id, dateYmd, createdAt',
        refunds: 'id, saleId, createdAt',
        auditEvents: 'id, createdAt, kind',
        onlineOrders:
          'id, createdAt, status, storeId, sourcePlatform, externalOrderRef, [storeId+createdAt]',
        onlineOrderMessages: 'id, orderId, createdAt',
        productCategories: 'id, sortOrder',
        timePunches: 'id, profileId, storeId, createdAt',
        diningTables: 'id, storeId, status, sortOrder, [storeId+sortOrder]',
        promotions: 'id, code, active, storeId, [active+code]',
        loyaltyCustomers: 'id, phone, updatedAt, archived',
        loyaltyTransactions: 'id, customerId, createdAt, type',
        hrRequests: 'id, createdAt, staffProfileId, status, type, [staffProfileId+createdAt]',
        crmInteractions:
          'id, createdAt, customerId, customerPhone, kind, [customerId+createdAt]',
        ticketInvoices: 'id, createdAt, updatedAt, kind, status, storeId, reference, [storeId+createdAt]',
        terminalNodes: 'id, storeId, online, lastSeenAt, [storeId+lastSeenAt]',
        tableReservations:
          'id, storeId, tableId, status, startAt, endAt, [storeId+startAt], [tableId+startAt]',
        kitchenIngredients: 'id, name, archived, productId',
        kitchenIngredientStocks: 'id, storeId, ingredientId, [storeId+ingredientId]',
        productRecipeIngredients: 'id, productId, ingredientId, [productId+ingredientId]',
        productLots:
          'id, productId, storeId, lotNumber, expiryDate, [storeId+productId], [storeId+expiryDate]',
        productSerialUnits:
          'id, productId, storeId, serialNumber, imei, status, saleId, [storeId+productId], [storeId+serialNumber]',
        prescriptions: 'id, saleId, storeId, createdAt, patientName, [storeId+createdAt]',
        suppliers: 'id, name, active, updatedAt',
        purchaseOrders:
          'id, reference, supplierId, storeId, status, createdAt, [storeId+createdAt]',
        quotes: 'id, reference, storeId, status, createdAt, customerPhone, [storeId+createdAt]',
        repairTickets:
          'id, reference, storeId, status, createdAt, customerPhone, [storeId+status]',
        customerCreditEntries: 'id, customerId, createdAt, type, [customerId+createdAt]',
      })
    this.version(25).stores({
      creditSchedules:
        'id, customerId, storeId, status, dueDate, createdAt, [storeId+status], [customerId+dueDate]',
      inventorySessions:
        'id, reference, storeId, status, createdAt, [storeId+createdAt]',
      inventoryCountLines: 'id, sessionId, productId, [sessionId+productId]',
      lotDisposals: 'id, lotId, productId, storeId, disposedAt, [storeId+disposedAt]',
      deliveryRiders: 'id, storeId, active, name, [storeId+active]',
      deliveryRuns:
        'id, storeId, status, riderId, createdAt, orderId, [storeId+status], [storeId+createdAt]',
      rentalContracts:
        'id, reference, storeId, status, dueBackAt, createdAt, [storeId+status]',
      menuDays: 'id, storeId, dateYmd, [storeId+dateYmd]',
      productModifiers: 'id, productId, [productId+groupLabel]',
    })
    this.version(26).stores({
      giftCards: 'id, code, storeId, status, createdAt, [storeId+status]',
      appointments:
        'id, storeId, startAt, status, customerPhone, [storeId+startAt]',
      priceLists: 'id, storeId, code, active, [storeId+active]',
      priceListItems: 'id, priceListId, productId, [priceListId+productId]',
      supplierReturns:
        'id, reference, storeId, supplierId, status, createdAt, [storeId+createdAt]',
      productionOrders:
        'id, reference, storeId, status, plannedFor, createdAt, [storeId+plannedFor]',
      deliveryNotes:
        'id, reference, storeId, status, createdAt, [storeId+createdAt]',
      businessExpenses:
        'id, storeId, dateYmd, category, createdAt, [storeId+dateYmd]',
    })
    this.version(27).stores({
      customerReturns:
        'id, reference, storeId, status, createdAt, [storeId+status]',
      depositSlips: 'id, storeId, status, createdAt, [storeId+status]',
      jobSites: 'id, storeId, status, createdAt, [storeId+status]',
      customerSubscriptions:
        'id, storeId, status, nextDueYmd, createdAt, [storeId+status]',
      haccpLogs: 'id, storeId, kind, dateYmd, createdAt, [storeId+dateYmd]',
    })
    this.version(28).stores({
      vipClients: 'id, storeId, tier, createdAt, [storeId+tier]',
      staffCommissions:
        'id, storeId, status, createdAt, staffName, [storeId+status]',
      layaways: 'id, reference, storeId, status, dueYmd, createdAt, [storeId+status]',
      shrinkageEvents: 'id, storeId, kind, createdAt, [storeId+createdAt]',
      allergenCards: 'id, storeId, active, dishName, [storeId+active]',
      venueEvents:
        'id, storeId, status, dateYmd, createdAt, [storeId+dateYmd]',
      tradeIns: 'id, storeId, status, createdAt, [storeId+status]',
      careProtocols: 'id, storeId, status, createdAt, [storeId+status]',
      wineCellarLots: 'id, storeId, status, createdAt, [storeId+status]',
      compoundingOrders:
        'id, storeId, status, dueYmd, createdAt, [storeId+status]',
    })
  }
}

export const db = new NoraDB()

/** Ajoute une catégorie si le libellé (insensible à la casse) est nouveau. */
export async function addProductCategoryLabel(raw: string): Promise<string> {
  const name = raw.replace(/\s+/g, ' ').trim()
  if (!name) {
    throw new Error('Nom de catégorie vide.')
  }
  if (name.toLowerCase() === 'tous') {
    throw new Error('Le nom « Tous » est réservé pour les filtres.')
  }
  const dup = await db.productCategories
    .filter((r) => r.name.toLowerCase() === name.toLowerCase())
    .first()
  if (dup) {
    return dup.name
  }
  const rows = await db.productCategories.toArray()
  const maxOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1)
  await db.productCategories.add({
    id: crypto.randomUUID(),
    name,
    sortOrder: maxOrder + 1,
  })
  return name
}

export async function renameProductCategoryLabel(
  categoryId: string,
  raw: string,
): Promise<string> {
  const name = raw.replace(/\s+/g, ' ').trim()
  if (!name) throw new Error('Nom de catégorie vide.')
  if (name.toLowerCase() === 'tous') {
    throw new Error('Le nom « Tous » est réservé pour les filtres.')
  }
  const row = await db.productCategories.get(categoryId)
  if (!row) throw new Error('Catégorie introuvable.')
  const dup = await db.productCategories
    .filter(
      (r) =>
        r.id !== categoryId && r.name.toLowerCase() === name.toLowerCase(),
    )
    .first()
  if (dup) throw new Error('Une catégorie porte déjà ce nom.')
  const previous = row.name
  await db.transaction('rw', [db.productCategories, db.products], async () => {
    await db.productCategories.update(categoryId, { name })
    const products = await db.products
      .filter((p) => p.category === previous)
      .toArray()
    for (const p of products) {
      await db.products.update(p.id, { category: name })
    }
  })
  return name
}

export async function deleteProductCategoryIfUnused(
  categoryId: string,
): Promise<void> {
  const row = await db.productCategories.get(categoryId)
  if (!row) throw new Error('Catégorie introuvable.')
  const used = await db.products
    .filter((p) => p.category === row.name)
    .first()
  if (used) {
    throw new Error(
      `Impossible de supprimer « ${row.name} » : des articles l’utilisent encore.`,
    )
  }
  await db.productCategories.delete(categoryId)
}

/** Enregistre en index les catégories présentes sur les produits (import CSV, etc.). */
export async function syncProductCategoriesFromProducts(): Promise<void> {
  await dedupeProductCategories()
  const [rows, products] = await Promise.all([
    db.productCategories.toArray(),
    db.products.toArray(),
  ])
  const byLower = new Map(rows.map((r) => [r.name.toLowerCase(), r]))
  let maxOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1)
  const toAdd: ProductCategoryRow[] = []
  for (const p of products) {
    const label =
      typeof p.category === 'string'
        ? p.category.replace(/\s+/g, ' ').trim()
        : ''
    if (!label) continue
    const key = label.toLowerCase()
    if (byLower.has(key)) continue
    maxOrder += 1
    const row: ProductCategoryRow = {
      id: crypto.randomUUID(),
      name: label,
      sortOrder: maxOrder,
    }
    byLower.set(key, row)
    toAdd.push(row)
  }
  if (toAdd.length > 0) {
    await db.productCategories.bulkAdd(toAdd)
  }
}

/**
 * Supprime les lignes `productCategories` en double (même nom, casse ignorée).
 * Conserve la première par sortOrder.
 */
export async function dedupeProductCategories(): Promise<void> {
  const rows = await db.productCategories.orderBy('sortOrder').toArray()
  const keepByLower = new Map<string, string>()
  const toDelete: string[] = []
  for (const row of rows) {
    const key = row.name.trim().toLowerCase()
    if (!key) {
      toDelete.push(row.id)
      continue
    }
    if (keepByLower.has(key)) {
      toDelete.push(row.id)
      continue
    }
    keepByLower.set(key, row.id)
  }
  if (toDelete.length > 0) {
    await db.productCategories.bulkDelete(toDelete)
  }
}

/** Libellés uniques pour onglets filtres (évite clés React dupliquées). */
export function uniqueCategoryTabNames(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const name of names) {
    const trimmed = name.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

/** Ajoute les catégories du domaine métier actif (sans mélanger les autres packs). */
export async function ensureDomainProductCategories(
  domain: BusinessDomain,
): Promise<void> {
  await dedupeProductCategories()
  const rows = await db.productCategories.toArray()
  const byLower = new Set(rows.map((r) => r.name.toLowerCase()))
  let maxOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1)
  const toAdd: ProductCategoryRow[] = []
  for (const name of categoriesForDomain(domain)) {
    if (byLower.has(name.toLowerCase())) continue
    maxOrder += 1
    toAdd.push({
      id: crypto.randomUUID(),
      name,
      sortOrder: maxOrder,
    })
  }
  if (toAdd.length > 0) {
    await db.productCategories.bulkAdd(toAdd)
  }
}

/** Stamp `businessDomain` sur les produits legacy (inféré par catégorie). */
export async function migrateProductBusinessDomains(): Promise<void> {
  const products = await db.products.toArray()
  for (const p of products) {
    if (p.businessDomain) continue
    await db.products.update(p.id, {
      businessDomain: inferDomainFromCategory(p.category),
    })
  }
}

/**
 * Si le domaine n’a aucun produit, propose un mini catalogue d’exemples.
 * Ne touche pas aux autres domaines.
 */
export async function ensureDomainSampleProductsIfEmpty(
  domain: BusinessDomain,
): Promise<number> {
  await ensureDomainProductCategories(domain)
  const products = await db.products.toArray()
  const existing = products.filter((p) => p.businessDomain === domain)
  if (existing.length > 0) return 0
  const samples = sampleProductsForDomain(domain)
  let added = 0
  for (const sample of samples) {
    const id = crypto.randomUUID()
    await db.products.add({ ...sample, id })
    added += 1
  }
  return added
}

/** Ajoute les catégories du pack domaine (compat appelants historiques). */
export async function ensureDefaultProductCategories(
  domain: BusinessDomain = 'retail',
): Promise<void> {
  await ensureDomainProductCategories(domain)
}

async function ensureStores(): Promise<void> {
  if ((await db.stores.count()) === 0) {
    try {
      await db.stores.bulkAdd(SEED_STORES)
    } catch {
      // Race / clés déjà présentes (rechargement concurrent) — upsert unitaire.
      for (const store of SEED_STORES) {
        await db.stores.put(store)
      }
    }
  }
}

const DEMO_DATA_PURGED_KEY = 'nora-demo-data-purged-v1'

/** Vide catalogue, ventes, compta, tickets, commandes, etc. (base IndexedDB courante). */
export async function wipeLocalBusinessData(): Promise<void> {
  await Promise.all([
    db.products.clear(),
    db.sales.clear(),
    db.syncQueue.clear(),
    db.storeStocks.clear(),
    db.stockLocations.clear(),
    db.locationStocks.clear(),
    db.locationTransfers.clear(),
    db.stockTransfers.clear(),
    db.dayClosures.clear(),
    db.cashOutflows.clear(),
    db.refunds.clear(),
    db.auditEvents.clear(),
    db.onlineOrders.clear(),
    db.productCategories.clear(),
    db.timePunches.clear(),
    db.diningTables.clear(),
    db.promotions.clear(),
    db.loyaltyCustomers.clear(),
    db.loyaltyTransactions.clear(),
    db.hrRequests.clear(),
    db.crmInteractions.clear(),
    db.ticketInvoices.clear(),
    db.terminalNodes.clear(),
    db.tableReservations.clear(),
    db.kitchenIngredients.clear(),
    db.kitchenIngredientStocks.clear(),
    db.productRecipeIngredients.clear(),
    db.onlineOrderMessages.clear(),
    db.productLots.clear(),
    db.productSerialUnits.clear(),
    db.prescriptions.clear(),
    db.suppliers.clear(),
    db.purchaseOrders.clear(),
    db.quotes.clear(),
    db.repairTickets.clear(),
    db.customerCreditEntries.clear(),
    db.creditSchedules.clear(),
    db.inventorySessions.clear(),
    db.inventoryCountLines.clear(),
    db.lotDisposals.clear(),
    db.deliveryRiders.clear(),
    db.deliveryRuns.clear(),
    db.rentalContracts.clear(),
    db.menuDays.clear(),
    db.productModifiers.clear(),
    db.giftCards.clear(),
    db.appointments.clear(),
    db.priceLists.clear(),
    db.priceListItems.clear(),
    db.supplierReturns.clear(),
    db.productionOrders.clear(),
    db.deliveryNotes.clear(),
    db.businessExpenses.clear(),
    db.customerReturns.clear(),
    db.depositSlips.clear(),
    db.jobSites.clear(),
    db.customerSubscriptions.clear(),
    db.haccpLogs.clear(),
    db.vipClients.clear(),
    db.staffCommissions.clear(),
    db.layaways.clear(),
    db.shrinkageEvents.clear(),
    db.allergenCards.clear(),
    db.venueEvents.clear(),
    db.tradeIns.clear(),
    db.careProtocols.clear(),
    db.wineCellarLots.clear(),
    db.compoundingOrders.clear(),
  ])
  // Magasins : on garde la structure minimale via ensureStores ensuite.
  const stores = await db.stores.toArray()
  const toDelete = stores.filter((s) => s.id !== DEFAULT_STORE_ID).map((s) => s.id)
  if (toDelete.length > 0) await db.stores.bulkDelete(toDelete)
  setLastSyncTimestamp(Date.now())
}

/**
 * Applique une purge locale si le serveur a demandé un wipe plus récent
 * (`forceClientWipeAt` via reset-data / intégrations).
 */
export async function maybeApplyPendingLocalDataWipe(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const creds = getOrganizationCredentials()
  if (!creds) return false

  const forceAt = getStoredForceClientWipeAt()
  if (forceAt <= 0) return false

  const appliedAt = getAppliedLocalWipeAt(creds.organizationId)
  if (appliedAt >= forceAt) return false

  await wipeLocalBusinessData()
  setAppliedLocalWipeAt(creds.organizationId, forceAt)
  return true
}

async function purgeLegacyDemoData(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    if (localStorage.getItem(DEMO_DATA_PURGED_KEY) === '1') return
  } catch {
    // Continuer la purge même si localStorage est indisponible.
  }

  const demoProductIds = new Set(DEMO_PRODUCT_IDS)
  const demoIngredientIds = new Set(DEMO_KITCHEN_INGREDIENT_IDS)
  const demoPromoCodes = new Set(
    DEMO_PROMO_CODES.map((code) => code.toUpperCase()),
  )

  await db.products.bulkDelete([...DEMO_PRODUCT_IDS])

  const storeStocks = await db.storeStocks.toArray()
  await db.storeStocks.bulkDelete(
    storeStocks
      .filter(
        (row) =>
          demoProductIds.has(row.productId) ||
          row.storeId === DEMO_STORE_ANNEX_ID,
      )
      .map((row) => row.id),
  )

  const locationStocks = await db.locationStocks.toArray()
  await db.locationStocks.bulkDelete(
    locationStocks
      .filter(
        (row) =>
          demoProductIds.has(row.productId) ||
          row.storeId === DEMO_STORE_ANNEX_ID,
      )
      .map((row) => row.id),
  )

  const stockTransfers = await db.stockTransfers.toArray()
  await db.stockTransfers.bulkDelete(
    stockTransfers
      .filter(
        (row) =>
          demoProductIds.has(row.productId) ||
          row.fromStoreId === DEMO_STORE_ANNEX_ID ||
          row.toStoreId === DEMO_STORE_ANNEX_ID,
      )
      .map((row) => row.id),
  )

  const locationTransfers = await db.locationTransfers.toArray()
  await db.locationTransfers.bulkDelete(
    locationTransfers
      .filter(
        (row) =>
          demoProductIds.has(row.productId) ||
          row.storeId === DEMO_STORE_ANNEX_ID,
      )
      .map((row) => row.id),
  )

  await db.kitchenIngredients.bulkDelete([...DEMO_KITCHEN_INGREDIENT_IDS])

  const kitchenStocks = await db.kitchenIngredientStocks.toArray()
  await db.kitchenIngredientStocks.bulkDelete(
    kitchenStocks
      .filter(
        (row) =>
          demoIngredientIds.has(row.ingredientId) ||
          row.storeId === DEMO_STORE_ANNEX_ID,
      )
      .map((row) => row.id),
  )

  const recipes = await db.productRecipeIngredients.toArray()
  await db.productRecipeIngredients.bulkDelete(
    recipes
      .filter(
        (row) =>
          demoProductIds.has(row.productId) ||
          demoIngredientIds.has(row.ingredientId),
      )
      .map((row) => row.id),
  )

  const promotions = await db.promotions.toArray()
  await db.promotions.bulkDelete(
    promotions
      .filter((row) => demoPromoCodes.has(row.code.trim().toUpperCase()))
      .map((row) => row.id),
  )

  const stockLocations = await db.stockLocations.toArray()
  await db.stockLocations.bulkDelete(
    stockLocations
      .filter((row) => row.storeId === DEMO_STORE_ANNEX_ID)
      .map((row) => row.id),
  )

  const diningTables = await db.diningTables.toArray()
  await db.diningTables.bulkDelete(
    diningTables
      .filter(
        (row) =>
          row.storeId === DEMO_STORE_ANNEX_ID ||
          /^Table [1-8]$/.test(row.name),
      )
      .map((row) => row.id),
  )

  await db.stores.delete(DEMO_STORE_ANNEX_ID)

  try {
    localStorage.setItem(DEMO_DATA_PURGED_KEY, '1')
  } catch {
    // Ignore — la purge a déjà été appliquée en base.
  }
}

async function ensureKitchenIngredientStocksForAllStores(): Promise<void> {
  const ingredients = await db.kitchenIngredients.toArray()
  if (ingredients.length === 0) return

  const stores = await db.stores.toArray()
  const existing = new Set(
    (await db.kitchenIngredientStocks.toArray()).map((row) => row.id),
  )
  const toPut: KitchenIngredientStock[] = []

  for (const store of stores) {
    for (const ingredient of ingredients) {
      const id = kitchenIngredientStockRowId(store.id, ingredient.id)
      if (existing.has(id)) continue
      toPut.push({
        id,
        storeId: store.id,
        ingredientId: ingredient.id,
        stock: 0,
      })
    }
  }

  if (toPut.length > 0) {
    await db.kitchenIngredientStocks.bulkPut(toPut)
  }
}

async function ensureKitchenStockSeed(): Promise<void> {
  if ((await db.kitchenIngredients.count()) > 0) {
    await ensureKitchenIngredientStocksForAllStores()
  }
}

/** Charge (ou recharge) le jeu de données test local. */
export async function loadTestData(): Promise<void> {
  await ensureStores()
  await injectTestCatalog()
  await migrateProductBusinessDomains()
  const domain = getAppSettings().businessDomain
  await ensureDomainProductCategories(domain)
  await ensureDomainSampleProductsIfEmpty(domain)
  await ensureAllStoreStockRows()
  await ensureStockLocationsSeed()
  await ensureAllLocationStockRows()
  await syncProductCategoriesFromProducts()
  await ensureKitchenIngredientStocksForAllStores()
}

/** Alias historique — charge les données test (catalogue + cuisine). */
export async function loadKitchenStockDemo(): Promise<boolean> {
  await loadTestData()
  return true
}

async function injectTestCatalog(): Promise<void> {
  await db.stores.bulkPut(SEED_STORES)
  await db.products.bulkPut(SEED_PRODUCTS)

  const stockRows: StoreStock[] = []
  for (const [productId, stock] of Object.entries(SEED_INITIAL_STOCK_MAIN)) {
    stockRows.push({
      id: storeStockRowId(DEFAULT_STORE_ID, productId),
      storeId: DEFAULT_STORE_ID,
      productId,
      stock,
    })
  }
  for (const [productId, stock] of Object.entries(SEED_INITIAL_STOCK_ANNEX)) {
    stockRows.push({
      id: storeStockRowId(TEST_STORE_ANNEX_ID, productId),
      storeId: TEST_STORE_ANNEX_ID,
      productId,
      stock,
    })
  }
  if (stockRows.length > 0) {
    await db.storeStocks.bulkPut(stockRows)
  }

  await db.kitchenIngredients.bulkPut(SEED_KITCHEN_INGREDIENTS)
  const kitchenRows: KitchenIngredientStock[] = []
  for (const [ingredientId, stock] of Object.entries(SEED_KITCHEN_STOCK_MAIN)) {
    kitchenRows.push({
      id: kitchenIngredientStockRowId(DEFAULT_STORE_ID, ingredientId),
      storeId: DEFAULT_STORE_ID,
      ingredientId,
      stock,
    })
  }
  if (kitchenRows.length > 0) {
    await db.kitchenIngredientStocks.bulkPut(kitchenRows)
  }

  await db.productRecipeIngredients.bulkPut(SEED_RECIPES)
  await db.diningTables.bulkPut(buildSeedDiningTables(DEFAULT_STORE_ID))
  await db.promotions.bulkPut(buildSeedPromotions())
  await db.loyaltyCustomers.bulkPut(SEED_LOYALTY_CUSTOMERS)

  const existingSaleIds = new Set((await db.sales.toArray()).map((s) => s.id))
  const salesToAdd = buildSeedSales().filter((s) => !existingSaleIds.has(s.id))
  if (salesToAdd.length > 0) {
    await db.sales.bulkAdd(salesToAdd)
  }
}

async function ensureStockLocationsSeed(): Promise<void> {
  const stores = await db.stores.toArray()
  for (const store of stores) {
    const existing = await db.stockLocations.where('storeId').equals(store.id).count()
    if (existing > 0) continue
    await db.stockLocations.bulkAdd([
      {
        id: crypto.randomUUID(),
        storeId: store.id,
        name: 'Réserve',
        code: 'RES',
        sortOrder: 0,
        active: true,
      },
      {
        id: crypto.randomUUID(),
        storeId: store.id,
        name: 'Surface de vente',
        code: 'SHOP',
        sortOrder: 1,
        active: true,
      },
    ])
  }
}

/** Crée toutes les cellules (magasin × produit) manquantes avec stock 0. */
export async function ensureAllStoreStockRows(): Promise<void> {
  const [stores, products, rows] = await Promise.all([
    db.stores.toArray(),
    db.products.toArray(),
    db.storeStocks.toArray(),
  ])
  const have = new Set(rows.map((r) => r.id))
  const batch: StoreStock[] = []
  for (const s of stores) {
    for (const p of products) {
      const id = storeStockRowId(s.id, p.id)
      if (!have.has(id)) {
        batch.push({ id, storeId: s.id, productId: p.id, stock: 0 })
      }
    }
  }
  if (batch.length > 0) {
    await db.storeStocks.bulkPut(batch)
  }
}

export async function ensureAllLocationStockRows(): Promise<void> {
  const [stores, products, locations, rows] = await Promise.all([
    db.stores.toArray(),
    db.products.toArray(),
    db.stockLocations.toArray(),
    db.locationStocks.toArray(),
  ])
  const have = new Set(rows.map((r) => r.id))
  const batch: LocationStock[] = []
  for (const s of stores) {
    const storeLocations = locations.filter((l) => l.storeId === s.id)
    for (const loc of storeLocations) {
      for (const p of products) {
        const id = locationStockRowId(s.id, loc.id, p.id)
        if (!have.has(id)) {
          batch.push({
            id,
            storeId: s.id,
            locationId: loc.id,
            productId: p.id,
            stock: 0,
          })
        }
      }
    }
  }
  if (batch.length > 0) {
    await db.locationStocks.bulkPut(batch)
  }
}

export async function ensureSeed(): Promise<void> {
  await maybeApplyPendingLocalDataWipe()
  await ensureStores()
  await purgeLegacyDemoData()

  // Catalogue de test si la base est vide (après purge / premier lancement).
  if ((await db.products.count()) === 0) {
    await injectTestCatalog()
  }

  await migrateProductBusinessDomains()
  const domain = getAppSettings().businessDomain
  await ensureDomainProductCategories(domain)
  await ensureDomainSampleProductsIfEmpty(domain)
  await ensureAllStoreStockRows()
  await ensureStockLocationsSeed()
  await ensureAllLocationStockRows()
  await syncProductCategoriesFromProducts()
  await ensureKitchenStockSeed()
}
