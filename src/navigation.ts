import type { UserRole } from './auth/types'

export type NavViewId =
  | 'dash'
  | 'caisse'
  | 'catalogue'
  | 'stocks'
  | 'comptabilite'
  | 'rh'
  | 'crm'
  | 'segmentation'
  | 'whatsapp'
  | 'marketing'
  | 'tables'
  | 'promotions'
  | 'loyalty'
  | 'kitchen'
  | 'ticketsFactures'
  | 'onlineOrders'
  | 'journal'
  | 'personnel'
  | 'vendeuses'
  | 'pointage'
  | 'analytique'
  | 'rentabilite'
  | 'reporting'
  | 'controleInterne'
  | 'evolutivite'
  | 'integrations'
  | 'parametres'
  | 'network'
  | 'achats'
  | 'devis'
  | 'sav'
  | 'credits'
  | 'inventairePhysique'
  | 'peremptions'
  | 'livraisons'
  | 'location'
  | 'carte'
  | 'cadeaux'
  | 'rdv'
  | 'tarifs'
  | 'retoursFournisseur'
  | 'production'
  | 'bl'
  | 'depenses'
  | 'retoursClient'
  | 'consignes'
  | 'ordonnances'
  | 'chantiers'
  | 'abonnements'
  | 'haccp'
  | 'vip'
  | 'commissions'
  | 'misesDeCote'
  | 'pertes'
  | 'allergenes'
  | 'evenements'
  | 'reprises'
  | 'protocoles'
  | 'cave'
  | 'magistrales'

/** Libellés courts pour la grille modules et la navigation. */
export const VIEW_LABELS: Record<NavViewId, string> = {
  dash: 'Tableau de bord',
  caisse: 'Caisse',
  catalogue: 'Articles',
  stocks: 'Inventaire',
  comptabilite: 'Compta',
  rh: 'RH',
  crm: 'Clients',
  segmentation: 'Segments',
  whatsapp: 'WhatsApp',
  marketing: 'Marketing',
  tables: 'Tables',
  promotions: 'Offres',
  loyalty: 'Fidélité',
  kitchen: 'Cuisine',
  ticketsFactures: 'Factures',
  onlineOrders: 'Commandes',
  journal: 'Journal',
  personnel: 'Équipe',
  vendeuses: 'Vendeuses',
  pointage: 'Présences',
  analytique: 'Stats',
  rentabilite: 'Marges',
  reporting: 'Pilotage',
  controleInterne: 'Contrôle',
  evolutivite: 'Évolutivité',
  integrations: 'Connexions',
  parametres: 'Réglages',
  network: 'Magasins',
  achats: 'Achats',
  devis: 'Devis',
  sav: 'SAV',
  credits: 'Crédits',
  inventairePhysique: 'Comptage',
  peremptions: 'Péremptions',
  livraisons: 'Livraisons',
  location: 'Location',
  carte: 'Carte',
  cadeaux: 'Cadeaux',
  rdv: 'Rendez-vous',
  tarifs: 'Tarifs',
  retoursFournisseur: 'Retours FRS',
  production: 'Production',
  bl: 'Bons livraison',
  depenses: 'Dépenses',
  retoursClient: 'Retours client',
  consignes: 'Consignes',
  ordonnances: 'Ordonnances',
  chantiers: 'Chantiers',
  abonnements: 'Abonnements',
  haccp: 'Hygiène',
  vip: 'VIP',
  commissions: 'Commissions',
  misesDeCote: 'Mises de côté',
  pertes: 'Pertes',
  allergenes: 'Allergènes',
  evenements: 'Événements',
  reprises: 'Reprises',
  protocoles: 'Protocoles',
  cave: 'Cave',
  magistrales: 'Magistrales',
}

