import type {
  DiningTable,
  KitchenIngredient,
  LoyaltyCustomer,
  Product,
  ProductRecipeIngredient,
  Promotion,
  Sale,
} from './types'

/** Magasin principal (aligné avec seedStores). */
const DEFAULT_STORE_ID = 'store-main'

/** Identifiants des anciennes données de démonstration (purge one-shot). */
export const DEMO_PRODUCT_IDS: readonly string[] = Array.from(
  { length: 30 },
  (_, i) => `p${i + 1}`,
)

export const DEMO_KITCHEN_INGREDIENT_IDS: readonly string[] = [
  'ing-poulet',
  'ing-poisson',
  'ing-huile',
  'ing-oignon',
  'ing-attieke',
  'ing-riz',
]

export const DEMO_PROMO_CODES: readonly string[] = ['PROMO5', 'PROMO10']

export const DEMO_STORE_ANNEX_ID = 'store-annex'

/** Second magasin de test (multi-magasins) — voir aussi seedStores.TEST_STORE_ANNEX_ID. */
export const TEST_STORE_ANNEX_ID = 'store-test-annex'

/** Stocks initiaux magasin principal. */
export const SEED_INITIAL_STOCK_MAIN: Record<string, number> = {
  p1: 48,
  p2: 5,
  p3: 0,
  p4: 32,
  p5: 7,
  p6: 15,
  p7: 22,
  p8: 3,
  p9: 100,
  p10: 18,
  p11: 12,
  p12: 25,
  p13: 40,
  p14: 8,
  p15: 16,
  p16: 6,
  p17: 20,
  p18: 14,
}

/** Stocks initiaux magasin annexe (sous-ensemble). */
export const SEED_INITIAL_STOCK_ANNEX: Record<string, number> = {
  p1: 20,
  p2: 10,
  p3: 8,
  p4: 15,
  p10: 6,
  p11: 4,
  p13: 12,
}

