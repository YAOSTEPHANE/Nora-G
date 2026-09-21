import {
  getBusinessDomainMeta,
  isBusinessDomain,
  type BusinessDomain,
} from '../lib/businessDomain'
import { ROLE_DEFAULT_PERMISSIONS } from './roleDefaults'
import type {
  BuiltinUserRole,
  CustomRole,
  StaffPermissions,
} from './types'
import { isBuiltinUserRole } from './types'

const STORAGE_KEY = 'nora-custom-roles-v1'
const ORG_CREDENTIALS_KEY = 'nora-org-credentials-v1'
const LEGACY_PROFILE_OWNER_KEY = 'nora-legacy-profile-owner-v1'
export const CUSTOM_ROLES_CHANGED_EVENT = 'nora-custom-roles-changed'

const PERMISSION_KEYS: readonly (keyof StaffPermissions)[] = [
  'maxDiscountPct',
  'canViewDashboard',
  'canViewAnalytique',
  'canViewJournalReport',
  'canManageCatalogFull',
  'canEditPrices',
  'canManageStocks',
  'canDailyClosure',
  'canProcessRefunds',
  'canSwitchStore',
  'canManagePersonnel',
  'canViewTeamPointage',
  'canConfigureStoresAdmin',
  'canManageIntegrations',
  'canConfigureAppSettings',
] as const

export const PERMISSION_FIELD_LABELS: Record<keyof StaffPermissions, string> = {
  maxDiscountPct: 'Plafond de remise (%)',
  canViewDashboard: 'Tableau de bord',
  canViewAnalytique: 'Analytique',
  canViewJournalReport: 'Journal & rapports',
  canManageCatalogFull: 'Catalogue — création / archivage',
  canEditPrices: 'Modifier les prix',
  canManageStocks: 'Stocks & inventaire',
  canDailyClosure: 'Clôture journalière',
  canProcessRefunds: 'Remboursements',
  canSwitchStore: 'Changer de magasin',
  canManagePersonnel: 'Gérer l’équipe',
  canViewTeamPointage: 'Pointages de l’équipe',
  canConfigureStoresAdmin: 'Créer des magasins / réseau',
  canManageIntegrations: 'Intégrations & API',
  canConfigureAppSettings: 'Paramètres de l’application',
}

function currentOrganizationId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(ORG_CREDENTIALS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'organizationId' in parsed &&
      typeof parsed.organizationId === 'string'
    ) {
      return parsed.organizationId
    }
  } catch {
    return null
  }
  return null
}

function organizationStorageKey(baseKey: string): string {
  const organizationId = currentOrganizationId()
  if (!organizationId) return `${baseKey}:unassigned`

  const legacyOwner = localStorage.getItem(LEGACY_PROFILE_OWNER_KEY)
  if (!legacyOwner) {
    localStorage.setItem(LEGACY_PROFILE_OWNER_KEY, organizationId)
    return baseKey
  }
  return legacyOwner === organizationId ? baseKey : `${baseKey}:${organizationId}`
}

function normalizePermissions(
  base: StaffPermissions,
  raw: Partial<StaffPermissions> | undefined,
): StaffPermissions {
  const next: StaffPermissions = { ...base }
  if (!raw) return next
  for (const key of PERMISSION_KEYS) {
    const value = raw[key]
    if (key === 'maxDiscountPct') {
      if (typeof value === 'number' && Number.isFinite(value)) {
        next.maxDiscountPct = Math.max(0, Math.min(100, value))
      }
      continue
    }
    if (typeof value === 'boolean') {
      next[key] = value
    }
  }
  return next
}

function isCustomRole(value: unknown): value is CustomRole {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<CustomRole>
  return (
    typeof v.id === 'string' &&
    typeof v.label === 'string' &&
    isBusinessDomain(v.domain) &&
    isBuiltinUserRole(v.baseRole) &&
    typeof v.permissions === 'object' &&
    v.permissions !== null &&
    typeof v.createdAt === 'number' &&
    typeof v.updatedAt === 'number'
  )
}

function readAll(): CustomRole[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(organizationStorageKey(STORAGE_KEY))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isCustomRole).map((role) => ({
      ...role,
      permissions: normalizePermissions(
        ROLE_DEFAULT_PERMISSIONS[role.baseRole],
        role.permissions,
      ),
    }))
  } catch {
    return []
  }
}