export const VIEW_SUBTITLES: Record<NavViewId, string> = {
  dash: 'Ouvrez un module pour continuer',
  caisse: 'Encaissement, panier et TVA',
  catalogue: 'Produits, prix et codes-barres',
  stocks: 'Stock temps réel, alertes, variantes, inventaire et stock dormant',
  comptabilite: 'Journaux HT/TVA et exports',
  rh: 'Demandes et validations manager',
  crm: 'Fiches clients et relances',
  segmentation: 'VIP, inactives, produits, boutique et fréquence',
  whatsapp: 'Campagnes ciblées, relances et réactivation clientes',
  marketing: 'Promotions, fidélité, campagnes par segment et CA généré',
  tables: 'Occupation et réservations',
  promotions: 'Codes promo et seuils panier',
  loyalty: 'Points et historique clients',
  kitchen: 'Tickets cuisine et préparation',
  ticketsFactures: 'Tickets, factures et règlements',
  onlineOrders: 'Validation des commandes web',
  journal: 'Synthèse du jour et reçus',
  personnel: 'Profils, rôles et accès',
  vendeuses: 'CA, objectifs, commissions et droits vendeuses',
  pointage: 'Arrivées et départs par magasin',
  analytique: 'CA, top produits et marges',
  rentabilite: 'Marge produit, boutique, période et vendeuse',
  reporting: 'CA, marge, stock, rotation, panier et perf. boutique / produit / vendeuse',
  controleInterne: 'Remises, annulations, retours, prix, stock et actions vendeuses',
  evolutivite: '1→N boutiques sans changer de système · connectivité IA',
  integrations: 'Partenaires et marketplaces',
  parametres: 'Magasin, terminal et périphériques',
  network: 'Réseau multi-boutiques, entrepôt et transferts',
  achats: 'Fournisseurs, commandes, réceptions et coûts d’achat',
  devis: 'Devis clients et conversion en vente',
  sav: 'Atelier réparations et garanties',
  credits: 'Encours clients, échéances et règlements',
  inventairePhysique: 'Sessions de comptage et écarts de stock',
  peremptions: 'Alertes DLC et destructions de lots',
  livraisons: 'Livreurs, tournées et suivi des courses',
  location: 'Location matériel, cautions et retours',
  carte: 'Menu du jour et options de plats',
  cadeaux: 'Cartes et bons cadeaux',
  rdv: 'Agenda rendez-vous clients',
  tarifs: 'Grilles tarifaires pro / multi-prix',
  retoursFournisseur: 'Retours et avoirs fournisseurs',
  production: 'Ordres de fabrication / fournée',
  bl: 'Bons de livraison clients',
  depenses: 'Dépenses magasin et trésorerie',
  retoursClient: 'Retours, échanges et avoirs clients',
  consignes: 'Cautions bouteilles / emballages consignés',
  ordonnances: 'Registre des ordonnances et délivrances',
  chantiers: 'Chantiers BTP, clients et suivi',
  abonnements: 'Forfaits récurrents et échéances',
  haccp: 'Températures, nettoyage et réceptions',
  vip: 'Conciergerie, paliers et préférences clients',
  commissions: 'Commissions vendeurs et règlements',
  misesDeCote: 'Réservations articles et acomptes',
  pertes: 'Casse, vols, erreurs et shrink',
  allergenes: 'Fiches allergènes et traces',
  evenements: 'Privatisations, traiteur et couverts',
  reprises: 'Trade-in high-tech, IMEI et offres',
  protocoles: 'Cures et séances de soins',
  cave: 'Millésimes, stocks bouteilles et verre',
  magistrales: 'Préparations magistrales sur ordonnance',
}

export type NavSection = {
  title: string
  items: {
    id: NavViewId
    label: string
    badge?: 'lowStock'
    /** Badges rupture + seuil (menu Stocks) */
    stockBadges?: boolean
  }[]
}

function navItem(
  id: NavViewId,
  extras?: { badge?: 'lowStock'; stockBadges?: boolean },
): NavSection['items'][number] {
  return { id, label: VIEW_LABELS[id], ...extras }
}

export type ViewAccent = {
  icon: string
  iconActive: string
  labelActive: string
  chip: string
}

/** Couleurs rail admin (hex) — indépendantes de Tailwind pour éviter le conflit avec `.rail-btn`. */
export type ViewRailColor = {
  fg: string
  bg: string
  fgOn: string
  bgOn: string
}

function railColor(
  fg: string,
  bg: string,
  fgOn: string,
  bgOn: string,
): ViewRailColor {
  return { fg, bg, fgOn, bgOn }
}

