import type { BusinessDomain } from './businessDomain'
import type { Product } from '../db/types'

/** Catégories catalogue par domaine (distinctes autant que possible). */
export const DOMAIN_CATEGORIES: Record<BusinessDomain, readonly string[]> = {
  retail: [
    'Boissons',
    'Alimentation',
    'Hygiène',
    'Épicerie',
    'Divers boutique',
    'Autre',
  ],
  pharmacy: [
    'Médicaments',
    'Parapharmacie',
    'Ordonnance',
    'Bébé / maternité',
    'Hygiène pharma',
    'Autre pharma',
  ],
  it: [
    'Smartphones',
    'Ordinateurs',
    'Accessoires IT',
    'Réseau',
    'Stockage',
    'Autre IT',
  ],
  hardware: [
    'Quincaillerie',
    'Outillage',
    'Plomberie',
    'Électricité',
    'Peinture',
    'Bâtiment',
    'Autre quincaillerie',
  ],
  restaurant: [
    'Plats',
    'Entrées',
    'Boissons resto',
    'Desserts',
    'Menus',
    'Autre resto',
  ],
  bakery: [
    'Pains',
    'Viennoiseries',
    'Pâtisseries',
    'Snacking',
    'Boissons boulangerie',
    'Autre boulangerie',
  ],
  beauty: [
    'Coiffure',
    'Soins',
    'Maquillage',
    'Onglerie',
    'Produits beauté',
    'Autre beauté',
  ],
  wholesale: [
    'Cartons / lots',
    'Vrac dépôt',
    'Boissons gros',
    'Alimentation gros',
    'Hygiène gros',
    'Autre gros',
  ],
  fashion: [
    'Prêt-à-porter',
    'Chaussures',
    'Sacs',
    'Accessoires mode',
    'Lingerie',
    'Autre mode',
  ],
  hotel: [
    'Chambres',
    'Room service',
    'Mini-bar',
    'Spa',
    'Autre hôtel',
  ],
}

/** Toutes les catégories connues (union des domaines). */
export const ALL_DOMAIN_CATEGORIES: readonly string[] = Array.from(
  new Set(Object.values(DOMAIN_CATEGORIES).flatMap((c) => [...c])),
)

export function categoriesForDomain(domain: BusinessDomain): readonly string[] {
  return DOMAIN_CATEGORIES[domain]
}

/** Domaines dont la liste contient ce libellé (casse ignorée). */
export function domainsForCategoryLabel(label: string): BusinessDomain[] {
  const key = label.trim().toLowerCase()
  if (!key) return []
  const out: BusinessDomain[] = []
  for (const [domain, cats] of Object.entries(DOMAIN_CATEGORIES) as [
    BusinessDomain,
    readonly string[],
  ][]) {
    if (cats.some((c) => c.toLowerCase() === key)) out.push(domain)
  }
  return out
}

/**
 * Infère un domaine à partir de la catégorie :
 * - catégorie exclusive à un domaine → ce domaine
 * - sinon → retail (legacy / ambigu)
 */
export function inferDomainFromCategory(category: string): BusinessDomain {
  const matches = domainsForCategoryLabel(category)
  if (matches.length === 1) return matches[0]!
  return 'retail'
}

export function productBelongsToDomain(
  product: Pick<Product, 'category' | 'businessDomain'>,
  domain: BusinessDomain,
): boolean {
  if (product.businessDomain) {
    return product.businessDomain === domain
  }
  return inferDomainFromCategory(product.category) === domain
}

/** Onglets catégorie : pack du domaine + catégories réellement utilisées par les produits du domaine. */
export function categoryTabsForDomain(
  domain: BusinessDomain,
  usedCategoryNames: string[],
): string[] {
  const pack = categoriesForDomain(domain)
  const packLower = new Set(pack.map((c) => c.toLowerCase()))
  const extra: string[] = []
  const seenExtra = new Set<string>()
  for (const name of usedCategoryNames) {
    const trimmed = name.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (packLower.has(key) || seenExtra.has(key)) continue
    // Ne pas réintroduire une catégorie d’un autre domaine
    const owners = domainsForCategoryLabel(trimmed)
    if (owners.length > 0 && !owners.includes(domain)) continue
    seenExtra.add(key)
    extra.push(trimmed)
  }
  return ['Tous', ...pack, ...extra]
}