function writeAll(roles: CustomRole[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(organizationStorageKey(STORAGE_KEY), JSON.stringify(roles))
  window.dispatchEvent(new Event(CUSTOM_ROLES_CHANGED_EVENT))
}

export function listCustomRoles(): CustomRole[] {
  return readAll().sort((a, b) => a.label.localeCompare(b.label, 'fr'))
}

export function listCustomRolesForDomain(domain: BusinessDomain): CustomRole[] {
  return listCustomRoles().filter((role) => role.domain === domain)
}

export function getCustomRole(id: string | undefined | null): CustomRole | undefined {
  if (!id) return undefined
  return readAll().find((role) => role.id === id)
}

export function subscribeCustomRoles(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const handler = () => onChange()
  window.addEventListener(CUSTOM_ROLES_CHANGED_EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(CUSTOM_ROLES_CHANGED_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}

export function createCustomRole(input: {
  label: string
  domain: BusinessDomain
  baseRole: BuiltinUserRole
  permissions?: Partial<StaffPermissions>
}): CustomRole {
  const label = input.label.trim()
  if (label.length < 2) {
    throw new Error('Le nom du rôle doit contenir au moins 2 caractères.')
  }
  if (!isBusinessDomain(input.domain)) {
    throw new Error('Activité métier invalide.')
  }
  if (!isBuiltinUserRole(input.baseRole)) {
    throw new Error('Rôle de base invalide.')
  }
  if (input.baseRole === 'admin') {
    throw new Error(
      'Le rôle Administrateur est réservé. Choisissez un autre rôle de base.',
    )
  }

  const existing = readAll()
  const domainLabel = getBusinessDomainMeta(input.domain).label
  if (
    existing.some(
      (role) =>
        role.domain === input.domain &&
        role.label.toLowerCase() === label.toLowerCase(),
    )
  ) {
    throw new Error(
      `Un rôle « ${label} » existe déjà pour l’activité ${domainLabel}.`,
    )
  }

  const now = Date.now()
  const created: CustomRole = {
    id: `role-${crypto.randomUUID()}`,
    label,
    domain: input.domain,
    baseRole: input.baseRole,
    permissions: normalizePermissions(
      ROLE_DEFAULT_PERMISSIONS[input.baseRole],
      input.permissions,
    ),
    createdAt: now,
    updatedAt: now,
  }
  existing.push(created)
  writeAll(existing)
  return created
}

export function updateCustomRole(
  roleId: string,
  patch: {
    label?: string
    baseRole?: BuiltinUserRole
    permissions?: Partial<StaffPermissions>
  },
): CustomRole {
  const roles = readAll()
  const idx = roles.findIndex((role) => role.id === roleId)
  if (idx < 0) throw new Error('Rôle introuvable.')

  const current = roles[idx]!
  const next: CustomRole = { ...current, permissions: { ...current.permissions } }

  if (patch.label !== undefined) {
    const label = patch.label.trim()
    if (label.length < 2) {
      throw new Error('Le nom du rôle doit contenir au moins 2 caractères.')
    }
    if (
      roles.some(
        (role) =>
          role.id !== roleId &&
          role.domain === current.domain &&
          role.label.toLowerCase() === label.toLowerCase(),
      )
    ) {
      throw new Error(`Un rôle « ${label} » existe déjà pour cette activité.`)
    }
    next.label = label
  }

  if (patch.baseRole !== undefined) {
    if (!isBuiltinUserRole(patch.baseRole)) {
      throw new Error('Rôle de base invalide.')
    }
    if (patch.baseRole === 'admin') {
      throw new Error(
        'Le rôle Administrateur est réservé. Choisissez un autre rôle de base.',
      )
    }
    next.baseRole = patch.baseRole
    if (patch.permissions === undefined) {
      next.permissions = {
        ...ROLE_DEFAULT_PERMISSIONS[patch.baseRole],
        ...Object.fromEntries(
          PERMISSION_KEYS.filter((k) => k !== 'maxDiscountPct').map((k) => [
            k,
            current.permissions[k],
          ]),
        ),
        maxDiscountPct: current.permissions.maxDiscountPct,
      } as StaffPermissions
    }
  }

  if (patch.permissions !== undefined) {
    next.permissions = normalizePermissions(
      ROLE_DEFAULT_PERMISSIONS[next.baseRole],
      { ...next.permissions, ...patch.permissions },
    )
  }

  next.updatedAt = Date.now()
  roles[idx] = next
  writeAll(roles)
  return next
}

export function deleteCustomRole(roleId: string): void {
  const roles = readAll()
  const next = roles.filter((role) => role.id !== roleId)
  if (next.length === roles.length) {
    throw new Error('Rôle introuvable.')
  }
  writeAll(next)
}

export function builtinRoleLabel(role: BuiltinUserRole): string {
  switch (role) {
    case 'admin':
      return 'Administrateur'
    case 'gerant':
      return 'Gérant'
    case 'caissier':
      return 'Caissier'
    case 'cuisinier':
      return 'Cuisinier'
    default: {
      const _exhaustive: never = role
      return _exhaustive
    }
  }
}