const RC = {
  brand: railColor('#0033aa', '#e8eefa', '#00257a', '#d6e0f6'),
  indigo: railColor('#4f46e5', '#eef2ff', '#4338ca', '#e0e7ff'),
  amber: railColor('#d97706', '#fffbeb', '#b45309', '#fef3c7'),
  violet: railColor('#7c3aed', '#f5f3ff', '#6d28d9', '#ede9fe'),
  fuchsia: railColor('#c026d3', '#fdf4ff', '#a21caf', '#fae8ff'),
  cyan: railColor('#0891b2', '#ecfeff', '#0e7490', '#cffafe'),
  teal: railColor('#0d9488', '#f0fdfa', '#0f766e', '#ccfbf1'),
  emerald: railColor('#059669', '#ecfdf5', '#047857', '#d1fae5'),
  orange: railColor('#ea580c', '#fff7ed', '#c2410c', '#ffedd5'),
  rose: railColor('#e11d48', '#fff1f2', '#be123c', '#ffe4e6'),
  yellow: railColor('#ca8a04', '#fefce8', '#a16207', '#fef9c3'),
  red: railColor('#dc2626', '#fef2f2', '#b91c1c', '#fee2e2'),
  blue: railColor('#2563eb', '#eff6ff', '#1d4ed8', '#dbeafe'),
  pink: railColor('#db2777', '#fdf2f8', '#be185d', '#fce7f3'),
  lime: railColor('#65a30d', '#f7fee7', '#4d7c0f', '#ecfccb'),
  purple: railColor('#9333ea', '#faf5ff', '#7e22ce', '#f3e8ff'),
  slate: railColor('#475569', '#f8fafc', '#1e293b', '#e2e8f0'),
  green: railColor('#16a34a', '#f0fdf4', '#15803d', '#dcfce7'),
  sky: railColor('#0284c7', '#f0f9ff', '#0369a1', '#e0f2fe'),
  stone: railColor('#57534e', '#fafaf9', '#44403c', '#f5f5f4'),
  yellowDeep: railColor('#a16207', '#fefce8', '#854d0e', '#fef9c3'),
  amberDeep: railColor('#b45309', '#fffbeb', '#92400e', '#fef3c7'),
  limeDeep: railColor('#4d7c0f', '#f7fee7', '#3f6212', '#ecfccb'),
  redDeep: railColor('#991b1b', '#fef2f2', '#7f1d1d', '#fee2e2'),
  cyanDeep: railColor('#0e7490', '#ecfeff', '#155e75', '#cffafe'),
} as const

export const VIEW_RAIL_COLORS: Record<NavViewId, ViewRailColor> = {
  dash: RC.brand,
  caisse: RC.brand,
  catalogue: RC.indigo,
  stocks: RC.amber,
  comptabilite: RC.violet,
  rh: RC.fuchsia,
  crm: RC.cyan,
  segmentation: RC.teal,
  whatsapp: RC.emerald,
  marketing: RC.fuchsia,
  tables: RC.orange,
  promotions: RC.rose,
  loyalty: RC.yellow,
  kitchen: RC.red,
  ticketsFactures: RC.teal,
  onlineOrders: RC.blue,
  journal: RC.teal,
  personnel: RC.pink,
  vendeuses: RC.rose,
  pointage: RC.lime,
  analytique: RC.purple,
  rentabilite: RC.fuchsia,
  reporting: RC.indigo,
  controleInterne: RC.slate,
  evolutivite: RC.violet,
  integrations: RC.cyan,
  parametres: RC.slate,
  network: RC.green,
  achats: RC.orange,
  devis: RC.sky,
  sav: RC.emerald,
  credits: RC.amber,
  inventairePhysique: RC.slate,
  peremptions: RC.rose,
  livraisons: RC.cyan,
  location: RC.teal,
  carte: RC.fuchsia,
  cadeaux: RC.pink,
  rdv: RC.violet,
  tarifs: RC.blue,
  retoursFournisseur: RC.red,
  production: RC.yellowDeep,
  bl: RC.indigo,
  depenses: RC.stone,
  retoursClient: RC.orange,
  consignes: RC.emerald,
  ordonnances: RC.sky,
  chantiers: RC.amberDeep,
  abonnements: RC.violet,
  haccp: RC.limeDeep,
  vip: RC.yellowDeep,
  commissions: RC.emerald,
  misesDeCote: RC.indigo,
  pertes: RC.rose,
  allergenes: RC.orange,
  evenements: RC.fuchsia,
  reprises: RC.sky,
  protocoles: RC.pink,
  cave: RC.redDeep,
  magistrales: RC.cyanDeep,
}