/** Liste déroulante catégories : pack domaine + customs non rattachés à un autre métier. */
export function categorySelectOptionsForDomain(
  domain: BusinessDomain,
  dbCategoryNames: string[],
): string[] {
  const pack = [...categoriesForDomain(domain)]
  const seen = new Set(pack.map((c) => c.toLowerCase()))
  for (const name of dbCategoryNames) {
    const trimmed = name.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    const owners = domainsForCategoryLabel(trimmed)
    if (owners.length > 0 && !owners.includes(domain)) continue
    pack.push(trimmed)
    seen.add(key)
  }
  return pack
}

/** Exemples produits pour amorcer un domaine vide (données de test légères). */
export function sampleProductsForDomain(domain: BusinessDomain): Omit<
  Product,
  'id'
>[] {
  const stamp = (p: Omit<Product, 'id' | 'businessDomain' | 'archived'>): Omit<
    Product,
    'id'
  > => ({
    ...p,
    archived: false,
    businessDomain: domain,
  })

  switch (domain) {
    case 'retail':
      return [
        stamp({
          name: 'Eau minérale 1.5L',
          priceTTC: 500,
          purchasePriceTTC: 280,
          category: 'Boissons',
          barcode: '',
          lowStockThreshold: 10,
          vatRatePct: 18,
        }),
        stamp({
          name: 'Riz 1kg',
          priceTTC: 1200,
          purchasePriceTTC: 750,
          category: 'Alimentation',
          barcode: '',
          lowStockThreshold: 5,
          vatRatePct: 18,
        }),
        stamp({
          name: 'Savon 250g',
          priceTTC: 350,
          purchasePriceTTC: 180,
          category: 'Hygiène',
          barcode: '',
          lowStockThreshold: 10,
          vatRatePct: 18,
        }),
      ]
    case 'pharmacy':
      return [
        stamp({
          name: 'Paracétamol 500mg',
          priceTTC: 800,
          category: 'Médicaments',
          barcode: '',
          lowStockThreshold: 20,
          vatRatePct: 0,
          requiresPrescription: false,
          trackLots: true,
        }),
        stamp({
          name: 'Vitamine C',
          priceTTC: 2500,
          category: 'Parapharmacie',
          barcode: '',
          lowStockThreshold: 8,
          vatRatePct: 18,
          trackLots: true,
        }),
        stamp({
          name: 'Sirop ordonnance',
          priceTTC: 3500,
          category: 'Ordonnance',
          barcode: '',
          lowStockThreshold: 5,
          vatRatePct: 0,
          requiresPrescription: true,
          trackLots: true,
        }),
      ]
    case 'it':
      return [
        stamp({
          name: 'Smartphone entrée de gamme',
          priceTTC: 85000,
          category: 'Smartphones',
          barcode: '',
          lowStockThreshold: 2,
          vatRatePct: 18,
          trackSerialNumbers: true,
        }),
        stamp({
          name: 'Écouteurs Bluetooth',
          priceTTC: 12000,
          category: 'Accessoires IT',
          barcode: '',
          lowStockThreshold: 5,
          vatRatePct: 18,
        }),
        stamp({
          name: 'Clé USB 64 Go',
          priceTTC: 6500,
          category: 'Stockage',
          barcode: '',
          lowStockThreshold: 8,
          vatRatePct: 18,
          trackSerialNumbers: true,
        }),
      ]
    case 'hardware':
      return [
        stamp({
          name: 'Vis à bois (boîte)',
          priceTTC: 1500,
          category: 'Quincaillerie',
          barcode: '',
          lowStockThreshold: 10,
          vatRatePct: 18,
          saleUnit: 'box',
          allowFractionalQty: false,
          packContentQty: 100,
          packContentLabel: 'vis',
        }),
        stamp({
          name: 'Câble électrique (m)',
          priceTTC: 450,
          category: 'Électricité',
          barcode: '',
          lowStockThreshold: 50,
          vatRatePct: 18,
          saleUnit: 'm',
          allowFractionalQty: true,
        }),
        stamp({
          name: 'Peinture 4L',
          priceTTC: 18000,
          category: 'Peinture',
          barcode: '',
          lowStockThreshold: 4,
          vatRatePct: 18,
          saleUnit: 'l',
          allowFractionalQty: true,
        }),
      ]
    case 'restaurant':
      return [
        stamp({
          name: 'Poulet braisé',
          priceTTC: 3500,
          category: 'Plats',
          barcode: '',
          lowStockThreshold: 5,
          vatRatePct: 18,
        }),
        stamp({
          name: 'Attiéké poisson',
          priceTTC: 2500,
          category: 'Plats',
          barcode: '',
          lowStockThreshold: 5,
          vatRatePct: 18,
        }),
        stamp({
          name: 'Jus bissap',
          priceTTC: 500,
          category: 'Boissons resto',
          barcode: '',
          lowStockThreshold: 20,
          vatRatePct: 18,
        }),
      ]
    case 'bakery':
      return [
        stamp({
          name: 'Baguette',
          priceTTC: 200,
          category: 'Pains',
          barcode: '',
          lowStockThreshold: 30,
          vatRatePct: 0,
        }),
        stamp({
          name: 'Croissant',
          priceTTC: 350,
          category: 'Viennoiseries',
          barcode: '',
          lowStockThreshold: 20,
          vatRatePct: 18,
        }),
        stamp({
          name: 'Pain au chocolat',
          priceTTC: 400,
          category: 'Viennoiseries',
          barcode: '',
          lowStockThreshold: 15,
          vatRatePct: 18,
        }),
        stamp({
          name: 'Lait 1L',
          priceTTC: 900,
          category: 'Boissons boulangerie',
          barcode: '',
          lowStockThreshold: 8,
          vatRatePct: 18,
          trackLots: true,
        }),
      ]
    case 'beauty':
      return [
        stamp({
          name: 'Brushing',
          priceTTC: 5000,
          category: 'Coiffure',
          barcode: '',
          lowStockThreshold: 0,
          vatRatePct: 18,
        }),
        stamp({
          name: 'Vernis',
          priceTTC: 2500,
          category: 'Onglerie',
          barcode: '',
          lowStockThreshold: 10,
          vatRatePct: 18,
        }),
        stamp({
          name: 'Crème hydratante',
          priceTTC: 4500,
          category: 'Produits beauté',
          barcode: '',
          lowStockThreshold: 5,
          vatRatePct: 18,
        }),
      ]
    case 'wholesale':
      return [
        stamp({
          name: 'Carton eau 12×1.5L',
          priceTTC: 5500,
          category: 'Cartons / lots',
          barcode: '',
          lowStockThreshold: 20,
          vatRatePct: 18,
          saleUnit: 'box',
        }),
        stamp({
          name: 'Sac riz 25kg',
          priceTTC: 22000,
          category: 'Alimentation gros',
          barcode: '',
          lowStockThreshold: 10,
          vatRatePct: 18,
          saleUnit: 'pack',
        }),
        stamp({
          name: 'Carton savon',
          priceTTC: 8500,
          category: 'Hygiène gros',
          barcode: '',
          lowStockThreshold: 15,
          vatRatePct: 18,
          saleUnit: 'box',
        }),
      ]
    case 'fashion':
      return [
        stamp({
          name: 'Chemise lin',
          priceTTC: 35000,
          category: 'Prêt-à-porter',
          barcode: '',
          lowStockThreshold: 3,
          vatRatePct: 18,
          trackSerialNumbers: true,
        }),
        stamp({
          name: 'Sandales cuir',
          priceTTC: 28000,
          category: 'Chaussures',
          barcode: '',
          lowStockThreshold: 4,
          vatRatePct: 18,
        }),
        stamp({
          name: 'Sac cabas',
          priceTTC: 45000,
          category: 'Sacs',
          barcode: '',
          lowStockThreshold: 2,
          vatRatePct: 18,
          trackSerialNumbers: true,
        }),
      ]
    case 'hotel':
      return [
        stamp({
          name: 'Nuit chambre standard',
          priceTTC: 45000,
          category: 'Chambres',
          barcode: '',
          lowStockThreshold: 0,
          vatRatePct: 18,
        }),
        stamp({
          name: 'Petit-déjeuner',
          priceTTC: 4500,
          category: 'Room service',
          barcode: '',
          lowStockThreshold: 20,
          vatRatePct: 18,
        }),
        stamp({
          name: 'Eau minérale mini-bar',
          priceTTC: 1500,
          category: 'Mini-bar',
          barcode: '',
          lowStockThreshold: 24,
          vatRatePct: 18,
        }),
      ]
    default: {
      const _e: never = domain
      return _e
    }
  }
}
