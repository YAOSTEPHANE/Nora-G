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
  'segmentation',
  'whatsapp',
  'marketing',
  'promotions',
  'loyalty',
  'ticketsFactures',
  'onlineOrders',
  'journal',
  'personnel',
  'vendeuses',
  'pointage',
  'analytique',
  'rentabilite',
  'reporting',
  'controleInterne',
  'evolutivite',
  'integrations',
  'parametres',
  'network',
]

export const BUSINESS_DOMAINS: readonly BusinessDomainMeta[] = [
  {
    id: 'retail',
    label: 'Boutique / commerce',
    description:
      'Détail complet : achats, crédits, livraisons, devis, tarifs, SAV et retours.',
    extraModules: [
      'achats',
      'devis',
      'credits',
      'livraisons',
      'cadeaux',
      'tarifs',
      'bl',
      'sav',
      'retoursFournisseur',
      'retoursClient',
      'consignes',
      'vip',
      'commissions',
      'misesDeCote',
      'pertes',
      'abonnements',
      'evenements',
      'location',
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
    description:
      'Lots, DLC, ordonnances, magistrales, RDV, livraisons et crédits.',
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
      'livraisons',
      'cadeaux',
      'vip',
      'consignes',
      'abonnements',
      'commissions',
      'devis',
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
    description:
      'Séries, devis, SAV, location, reprises, abonnements et livraisons.',
    extraModules: [
      'achats',
      'devis',
      'sav',
      'credits',
      'location',
      'tarifs',
      'bl',
      'retoursClient',
      'retoursFournisseur',
      'abonnements',
      'reprises',
      'commissions',
      'vip',
      'livraisons',
      'cadeaux',
      'misesDeCote',
      'pertes',
      'evenements',
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
    description:
      'Unités, chantiers, devis, location, BL, livraisons et SAV chantier.',
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
      'livraisons',
      'sav',
      'vip',
      'consignes',
      'abonnements',
      'cadeaux',
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
    description:
      'Cuisine, tables, carte, HACCP, cave, événements, achats et livraisons.',
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
      'achats',
      'credits',
      'retoursClient',
      'retoursFournisseur',
      'pertes',
      'abonnements',
      'commissions',
      'rdv',
    ],
    features: {
      prescription: false,
      lots: true,
      serials: false,
      fractionalUnits: false,
      kitchen: true,
      tables: true,
    },
  },
  {
    id: 'bakery',
    label: 'Boulangerie / snacking',
    description:
      'Production, fournées, carte, HACCP, tables snacking et livraisons.',
    extraModules: [
      'achats',
      'production',
      'carte',
      'kitchen',
      'tables',
      'cadeaux',
      'livraisons',
      'consignes',
      'haccp',
      'allergenes',
      'evenements',
      'pertes',
      'credits',
      'retoursClient',
      'retoursFournisseur',
      'vip',
      'commissions',
      'misesDeCote',
      'cave',
      'abonnements',
    ],
    features: {
      prescription: false,
      lots: true,
      serials: false,
      fractionalUnits: false,
      kitchen: true,
      tables: true,
    },
  },
  {
    id: 'beauty',
    label: 'Beauté / salon',
    description:
      'RDV, protocoles, abonnements, VIP, commissions, cadeaux et stock.',
    extraModules: [
      'rdv',
      'cadeaux',
      'credits',
      'achats',
      'sav',
      'abonnements',
      'retoursClient',
      'retoursFournisseur',
      'vip',
      'protocoles',
      'commissions',
      'evenements',
      'livraisons',
      'misesDeCote',
      'pertes',
      'tarifs',
      'devis',
      'location',
      'peremptions',
    ],
    features: {
      prescription: false,
      lots: true,
      serials: false,
      fractionalUnits: false,
      kitchen: false,
      tables: false,
    },
  },
  {
    id: 'wholesale',
    label: 'Grossiste / dépôt',
    description:
      'Tarifs pro, BL, devis, crédits, location, consignes et multi-livraisons.',
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
      'location',
      'sav',
      'vip',
      'cadeaux',
      'chantiers',
    ],
    features: {
      prescription: false,
      lots: true,
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
      'Prêt-à-porter, séries, VIP, mises de côté, reprises et événements.',
    extraModules: [
      'achats',
      'credits',
      'cadeaux',
      'retoursClient',
      'retoursFournisseur',
      'tarifs',
      'misesDeCote',
      'commissions',
      'vip',
      'pertes',
      'livraisons',
      'sav',
      'reprises',
      'abonnements',
      'devis',
      'evenements',
      'consignes',
      'bl',
      'rdv',
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
      'Room service, tables, événements, cave, VIP, hygiène et abonnements.',
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
      'achats',
      'credits',
      'retoursClient',
      'pertes',
      'consignes',
      'cave',
      'commissions',
      'production',
      'carte',
      'sav',
    ],
    features: {
      prescription: false,
      lots: true,
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