export const VIEW_ACCENTS: Record<NavViewId, ViewAccent> = {
  dash: {
    icon: 'text-[#0033aa] bg-[#e8eefa]',
    iconActive: 'text-[#00257a] bg-[#d6e0f6]',
    labelActive: 'text-[#001f66]',
    chip: 'bg-[#e8eefa] text-[#0033aa]',
  },
  caisse: {
    icon: 'text-[#0033aa] bg-[#e8eefa]',
    iconActive: 'text-[#00257a] bg-[#d6e0f6]',
    labelActive: 'text-[#001f66]',
    chip: 'bg-[#e8eefa] text-[#0033aa]',
  },
  catalogue: {
    icon: 'text-indigo-600 bg-indigo-50',
    iconActive: 'text-indigo-700 bg-indigo-100',
    labelActive: 'text-indigo-900',
    chip: 'bg-indigo-100 text-indigo-800',
  },
  stocks: {
    icon: 'text-amber-600 bg-amber-50',
    iconActive: 'text-amber-700 bg-amber-100',
    labelActive: 'text-amber-900',
    chip: 'bg-amber-100 text-amber-800',
  },
  comptabilite: {
    icon: 'text-violet-600 bg-violet-50',
    iconActive: 'text-violet-700 bg-violet-100',
    labelActive: 'text-violet-900',
    chip: 'bg-violet-100 text-violet-800',
  },
  rh: {
    icon: 'text-fuchsia-600 bg-fuchsia-50',
    iconActive: 'text-fuchsia-700 bg-fuchsia-100',
    labelActive: 'text-fuchsia-900',
    chip: 'bg-fuchsia-100 text-fuchsia-800',
  },
  crm: {
    icon: 'text-cyan-600 bg-cyan-50',
    iconActive: 'text-cyan-700 bg-cyan-100',
    labelActive: 'text-cyan-900',
    chip: 'bg-cyan-100 text-cyan-800',
  },
  segmentation: {
    icon: 'text-teal-600 bg-teal-50',
    iconActive: 'text-teal-700 bg-teal-100',
    labelActive: 'text-teal-900',
    chip: 'bg-teal-100 text-teal-800',
  },
  whatsapp: {
    icon: 'text-emerald-600 bg-emerald-50',
    iconActive: 'text-emerald-700 bg-emerald-100',
    labelActive: 'text-emerald-900',
    chip: 'bg-emerald-100 text-emerald-800',
  },
  marketing: {
    icon: 'text-fuchsia-600 bg-fuchsia-50',
    iconActive: 'text-fuchsia-700 bg-fuchsia-100',
    labelActive: 'text-fuchsia-900',
    chip: 'bg-fuchsia-100 text-fuchsia-800',
  },
  tables: {
    icon: 'text-orange-600 bg-orange-50',
    iconActive: 'text-orange-700 bg-orange-100',
    labelActive: 'text-orange-900',
    chip: 'bg-orange-100 text-orange-800',
  },
  promotions: {
    icon: 'text-rose-600 bg-rose-50',
    iconActive: 'text-rose-700 bg-rose-100',
    labelActive: 'text-rose-900',
    chip: 'bg-rose-100 text-rose-800',
  },
  loyalty: {
    icon: 'text-yellow-600 bg-yellow-50',
    iconActive: 'text-yellow-700 bg-yellow-100',
    labelActive: 'text-yellow-900',
    chip: 'bg-yellow-100 text-yellow-800',
  },
  kitchen: {
    icon: 'text-red-600 bg-red-50',
    iconActive: 'text-red-700 bg-red-100',
    labelActive: 'text-red-900',
    chip: 'bg-red-100 text-red-800',
  },
  ticketsFactures: {
    icon: 'text-teal-600 bg-teal-50',
    iconActive: 'text-teal-700 bg-teal-100',
    labelActive: 'text-teal-900',
    chip: 'bg-teal-100 text-teal-800',
  },
  onlineOrders: {
    icon: 'text-blue-600 bg-blue-50',
    iconActive: 'text-blue-700 bg-blue-100',
    labelActive: 'text-blue-900',
    chip: 'bg-blue-100 text-blue-800',
  },
  journal: {
    icon: 'text-teal-600 bg-teal-50',
    iconActive: 'text-teal-700 bg-teal-100',
    labelActive: 'text-teal-900',
    chip: 'bg-teal-100 text-teal-800',
  },
  personnel: {
    icon: 'text-pink-600 bg-pink-50',
    iconActive: 'text-pink-700 bg-pink-100',
    labelActive: 'text-pink-900',
    chip: 'bg-pink-100 text-pink-800',
  },
  vendeuses: {
    icon: 'text-rose-600 bg-rose-50',
    iconActive: 'text-rose-700 bg-rose-100',
    labelActive: 'text-rose-900',
    chip: 'bg-rose-100 text-rose-800',
  },
  pointage: {
    icon: 'text-lime-600 bg-lime-50',
    iconActive: 'text-lime-700 bg-lime-100',
    labelActive: 'text-lime-900',
    chip: 'bg-lime-100 text-lime-800',
  },
  analytique: {
    icon: 'text-purple-600 bg-purple-50',
    iconActive: 'text-purple-700 bg-purple-100',
    labelActive: 'text-purple-900',
    chip: 'bg-purple-100 text-purple-800',
  },
  rentabilite: {
    icon: 'text-fuchsia-600 bg-fuchsia-50',
    iconActive: 'text-fuchsia-700 bg-fuchsia-100',
    labelActive: 'text-fuchsia-900',
    chip: 'bg-fuchsia-100 text-fuchsia-800',
  },
  reporting: {
    icon: 'text-indigo-600 bg-indigo-50',
    iconActive: 'text-indigo-700 bg-indigo-100',
    labelActive: 'text-indigo-900',
    chip: 'bg-indigo-100 text-indigo-800',
  },
  controleInterne: {
    icon: 'text-slate-600 bg-slate-50',
    iconActive: 'text-slate-800 bg-slate-200',
    labelActive: 'text-slate-900',
    chip: 'bg-slate-200 text-slate-800',
  },
  evolutivite: {
    icon: 'text-violet-600 bg-violet-50',
    iconActive: 'text-violet-700 bg-violet-100',
    labelActive: 'text-violet-900',
    chip: 'bg-violet-100 text-violet-800',
  },
  integrations: {
    icon: 'text-cyan-600 bg-cyan-50',
    iconActive: 'text-cyan-700 bg-cyan-100',
    labelActive: 'text-cyan-900',
    chip: 'bg-cyan-100 text-cyan-800',
  },
  parametres: {
    icon: 'text-slate-600 bg-slate-100',
    iconActive: 'text-slate-800 bg-slate-200',
    labelActive: 'text-slate-900',
    chip: 'bg-slate-200 text-slate-800',
  },
  network: {
    icon: 'text-green-600 bg-green-50',
    iconActive: 'text-green-700 bg-green-100',
    labelActive: 'text-green-900',
    chip: 'bg-green-100 text-green-800',
  },
  achats: {
    icon: 'text-orange-600 bg-orange-50',
    iconActive: 'text-orange-700 bg-orange-100',
    labelActive: 'text-orange-900',
    chip: 'bg-orange-100 text-orange-800',
  },
  devis: {
    icon: 'text-sky-600 bg-sky-50',
    iconActive: 'text-sky-700 bg-sky-100',
    labelActive: 'text-sky-900',
    chip: 'bg-sky-100 text-sky-800',
  },
  sav: {
    icon: 'text-emerald-600 bg-emerald-50',
    iconActive: 'text-emerald-700 bg-emerald-100',
    labelActive: 'text-emerald-900',
    chip: 'bg-emerald-100 text-emerald-800',
  },
  credits: {
    icon: 'text-amber-600 bg-amber-50',
    iconActive: 'text-amber-700 bg-amber-100',
    labelActive: 'text-amber-900',
    chip: 'bg-amber-100 text-amber-800',
  },
  inventairePhysique: {
    icon: 'text-slate-600 bg-slate-50',
    iconActive: 'text-slate-700 bg-slate-100',
    labelActive: 'text-slate-900',
    chip: 'bg-slate-100 text-slate-800',
  },
  peremptions: {
    icon: 'text-rose-600 bg-rose-50',
    iconActive: 'text-rose-700 bg-rose-100',
    labelActive: 'text-rose-900',
    chip: 'bg-rose-100 text-rose-800',
  },
  livraisons: {
    icon: 'text-cyan-600 bg-cyan-50',
    iconActive: 'text-cyan-700 bg-cyan-100',
    labelActive: 'text-cyan-900',
    chip: 'bg-cyan-100 text-cyan-800',
  },
  location: {
    icon: 'text-teal-600 bg-teal-50',
    iconActive: 'text-teal-700 bg-teal-100',
    labelActive: 'text-teal-900',
    chip: 'bg-teal-100 text-teal-800',
  },
  carte: {
    icon: 'text-fuchsia-600 bg-fuchsia-50',
    iconActive: 'text-fuchsia-700 bg-fuchsia-100',
    labelActive: 'text-fuchsia-900',
    chip: 'bg-fuchsia-100 text-fuchsia-800',
  },
  cadeaux: {
    icon: 'text-pink-600 bg-pink-50',
    iconActive: 'text-pink-700 bg-pink-100',
    labelActive: 'text-pink-900',
    chip: 'bg-pink-100 text-pink-800',
  },
  rdv: {
    icon: 'text-violet-600 bg-violet-50',
    iconActive: 'text-violet-700 bg-violet-100',
    labelActive: 'text-violet-900',
    chip: 'bg-violet-100 text-violet-800',
  },
  tarifs: {
    icon: 'text-blue-600 bg-blue-50',
    iconActive: 'text-blue-700 bg-blue-100',
    labelActive: 'text-blue-900',
    chip: 'bg-blue-100 text-blue-800',
  },
  retoursFournisseur: {
    icon: 'text-red-600 bg-red-50',
    iconActive: 'text-red-700 bg-red-100',
    labelActive: 'text-red-900',
    chip: 'bg-red-100 text-red-800',
  },
  production: {
    icon: 'text-yellow-700 bg-yellow-50',
    iconActive: 'text-yellow-800 bg-yellow-100',
    labelActive: 'text-yellow-950',
    chip: 'bg-yellow-100 text-yellow-900',
  },
  bl: {
    icon: 'text-indigo-600 bg-indigo-50',
    iconActive: 'text-indigo-700 bg-indigo-100',
    labelActive: 'text-indigo-900',
    chip: 'bg-indigo-100 text-indigo-800',
  },
  depenses: {
    icon: 'text-stone-600 bg-stone-50',
    iconActive: 'text-stone-700 bg-stone-100',
    labelActive: 'text-stone-900',
    chip: 'bg-stone-100 text-stone-800',
  },
  retoursClient: {
    icon: 'text-orange-600 bg-orange-50',
    iconActive: 'text-orange-700 bg-orange-100',
    labelActive: 'text-orange-900',
    chip: 'bg-orange-100 text-orange-800',
  },
  consignes: {
    icon: 'text-emerald-600 bg-emerald-50',
    iconActive: 'text-emerald-700 bg-emerald-100',
    labelActive: 'text-emerald-900',
    chip: 'bg-emerald-100 text-emerald-800',
  },
  ordonnances: {
    icon: 'text-sky-600 bg-sky-50',
    iconActive: 'text-sky-700 bg-sky-100',
    labelActive: 'text-sky-900',
    chip: 'bg-sky-100 text-sky-800',
  },
  chantiers: {
    icon: 'text-amber-700 bg-amber-50',
    iconActive: 'text-amber-800 bg-amber-100',
    labelActive: 'text-amber-950',
    chip: 'bg-amber-100 text-amber-900',
  },
  abonnements: {
    icon: 'text-violet-600 bg-violet-50',
    iconActive: 'text-violet-700 bg-violet-100',
    labelActive: 'text-violet-900',
    chip: 'bg-violet-100 text-violet-800',
  },
  haccp: {
    icon: 'text-lime-700 bg-lime-50',
    iconActive: 'text-lime-800 bg-lime-100',
    labelActive: 'text-lime-950',
    chip: 'bg-lime-100 text-lime-900',
  },
  vip: {
    icon: 'text-yellow-700 bg-yellow-50',
    iconActive: 'text-yellow-800 bg-yellow-100',
    labelActive: 'text-yellow-950',
    chip: 'bg-yellow-100 text-yellow-900',
  },
  commissions: {
    icon: 'text-emerald-600 bg-emerald-50',
    iconActive: 'text-emerald-700 bg-emerald-100',
    labelActive: 'text-emerald-900',
    chip: 'bg-emerald-100 text-emerald-800',
  },
  misesDeCote: {
    icon: 'text-indigo-600 bg-indigo-50',
    iconActive: 'text-indigo-700 bg-indigo-100',
    labelActive: 'text-indigo-900',
    chip: 'bg-indigo-100 text-indigo-800',
  },
  pertes: {
    icon: 'text-rose-600 bg-rose-50',
    iconActive: 'text-rose-700 bg-rose-100',
    labelActive: 'text-rose-900',
    chip: 'bg-rose-100 text-rose-800',
  },
  allergenes: {
    icon: 'text-orange-600 bg-orange-50',
    iconActive: 'text-orange-700 bg-orange-100',
    labelActive: 'text-orange-900',
    chip: 'bg-orange-100 text-orange-800',
  },
  evenements: {
    icon: 'text-fuchsia-600 bg-fuchsia-50',
    iconActive: 'text-fuchsia-700 bg-fuchsia-100',
    labelActive: 'text-fuchsia-900',
    chip: 'bg-fuchsia-100 text-fuchsia-800',
  },
  reprises: {
    icon: 'text-sky-600 bg-sky-50',
    iconActive: 'text-sky-700 bg-sky-100',
    labelActive: 'text-sky-900',
    chip: 'bg-sky-100 text-sky-800',
  },
  protocoles: {
    icon: 'text-pink-600 bg-pink-50',
    iconActive: 'text-pink-700 bg-pink-100',
    labelActive: 'text-pink-900',
    chip: 'bg-pink-100 text-pink-800',
  },
  cave: {
    icon: 'text-red-800 bg-red-50',
    iconActive: 'text-red-900 bg-red-100',
    labelActive: 'text-red-950',
    chip: 'bg-red-100 text-red-900',
  },
  magistrales: {
    icon: 'text-cyan-700 bg-cyan-50',
    iconActive: 'text-cyan-800 bg-cyan-100',
    labelActive: 'text-cyan-950',
    chip: 'bg-cyan-100 text-cyan-900',
  },
}