/** Catalogue de test — commerce / restauration CI. */
export const SEED_PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: 'Eau minérale 1.5L',
    priceTTC: 500,
    purchasePriceTTC: 280,
    category: 'Boissons',
    barcode: '3661234567890',
    lowStockThreshold: 10,
    vatRatePct: 18,
    archived: false,
    businessDomain: 'retail',
    description: 'Eau minérale naturelle, bouteille 1,5 L.',
  },
  {
    id: 'p2',
    name: 'Jus de bissap 1L',
    priceTTC: 800,
    purchasePriceTTC: 400,
    category: 'Boissons',
    barcode: '3661234567891',
    lowStockThreshold: 8,
    vatRatePct: 18,
    archived: false,
    businessDomain: 'retail',
  },
  {
    id: 'p3',
    name: 'Coca-Cola 33cl',
    priceTTC: 400,
    purchasePriceTTC: 220,
    category: 'Boissons',
    barcode: '3661234567892',
    lowStockThreshold: 12,
    vatRatePct: 18,
    archived: false,
    businessDomain: 'retail',
  },
  {
    id: 'p4',
    name: 'Riz parfumé 1kg',
    priceTTC: 1200,
    purchasePriceTTC: 750,
    category: 'Alimentation',
    barcode: '3661234567893',
    lowStockThreshold: 5,
    vatRatePct: 18,
    archived: false,
    businessDomain: 'retail',
  },
  {
    id: 'p5',
    name: 'Huile végétale 1L',
    priceTTC: 1500,
    purchasePriceTTC: 1100,
    category: 'Alimentation',
    barcode: '3661234567894',
    lowStockThreshold: 6,
    vatRatePct: 18,
    archived: false,
    businessDomain: 'retail',
  },
  {
    id: 'p6',
    name: 'Pain de mie',
    priceTTC: 600,
    purchasePriceTTC: 350,
    category: 'Alimentation',
    barcode: '3661234567895',
    lowStockThreshold: 4,
    vatRatePct: 18,
    archived: false,
    businessDomain: 'retail',
  },
  {
    id: 'p7',
    name: 'Savon 250g',
    priceTTC: 350,
    purchasePriceTTC: 180,
    category: 'Hygiène',
    barcode: '3661234567896',
    lowStockThreshold: 10,
    vatRatePct: 18,
    archived: false,
    businessDomain: 'retail',
  },
  {
    id: 'p8',
    name: 'Papier toilette (x4)',
    priceTTC: 900,
    purchasePriceTTC: 550,
    category: 'Hygiène',
    barcode: '3661234567897',
    lowStockThreshold: 5,
    vatRatePct: 18,
    archived: false,
    businessDomain: 'retail',
  },
  {
    id: 'p9',
    name: 'Sacs réutilisables',
    priceTTC: 200,
    purchasePriceTTC: 80,
    category: 'Autre',
    barcode: '3661234567898',
    lowStockThreshold: 20,
    vatRatePct: 18,
    archived: false,
    businessDomain: 'retail',
  },
  {
    id: 'p10',
    name: 'Poulet braisé',
    priceTTC: 3500,
    purchasePriceTTC: 1800,
    category: 'Plats',
    barcode: '3661234567900',
    lowStockThreshold: 5,
    vatRatePct: 18,
    archived: false,
    businessDomain: 'restaurant',
    description: 'Demi-poulet braisé, accompagnement au choix.',
    highlights: ['Fait maison', 'Portion généreuse'],
  },
  {
    id: 'p11',
    name: 'Attiéké poisson',
    priceTTC: 2500,
    purchasePriceTTC: 1200,
    category: 'Plats',
    barcode: '3661234567901',
    lowStockThreshold: 5,
    vatRatePct: 18,
    archived: false,
    businessDomain: 'restaurant',
  },
  {
    id: 'p12',
    name: 'Garba complet',
    priceTTC: 1500,
    purchasePriceTTC: 700,
    category: 'Plats',
    barcode: '3661234567902',
    lowStockThreshold: 8,
    vatRatePct: 18,
    archived: false,
    businessDomain: 'restaurant',
  },
  {
    id: 'p13',
    name: 'Alloco',
    priceTTC: 1000,
    purchasePriceTTC: 400,
    category: 'Plats',
    barcode: '3661234567903',
    lowStockThreshold: 10,
    vatRatePct: 18,
    archived: false,
    businessDomain: 'restaurant',
  },
  {
    id: 'p14',
    name: 'Foutou banane + sauce graine',
    priceTTC: 2800,
    purchasePriceTTC: 1400,
    category: 'Plats',
    barcode: '3661234567904',
    lowStockThreshold: 4,
    vatRatePct: 18,
    archived: false,
    businessDomain: 'restaurant',
  },
  {
    id: 'p15',
    name: 'Bissap frais 50cl',
    priceTTC: 500,
    purchasePriceTTC: 200,
    category: 'Boissons resto',
    barcode: '3661234567905',
    lowStockThreshold: 15,
    vatRatePct: 18,
    archived: false,
    businessDomain: 'restaurant',
  },
  {
    id: 'p16',
    name: 'Gingembre 50cl',
    priceTTC: 500,
    purchasePriceTTC: 200,
    category: 'Boissons resto',
    barcode: '3661234567906',
    lowStockThreshold: 15,
    vatRatePct: 18,
    archived: false,
    businessDomain: 'restaurant',
  },
  {
    id: 'p17',
    name: 'Café expresso',
    priceTTC: 700,
    purchasePriceTTC: 250,
    category: 'Boissons resto',
    barcode: '3661234567907',
    lowStockThreshold: 20,
    vatRatePct: 18,
    archived: false,
    businessDomain: 'restaurant',
  },
  {
    id: 'p18',
    name: 'Dessert thiakry',
    priceTTC: 800,
    purchasePriceTTC: 350,
    category: 'Desserts',
    barcode: '3661234567908',
    lowStockThreshold: 8,
    vatRatePct: 18,
    archived: false,
    businessDomain: 'restaurant',
  },
]

export const SEED_KITCHEN_INGREDIENTS: KitchenIngredient[] = [
  {
    id: 'test-ing-poulet',
    name: 'Poulet (pièces)',
    unit: 'piece',
    lowStockThreshold: 10,
  },
  {
    id: 'test-ing-poisson',
    name: 'Poisson',
    unit: 'kg',
    lowStockThreshold: 3,
  },
  {
    id: 'test-ing-huile',
    name: 'Huile de friture',
    unit: 'l',
    lowStockThreshold: 2,
  },
  {
    id: 'test-ing-attieke',
    name: 'Attiéké',
    unit: 'kg',
    lowStockThreshold: 5,
  },
  {
    id: 'test-ing-banane',
    name: 'Banane plantain',
    unit: 'kg',
    lowStockThreshold: 4,
  },
]

