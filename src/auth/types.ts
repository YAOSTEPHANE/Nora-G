import type { BusinessDomain } from '../lib/businessDomain'

/** Rôles système (compat API cloud + navigation). */
export type BuiltinUserRole = 'admin' | 'gerant' | 'caissier' | 'cuisinier'

/** Alias historique — toujours un rôle système pour la nav / le cloud. */
export type UserRole = BuiltinUserRole

/** Droits granulaires (fusionnés rôle + overrides profil). */
export interface StaffPermissions {
  /** Plafond remise panier (codes promo / remise %) — 0 = aucune. */
  maxDiscountPct: number
  canViewDashboard: boolean
  canViewAnalytique: boolean
  canViewJournalReport: boolean
  canManageCatalogFull: boolean
  /** Modifier prix vente & prix de revient (catalogue). */
  canEditPrices: boolean
  canManageStocks: boolean
  canDailyClosure: boolean
  canProcessRefunds: boolean
  canSwitchStore: boolean
  canManagePersonnel: boolean
  /** Voir et filtrer les pointages de toute l’équipe (sinon : uniquement le sien). */
  canViewTeamPointage: boolean
  /** Onglet création magasins / admin réseau. */
  canConfigureStoresAdmin: boolean
  canManageIntegrations: boolean
  /** Paramètres magasin, caisse et périphériques. */
  canConfigureAppSettings: boolean
}

/** Rôle métier créé par l’admin, rattaché à une activité. */
export interface CustomRole {
  id: string
  label: string
  /** Activité / domaine métier auquel ce rôle appartient. */
  domain: BusinessDomain
  /**
   * Rôle système de base : navigation + droits par défaut
   * (les permissions ci-dessous peuvent les affiner).
   */
  baseRole: BuiltinUserRole
  permissions: StaffPermissions
  createdAt: number
  updatedAt: number
}

export interface StaffProfile {
  id: string
  displayName: string
  initials: string
  role: BuiltinUserRole
  /** Rôle métier personnalisé (si défini, label + permissions issus de CustomRole). */
  customRoleId?: string
  /** Magasin assigné (optionnel). */
  storeId?: string
  /** PIN court (caisse). */
  pin: string
  /** Mot de passe optionnel (même champ de saisie à la connexion). */
  password?: string
  /** false = désactivé (ne peut plus se connecter). Défaut : actif. */
  active?: boolean
  /** Surcharge des droits du rôle (démo / cas particuliers). */
  permissionOverrides?: Partial<StaffPermissions>
}

export type StaffAuthMethod = 'pin' | 'password'

export interface StaffSession {
  profileId: string
  loggedAt: number
  /** Comment la session a été ouverte (audit léger). */
  authMethod?: StaffAuthMethod
}

export const BUILTIN_USER_ROLES: readonly BuiltinUserRole[] = [
  'admin',
  'gerant',
  'caissier',
  'cuisinier',
] as const

export function isBuiltinUserRole(value: unknown): value is BuiltinUserRole {
  return (
    value === 'admin' ||
    value === 'gerant' ||
    value === 'caissier' ||
    value === 'cuisinier'
  )
}