const NAV_SECTION_VENTES: NavSection = {
  title: 'Ventes',
  items: [navItem('caisse')],
}

const NAV_SECTION_GESTION: NavSection = {
  title: 'Gestion',
  items: [
    navItem('catalogue'),
    navItem('stocks', { stockBadges: true }),
    navItem('comptabilite'),
    navItem('rh'),
    navItem('crm'),
    navItem('segmentation'),
    navItem('whatsapp'),
    navItem('marketing'),
    navItem('tables'),
    navItem('promotions'),
    navItem('loyalty'),
    navItem('kitchen'),
    navItem('ticketsFactures'),
    navItem('onlineOrders'),
    navItem('network'),
    navItem('journal'),
  ],
}

/** Modules métier séparés (pas mélangés dans Gestion). */
const NAV_SECTION_DEVIS: NavSection = {
  title: 'Devis',
  items: [navItem('devis')],
}

const NAV_SECTION_ACHATS: NavSection = {
  title: 'Achats',
  items: [navItem('achats')],
}

const NAV_SECTION_SAV: NavSection = {
  title: 'SAV',
  items: [navItem('sav')],
}

const NAV_SECTION_CREDITS: NavSection = {
  title: 'Crédits',
  items: [navItem('credits')],
}

const NAV_SECTION_COMPTAGE: NavSection = {
  title: 'Comptage',
  items: [navItem('inventairePhysique')],
}