export const SEED_KITCHEN_STOCK_MAIN: Record<string, number> = {
  'test-ing-poulet': 24,
  'test-ing-poisson': 8,
  'test-ing-huile': 5,
  'test-ing-attieke': 12,
  'test-ing-banane': 10,
}

export const SEED_RECIPES: ProductRecipeIngredient[] = [
  {
    id: 'recipe-p10-poulet',
    productId: 'p10',
    ingredientId: 'test-ing-poulet',
    qtyPerUnit: 0.5,
  },
  {
    id: 'recipe-p11-poisson',
    productId: 'p11',
    ingredientId: 'test-ing-poisson',
    qtyPerUnit: 0.25,
  },
  {
    id: 'recipe-p11-attieke',
    productId: 'p11',
    ingredientId: 'test-ing-attieke',
    qtyPerUnit: 0.2,
  },
  {
    id: 'recipe-p13-banane',
    productId: 'p13',
    ingredientId: 'test-ing-banane',
    qtyPerUnit: 0.3,
  },
  {
    id: 'recipe-p13-huile',
    productId: 'p13',
    ingredientId: 'test-ing-huile',
    qtyPerUnit: 0.05,
  },
]

export function buildSeedDiningTables(storeId: string): DiningTable[] {
  return [
    {
      id: `tbl-${storeId}-01`,
      storeId,
      name: 'T-01',
      capacity: 2,
      area: 'Terrasse',
      status: 'free',
      sortOrder: 0,
    },
    {
      id: `tbl-${storeId}-02`,
      storeId,
      name: 'T-02',
      capacity: 4,
      area: 'Salle',
      status: 'occupied',
      occupiedSince: Date.now() - 25 * 60_000,
      sortOrder: 1,
    },
    {
      id: `tbl-${storeId}-03`,
      storeId,
      name: 'T-03',
      capacity: 4,
      area: 'Salle',
      status: 'free',
      sortOrder: 2,
    },
    {
      id: `tbl-${storeId}-04`,
      storeId,
      name: 'T-04',
      capacity: 6,
      area: 'VIP',
      status: 'reserved',
      note: 'Réservation 19h — famille K.',
      sortOrder: 3,
    },
    {
      id: `tbl-${storeId}-05`,
      storeId,
      name: 'T-05',
      capacity: 2,
      area: 'Bar',
      status: 'cleaning',
      sortOrder: 4,
    },
    {
      id: `tbl-${storeId}-06`,
      storeId,
      name: 'T-06',
      capacity: 8,
      area: 'Salle',
      status: 'free',
      sortOrder: 5,
    },
  ]
}

export function buildSeedPromotions(now = Date.now()): Promotion[] {
  return [
    {
      id: 'promo-bienvenue',
      code: 'BIENVENUE10',
      label: 'Bienvenue −10 %',
      discountPct: 10,
      active: true,
      startAt: now - 7 * 86_400_000,
      endAt: now + 60 * 86_400_000,
      minCartTTC: 2000,
      usageCount: 3,
      maxUsage: 200,
      createdAt: now - 7 * 86_400_000,
      updatedAt: now,
    },
    {
      id: 'promo-midi',
      code: 'MIDI5',
      label: 'Formule midi −5 %',
      discountPct: 5,
      active: true,
      minCartTTC: 1500,
      usageCount: 12,
      createdAt: now - 14 * 86_400_000,
      updatedAt: now,
    },
  ]
}

export const SEED_LOYALTY_CUSTOMERS: LoyaltyCustomer[] = [
  {
    id: 'loyalty-awa',
    phone: '0701234567',
    displayName: 'Awa Traoré',
    points: 120,
    totalSpentTTC: 48_500,
    visitCount: 9,
    createdAt: Date.now() - 40 * 86_400_000,
    updatedAt: Date.now() - 2 * 86_400_000,
  },
  {
    id: 'loyalty-koffi',
    phone: '0509876543',
    displayName: 'Koffi Mensah',
    points: 45,
    totalSpentTTC: 18_200,
    visitCount: 4,
    createdAt: Date.now() - 20 * 86_400_000,
    updatedAt: Date.now() - 1 * 86_400_000,
  },
  {
    id: 'loyalty-fatou',
    phone: '0101122334',
    displayName: 'Fatou Diabaté',
    points: 210,
    totalSpentTTC: 92_000,
    visitCount: 17,
    createdAt: Date.now() - 90 * 86_400_000,
    updatedAt: Date.now() - 5 * 86_400_000,
  },
]

