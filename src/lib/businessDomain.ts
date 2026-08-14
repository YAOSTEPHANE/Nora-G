import type { NavViewId } from '../navigation'

/**
 * Domaines métier Nora — chaque commerce n’expose que ses modules
 * et ses spécificités produit (lots, séries, unités, resto…).
 */
export type BusinessDomain =
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

export type DomainProductFeatures = {
  prescription: boolean
  lots: boolean
  serials: boolean
  fractionalUnits: boolean
  kitchen: boolean
  tables: boolean
}

export type BusinessDomainMeta = {
  id: BusinessDomain
  label: string
  description: string
  /** Modules en plus du socle commun (caisse, catalogue, etc.). */
  extraModules: readonly NavViewId[]
  features: DomainProductFeatures
}

/** Modules disponibles pour tous les domaines (hors rôle). */
export const CORE_DOMAIN_MODULES: readonly NavViewId[] = [
  'caisse',
  'catalogue',
  'stocks',
  'inventairePhysique',
  'depenses',
  'comptabilite',
  'rh',
  'crm',
  'promotions',
  'loyalty',
  'ticketsFactures',
  'onlineOrders',
  'journal',
  'personnel',
  'pointage',
  'analytique',
  'integrations',
  'parametres',
  'network',
]

export const BUSINESS_DOMAINS: readonly BusinessDomainMeta[] = [
  {
    id: 'retail',
    label: 'Boutique / commerce',
    description: 'Détail, crédits, livraisons, cadeaux et retours FRS.',
    extraModules: [
      'achats',
      'credits',
      'livraisons',
      'cadeaux',
      'retoursFournisseur',
      'retoursClient',
      'consignes',
      'vip',
      'commissions',
      'misesDeCote',
      'pertes',
    ],
    features: {
      prescription: false,
      lots: false,
      serials: false,
      fractionalUnits: false,
      kitchen: false,
      tables: false,
    },
  },
  {
    id: 'pharmacy',
    label: 'Pharmacie',
    description: 'Lots, DLC, péremptions, crédits, RDV et retours FRS.',
    extraModules: [
      'achats',
      'credits',
      'peremptions',
      'retoursFournisseur',
      'rdv',
      'ordonnances',
      'retoursClient',
      'magistrales',
      'pertes',
    ],
    features: {
      prescription: true,
      lots: true,
      serials: false,
      fractionalUnits: false,
      kitchen: false,
      tables: false,
    },
  },
  {
    id: 'it',
    label: 'Informatique / high-tech',
    description: 'Séries, devis, SAV, location, tarifs pro et BL.',
    extraModules: [
      'achats',
      'devis',
      'sav',
      'credits',
      'location',
      'tarifs',
      'bl',
      'retoursClient',
      'abonnements',
      'reprises',
      'commissions',
      'vip',
    ],
    features: {
      prescription: false,
      lots: false,
      serials: true,
      fractionalUnits: false,
      kitchen: false,
      tables: false,
    },
  },
  {
    id: 'hardware',
    label: 'Quincaillerie / BTP',
    description: 'Unités, devis, location, tarifs pro, BL et retours.',
    extraModules: [
      'achats',
      'devis',
      'credits',
      'location',
      'tarifs',
      'bl',
      'retoursFournisseur',
      'chantiers',
      'retoursClient',
      'misesDeCote',
      'pertes',
      'commissions',
    ],
    features: {
      prescription: false,
      lots: false,
      serials: false,
      fractionalUnits: true,
      kitchen: false,
      tables: false,
    },
  },
  {
    id: 'restaurant',
    label: 'Restaurant / café',
    description: 'Cuisine, tables, livraisons, carte, cadeaux et production.',
    extraModules: [
      'kitchen',
      'tables',
      'livraisons',
      'carte',
      'cadeaux',
      'production',
      'consignes',
      'haccp',
      'allergenes',
      'evenements',
      'cave',
      'vip',
    ],
    features: {
      prescription: false,
      lots: false,
      serials: false,
      fractionalUnits: false,
      kitchen: true,
      tables: true,
    },
  },
  {
    id: 'bakery',
    label: 'Boulangerie / snacking',
    description: 'Production / fournées, carte, cuisine et cadeaux.',
    extraModules: [
      'achats',
      'production',
      'carte',
      'kitchen',
      'cadeaux',
      'livraisons',
      'consignes',
      'haccp',
      'allergenes',
      'evenements',
      'pertes',
    ],
    features: {
      prescription: false,
      lots: false,
      serials: false,
      fractionalUnits: false,
      kitchen: true,
      tables: false,
    },
  },
  {
    id: 'beauty',
    label: 'Beauté / salon',
    description: 'Rendez-vous, cadeaux, crédits et SAV léger.',
    extraModules: [
      'rdv',
      'cadeaux',
      'credits',
      'achats',
      'sav',
      'abonnements',
      'retoursClient',
      'vip',
      'protocoles',
      'commissions',
      'evenements',
    ],
    features: {
      prescription: false,
      lots: false,
      serials: false,
      fractionalUnits: false,
      kitchen: false,
      tables: false,
    },
  },
  {
    id: 'wholesale',
    label: 'Grossiste / dépôt',
    description: 'Tarifs pro, BL, devis, crédits, achats et retours.',
    extraModules: [
      'achats',
      'devis',
      'credits',
      'tarifs',
      'bl',
      'retoursFournisseur',
      'livraisons',
      'consignes',
      'retoursClient',
      'abonnements',
      'commissions',
      'misesDeCote',
      'pertes',
    ],
    features: {
      prescription: false,
      lots: false,
      serials: false,
      fractionalUnits: true,
      kitchen: false,
      tables: false,
    },
  },
  {
    id: 'fashion',
    label: 'Mode / luxe',
    description:
      'Prêt-à-porter, mises de côté, commissions, VIP et authentification.',
    extraModules: [
      'achats',
      'credits',
      'cadeaux',
      'retoursClient',
      'tarifs',
      'misesDeCote',
      'commissions',
      'vip',
      'pertes',
    ],
    features: {
      prescription: false,
      lots: false,
      serials: true,
      fractionalUnits: false,
      kitchen: false,
      tables: false,
    },
  },
  {
    id: 'hotel',
    label: 'Hôtel / résidence',
    description:
      'Conciergerie, room service, événements, VIP et hygiène.',
    extraModules: [
      'kitchen',
      'tables',
      'rdv',
      'evenements',
      'vip',
      'cadeaux',
      'haccp',
      'abonnements',
      'allergenes',
      'livraisons',
    ],
    features: {
      prescription: false,
      lots: false,
      serials: false,
      fractionalUnits: false,
      kitchen: true,
      tables: true,
    },
  },
] as const

const META_BY_ID: Record<BusinessDomain, BusinessDomainMeta> =
  Object.fromEntries(BUSINESS_DOMAINS.map((d) => [d.id, d])) as Record<
    BusinessDomain,
    BusinessDomainMeta
  >

export function isBusinessDomain(value: unknown): value is BusinessDomain {
  return (
    typeof value === 'string' &&
    BUSINESS_DOMAINS.some((d) => d.id === value)
  )
}

export function getBusinessDomainMeta(
  domain: BusinessDomain,
): BusinessDomainMeta {
  return META_BY_ID[domain]
}

export function modulesForDomain(domain: BusinessDomain): Set<NavViewId> {
  const meta = META_BY_ID[domain]
  return new Set<NavViewId>([...CORE_DOMAIN_MODULES, ...meta.extraModules])
}

export function domainAllowsView(
  domain: BusinessDomain,
  view: NavViewId,
): boolean {
  if (view === 'dash') return true
  return modulesForDomain(domain).has(view)
}

export function featuresForDomain(
  domain: BusinessDomain,
): DomainProductFeatures {
  return META_BY_ID[domain].features
}