const NAV_SECTION_PEREMPTIONS: NavSection = {
  title: 'Péremptions',
  items: [navItem('peremptions')],
}

const NAV_SECTION_LIVRAISONS: NavSection = {
  title: 'Livraisons',
  items: [navItem('livraisons')],
}

const NAV_SECTION_LOCATION: NavSection = {
  title: 'Location',
  items: [navItem('location')],
}

const NAV_SECTION_CARTE: NavSection = {
  title: 'Carte',
  items: [navItem('carte')],
}

const NAV_SECTION_AVANCE: NavSection = {
  title: 'Avancé',
  items: [
    navItem('cadeaux'),
    navItem('rdv'),
    navItem('tarifs'),
    navItem('retoursFournisseur'),
    navItem('production'),
    navItem('bl'),
    navItem('depenses'),
  ],
}

const NAV_SECTION_RETOURS_CLIENT: NavSection = {
  title: 'Retours client',
  items: [navItem('retoursClient')],
}

const NAV_SECTION_CONSIGNES: NavSection = {
  title: 'Consignes',
  items: [navItem('consignes')],
}

const NAV_SECTION_ORDONNANCES: NavSection = {
  title: 'Ordonnances',
  items: [navItem('ordonnances')],
}

const NAV_SECTION_CHANTIERS: NavSection = {
  title: 'Chantiers',
  items: [navItem('chantiers')],
}