function saleFromLines(
  id: string,
  createdAt: number,
  lines: { product: Product; qty: number }[],
  paymentMethod: Sale['paymentMethod'],
  extras?: Partial<Sale>,
): Sale {
  const saleLines = lines.map(({ product, qty }) => ({
    productId: product.id,
    name: product.name,
    unitPriceTTC: product.priceTTC,
    qty,
    vatRatePct: product.vatRatePct,
  }))
  const totalTTC = saleLines.reduce((s, l) => s + l.unitPriceTTC * l.qty, 0)
  const avgVat =
    saleLines.reduce((s, l) => s + (l.vatRatePct ?? 18), 0) / saleLines.length
  const subtotalHT = Math.round(totalTTC / (1 + avgVat / 100))
  const tva = totalTTC - subtotalHT
  const paymentSplit =
    paymentMethod === 'cash'
      ? { cash: totalTTC, card: 0, mobile: 0 }
      : paymentMethod === 'card'
        ? { cash: 0, card: totalTTC, mobile: 0 }
        : paymentMethod === 'mobile'
          ? { cash: 0, card: 0, mobile: totalTTC, mobileOperator: 'orange' as const }
          : {
              cash: Math.round(totalTTC / 2),
              card: 0,
              mobile: totalTTC - Math.round(totalTTC / 2),
              mobileOperator: 'wave' as const,
            }

  return {
    id,
    createdAt,
    lines: saleLines,
    subtotalHT,
    tva,
    totalTTC,
    discountPct: 0,
    paymentMethod,
    paymentSplit,
    synced: true,
    storeId: DEFAULT_STORE_ID,
    storeName: 'Magasin principal',
    cashierProfileId: 'profile-caissier',
    cashierDisplayName: 'Awa Konaté',
    ...extras,
  }
}

/** Quelques ventes sur les derniers jours (tableau de bord). */
export function buildSeedSales(now = Date.now()): Sale[] {
  const byId = new Map(SEED_PRODUCTS.map((p) => [p.id, p]))
  const p = (id: string) => byId.get(id)!
  const day = 86_400_000
  const hour = 3_600_000

  return [
    saleFromLines(
      'sale-test-1',
      now - 2 * hour,
      [
        { product: p('p10'), qty: 2 },
        { product: p('p15'), qty: 2 },
      ],
      'mobile',
    ),
    saleFromLines(
      'sale-test-2',
      now - 5 * hour,
      [
        { product: p('p11'), qty: 1 },
        { product: p('p13'), qty: 1 },
        { product: p('p3'), qty: 2 },
      ],
      'cash',
      { cashReceived: 5000, changeDue: 600 },
    ),
    saleFromLines(
      'sale-test-3',
      now - day + 3 * hour,
      [
        { product: p('p12'), qty: 3 },
        { product: p('p16'), qty: 3 },
      ],
      'mixed',
    ),
    saleFromLines(
      'sale-test-4',
      now - day + 8 * hour,
      [
        { product: p('p1'), qty: 6 },
        { product: p('p4'), qty: 2 },
        { product: p('p7'), qty: 1 },
      ],
      'card',
      { cardTpeReference: 'TPE-DEMO-88421' },
    ),
    saleFromLines(
      'sale-test-5',
      now - 2 * day + 4 * hour,
      [
        { product: p('p14'), qty: 2 },
        { product: p('p17'), qty: 2 },
        { product: p('p18'), qty: 1 },
      ],
      'mobile',
      {
        loyaltyCustomerId: 'loyalty-awa',
        loyaltyCustomerPhone: '0701234567',
        loyaltyPointsEarned: 35,
      },
    ),
    saleFromLines(
      'sale-test-6',
      now - 3 * day + 6 * hour,
      [
        { product: p('p5'), qty: 1 },
        { product: p('p6'), qty: 2 },
        { product: p('p9'), qty: 1 },
      ],
      'cash',
    ),
  ]
}