const NAV_SECTION_ABONNEMENTS: NavSection = {
  title: 'Abonnements',
  items: [navItem('abonnements')],
}

const NAV_SECTION_HACCP: NavSection = {
  title: 'Hygiène',
  items: [navItem('haccp')],
}

const NAV_SECTION_VIP: NavSection = {
  title: 'VIP',
  items: [navItem('vip')],
}

const NAV_SECTION_COMMISSIONS: NavSection = {
  title: 'Commissions',
  items: [navItem('commissions')],
}

const NAV_SECTION_MISES: NavSection = {
  title: 'Mises de côté',
  items: [navItem('misesDeCote')],
}

const NAV_SECTION_PERTES: NavSection = {
  title: 'Pertes',
  items: [navItem('pertes')],
}

const NAV_SECTION_ALLERGENES: NavSection = {
  title: 'Allergènes',
  items: [navItem('allergenes')],
}

const NAV_SECTION_EVENEMENTS: NavSection = {
  title: 'Événements',
  items: [navItem('evenements')],
}

const NAV_SECTION_REPRISES: NavSection = {
  title: 'Reprises',
  items: [navItem('reprises')],
}

const NAV_SECTION_PROTOCOLES: NavSection = {
  title: 'Protocoles',
  items: [navItem('protocoles')],
}

const NAV_SECTION_CAVE: NavSection = {
  title: 'Cave',
  items: [navItem('cave')],
}

const NAV_SECTION_MAGISTRALES: NavSection = {
  title: 'Magistrales',
  items: [navItem('magistrales')],
}

const NAV_SECTION_ORGANISATION: NavSection = {
  title: 'Organisation',
  items: [
    navItem('personnel'),
    navItem('vendeuses'),
    navItem('pointage'),
    navItem('analytique'),
    navItem('rentabilite'),
    navItem('reporting'),
    navItem('controleInterne'),
  ],
}

const NAV_SECTION_SYSTEME: NavSection = {
  title: 'Système',
  items: [
    navItem('evolutivite'),
    navItem('parametres'),
    navItem('integrations'),
  ],
}

export const NAV_SECTIONS: readonly NavSection[] = [
  NAV_SECTION_VENTES,
  NAV_SECTION_GESTION,
  NAV_SECTION_DEVIS,
  NAV_SECTION_ACHATS,
  NAV_SECTION_SAV,
  NAV_SECTION_CREDITS,
  NAV_SECTION_COMPTAGE,
  NAV_SECTION_PEREMPTIONS,
  NAV_SECTION_LIVRAISONS,
  NAV_SECTION_LOCATION,
  NAV_SECTION_CARTE,
  NAV_SECTION_AVANCE,
  NAV_SECTION_RETOURS_CLIENT,
  NAV_SECTION_CONSIGNES,
  NAV_SECTION_ORDONNANCES,
  NAV_SECTION_CHANTIERS,
  NAV_SECTION_ABONNEMENTS,
  NAV_SECTION_HACCP,
  NAV_SECTION_VIP,
  NAV_SECTION_COMMISSIONS,
  NAV_SECTION_MISES,
  NAV_SECTION_PERTES,
  NAV_SECTION_ALLERGENES,
  NAV_SECTION_EVENEMENTS,
  NAV_SECTION_REPRISES,
  NAV_SECTION_PROTOCOLES,
  NAV_SECTION_CAVE,
  NAV_SECTION_MAGISTRALES,
  NAV_SECTION_ORGANISATION,
  NAV_SECTION_SYSTEME,
]

/** Caissier : caisse, commandes web (reçus), cuisine, journal du jour. */
const NAV_SECTIONS_CAISSIER: readonly NavSection[] = [
  {
    title: 'Ventes',
    items: [
      navItem('caisse'),
      navItem('kitchen'),
      navItem('ticketsFactures'),
      navItem('onlineOrders'),
      navItem('journal'),
    ],
  },
  {
    title: 'Temps',
    items: [navItem('pointage')],
  },
]

/** Cuisinier : écran cuisine (KDS) + pointage. */
const NAV_SECTIONS_CUISINIER: readonly NavSection[] = [
  {
    title: 'Production',
    items: [navItem('kitchen')],
  },
  {
    title: 'Temps',
    items: [navItem('pointage')],
  },
]

/** Gérant : comme l’admin sauf personnel, création de magasins (onglet) et intégrations. */
const NAV_SECTIONS_GERANT: readonly NavSection[] = [
  NAV_SECTION_VENTES,
  NAV_SECTION_GESTION,
  NAV_SECTION_DEVIS,
  NAV_SECTION_ACHATS,
  NAV_SECTION_SAV,
  NAV_SECTION_CREDITS,
  NAV_SECTION_COMPTAGE,
  NAV_SECTION_PEREMPTIONS,
  NAV_SECTION_LIVRAISONS,
  NAV_SECTION_LOCATION,
  NAV_SECTION_CARTE,
  NAV_SECTION_AVANCE,
  NAV_SECTION_RETOURS_CLIENT,
  NAV_SECTION_CONSIGNES,
  NAV_SECTION_ORDONNANCES,
  NAV_SECTION_CHANTIERS,
  NAV_SECTION_ABONNEMENTS,
  NAV_SECTION_HACCP,
  NAV_SECTION_VIP,
  NAV_SECTION_COMMISSIONS,
  NAV_SECTION_MISES,
  NAV_SECTION_PERTES,
  NAV_SECTION_ALLERGENES,
  NAV_SECTION_EVENEMENTS,
  NAV_SECTION_REPRISES,
  NAV_SECTION_PROTOCOLES,
  NAV_SECTION_CAVE,
  NAV_SECTION_MAGISTRALES,
  {
    title: 'Organisation',
    items: [
      navItem('vendeuses'),
      navItem('pointage'),
      navItem('analytique'),
      navItem('rentabilite'),
      navItem('reporting'),
      navItem('controleInterne'),
    ],
  },
  {
    title: 'Système',
    items: [navItem('evolutivite'), navItem('parametres')],
  },
]

export function navSectionsForRole(role: UserRole): readonly NavSection[] {
  switch (role) {
    case 'caissier':
      return NAV_SECTIONS_CAISSIER
    case 'cuisinier':
      return NAV_SECTIONS_CUISINIER
    case 'gerant':
      return NAV_SECTIONS_GERANT
    case 'admin':
      return NAV_SECTIONS
    default: {
      const _exhaustive: never = role
      return _exhaustive
    }
  }
}

export function flattenedNavViewIds(
  sections: readonly NavSection[],
): Set<NavViewId> {
  return new Set(sections.flatMap((s) => s.items.map((i) => i.id)))
}

export function filterNavSections(
  sections: readonly NavSection[],
  canAccess: (view: NavViewId) => boolean,
): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccess(item.id)),
    }))
    .filter((section) => section.items.length > 0)
}
