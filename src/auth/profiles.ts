import type { StaffProfile, StaffPermissions } from './types'
import { isBuiltinUserRole } from './types'
import { builtinRoleLabel, getCustomRole } from './customRoles'
import { isCloudApiConfigured } from '../lib/apiUrl'
import { clientEnv } from '../lib/clientEnv'

/** Profil admin créé automatiquement à l’inscription (prod) — PIN initial. */
export const OWNER_PROFILE_ID = 'profile-owner'
export const DEFAULT_OWNER_PIN = '1234'

/**
 * Profils démo — disponibles uniquement en développement local.
 */
const BUILTIN_STAFF_PROFILES: readonly StaffProfile[] = clientEnv.isDev()
  ? ([
      {
        id: 'profile-caissier',
        displayName: 'Awa Konaté',
        initials: 'AK',
        role: 'caissier',
        pin: '1234',
        password: 'caisse',
      },
      {
        id: 'profile-gerant',
        displayName: 'Koffi N’Guessan',
        initials: 'KN',
        role: 'gerant',
        pin: '4321',
        password: 'gerant2024',
      },
      {
        id: 'profile-admin',
        displayName: 'Kouadio Yao',
        initials: 'KY',
        role: 'admin',
        pin: '5678',
        password: 'admin',
      },
      {
        id: 'profile-cuisinier',
        displayName: 'Bamba Ouattara',
        initials: 'BO',
        role: 'cuisinier',
        pin: '2468',
        password: 'cuisine',
      },
    ] as const)
  : []

const CLOUD_STAFF_KEY = 'nora-cloud-staff-v1'
const STORAGE_KEY = 'nora-custom-staff-profiles-v1'
const PASSWORD_OVERRIDES_KEY = 'nora-staff-password-overrides-v1'
const ORG_CREDENTIALS_KEY = 'nora-org-credentials-v1'
const LEGACY_PROFILE_OWNER_KEY = 'nora-legacy-profile-owner-v1'
const CHANGE_EVENT = 'nora-staff-profiles-changed'

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

function isStaffProfile(value: unknown): value is StaffProfile {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<StaffProfile>
  return (
    typeof v.id === 'string' &&
    typeof v.displayName === 'string' &&
    typeof v.initials === 'string' &&
    (v.storeId === undefined || typeof v.storeId === 'string') &&
    isBuiltinUserRole(v.role) &&
    (v.customRoleId === undefined || typeof v.customRoleId === 'string') &&
    typeof v.pin === 'string' &&
    (v.password === undefined || typeof v.password === 'string') &&
    (v.active === undefined || typeof v.active === 'boolean')
  )
}

function isBuiltinProfileId(id: string): boolean {
  return BUILTIN_STAFF_PROFILES.some((p) => p.id === id)
}

function readCustomProfiles(): StaffProfile[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(organizationStorageKey(STORAGE_KEY))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isStaffProfile)
  } catch {
    return []
  }
}

function readPasswordOverrides(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(organizationStorageKey(PASSWORD_OVERRIDES_KEY))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === 'string' && typeof v === 'string' && v.trim() !== '') {
        out[k] = v
      }
    }
    return out
  } catch {
    return {}
  }
}

function writeCustomProfiles(profiles: StaffProfile[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(organizationStorageKey(STORAGE_KEY), JSON.stringify(profiles))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function writePasswordOverrides(overrides: Record<string, string>): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(
    organizationStorageKey(PASSWORD_OVERRIDES_KEY),
    JSON.stringify(overrides),
  )
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function listStaffProfiles(): StaffProfile[] {
  const overrides = readPasswordOverrides()
  const cloud = readCloudStaffProfiles()
  return [...BUILTIN_STAFF_PROFILES, ...cloud, ...readCustomProfiles()].map((p) => ({
    ...p,
    active: p.active !== false,
    password: overrides[p.id] ?? p.password,
  }))
}

function readCloudStaffProfiles(): StaffProfile[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(organizationStorageKey(CLOUD_STAFF_KEY))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isStaffProfile)
  } catch {
    return []
  }
}

function writeCloudStaffProfiles(profiles: StaffProfile[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(organizationStorageKey(CLOUD_STAFF_KEY), JSON.stringify(profiles))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function mergeStaffFromCloud(
  remote: Array<{
    id: string
    displayName: string
    initials: string
    role: StaffProfile['role']
    storeId?: string | null
    active: boolean
    permissionOverrides?: Partial<StaffPermissions> | null
    customRoleId?: string | null
  }>,
): number {
  const localById = new Map<string, StaffProfile>()
  for (const p of [...readCloudStaffProfiles(), ...readCustomProfiles()]) {
    localById.set(p.id, p)
  }

  const remoteIds = new Set(remote.map((r) => r.id))
  const merged: StaffProfile[] = remote.map((row) => {
    const local = localById.get(row.id)
    const overrides =
      row.permissionOverrides !== undefined && row.permissionOverrides !== null
        ? row.permissionOverrides
        : local?.permissionOverrides
    const customRoleId =
      row.customRoleId !== undefined && row.customRoleId !== null
        ? row.customRoleId
        : local?.customRoleId
    return {
      id: row.id,
      displayName: row.displayName,
      initials: row.initials,
      role: row.role,
      active: row.active,
      ...(row.storeId ? { storeId: row.storeId } : {}),
      pin:
        local?.pin ??
        (row.id === OWNER_PROFILE_ID ? DEFAULT_OWNER_PIN : '0000'),
      ...(local?.password ? { password: local.password } : {}),
      ...(overrides && Object.keys(overrides).length > 0
        ? { permissionOverrides: { ...overrides } }
        : {}),
      ...(customRoleId ? { customRoleId } : {}),
    }
  })
  writeCloudStaffProfiles(merged)
  // Évite les doublons cloud + custom pour le même profileId.
  const customLeft = readCustomProfiles().filter((p) => !remoteIds.has(p.id))
  writeCustomProfiles(customLeft)
  return merged.length
}

/**
 * Crée le premier admin local si aucun profil actif (évite l’impasse en production
 * où les profils démo sont désactivés et Personnel n’est accessible qu’après login).
 */
export function ensureOwnerAdminProfile(orgName: string): StaffProfile | null {
  if (typeof window === 'undefined') return null
  if (listActiveStaffProfiles().length > 0) return null

  const rawName = orgName.trim()
  const displayName =
    rawName.length >= 3 ? rawName.slice(0, 80) : 'Administrateur'
  const created: StaffProfile = {
    id: OWNER_PROFILE_ID,
    displayName,
    initials: computeInitials(displayName),
    role: 'admin',
    active: true,
    pin: DEFAULT_OWNER_PIN,
  }

  const custom = readCustomProfiles().filter((p) => p.id !== OWNER_PROFILE_ID)
  custom.push(created)
  writeCustomProfiles(custom)
  void pushStaffToServer('create', {
    profileId: created.id,
    displayName: created.displayName,
    role: created.role,
    pin: created.pin,
  })
  return created
}

async function pushStaffToServer(
  action: 'create' | 'update' | 'delete',
  payload: Record<string, unknown>,
): Promise<void> {
  if (!isCloudApiConfigured()) return
  try {
    const { createRemoteStaff, updateRemoteStaff, deleteRemoteStaff } = await import(
      '../lib/staff/api'
    )
    if (action === 'create') {
      await createRemoteStaff(payload as Parameters<typeof createRemoteStaff>[0])
    } else if (action === 'update') {
      await updateRemoteStaff(String(payload.profileId), payload.patch as never)
    } else {
      await deleteRemoteStaff(String(payload.profileId))
    }
  } catch {
    /* offline ou API indisponible */
  }
}

/** Profils autorisés à se connecter (actifs uniquement). */
export function listActiveStaffProfiles(): StaffProfile[] {
  return listStaffProfiles().filter((p) => p.active !== false)
}

export function countActiveStaffProfiles(): number {
  return listActiveStaffProfiles().length
}

export function isCustomStaffProfile(id: string): boolean {
  return !isBuiltinProfileId(id)
}

export function subscribeStaffProfiles(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const handler = () => onChange()
  window.addEventListener(CHANGE_EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}

function computeInitials(displayName: string): string {
  const chunks = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (chunks.length === 0) return 'NN'
  if (chunks.length === 1) return chunks[0].slice(0, 2).toUpperCase()
  return `${chunks[0][0] ?? ''}${chunks[1][0] ?? ''}`.toUpperCase()
}

export function createStaffProfile(input: {
  displayName: string
  role: StaffProfile['role']
  customRoleId?: string | null
  storeId?: string
  pin: string
  password?: string
  /** Plafond utilisateurs du plan (actifs). Si omis, pas de contrôle. */
  maxStaff?: number
}): StaffProfile {
  const displayName = input.displayName.trim()
  const storeId = input.storeId?.trim() || undefined
  const pin = input.pin.trim()
  const password = input.password?.trim() || undefined
  if (displayName.length < 3) {
    throw new Error('Le nom complet doit contenir au moins 3 caractères.')
  }
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error('Le PIN doit contenir entre 4 et 8 chiffres.')
  }
  if (
    typeof input.maxStaff === 'number' &&
    input.maxStaff > 0 &&
    countActiveStaffProfiles() >= input.maxStaff
  ) {
    throw new Error(
      `Limite d’utilisateurs atteinte (${input.maxStaff}). Passez à un plan supérieur ou désactivez un compte.`,
    )
  }
  const all = listStaffProfiles()
  if (all.some((p) => p.pin === pin)) {
    throw new Error('Ce PIN est déjà utilisé par un autre profil.')
  }

  let role = input.role
  let customRoleId = input.customRoleId?.trim() || undefined
  if (customRoleId) {
    const custom = getCustomRole(customRoleId)
    if (!custom) throw new Error('Rôle métier introuvable.')
    role = custom.baseRole
  } else {
    customRoleId = undefined
  }

  const created: StaffProfile = {
    id: `profile-custom-${crypto.randomUUID()}`,
    displayName,
    initials: computeInitials(displayName),
    role,
    active: true,
    ...(customRoleId ? { customRoleId } : {}),
    ...(storeId ? { storeId } : {}),
    pin,
    ...(password ? { password } : {}),
  }
  const custom = readCustomProfiles()
  custom.push(created)
  writeCustomProfiles(custom)
  void pushStaffToServer('create', {
    profileId: created.id,
    displayName: created.displayName,
    role: created.role,
    storeId: created.storeId,
    pin: created.pin,
    password: created.password,
    customRoleId: created.customRoleId ?? null,
  })
  return created
}

export function updateStaffProfile(
  profileId: string,
  patch: {
    displayName?: string
    role?: StaffProfile['role']
    customRoleId?: string | null
    storeId?: string | null
    pin?: string
    password?: string | null
    active?: boolean
    permissionOverrides?: Partial<StaffPermissions> | null
  },
): StaffProfile {
  if (isBuiltinProfileId(profileId)) {
    throw new Error(
      'Les profils de démonstration ne peuvent pas être modifiés. Créez un nouvel utilisateur.',
    )
  }
  const custom = readCustomProfiles()
  const idx = custom.findIndex((p) => p.id === profileId)
  if (idx < 0) throw new Error('Profil introuvable.')

  const current = custom[idx]!
  const next: StaffProfile = { ...current }

  if (patch.displayName !== undefined) {
    const displayName = patch.displayName.trim()
    if (displayName.length < 3) {
      throw new Error('Le nom complet doit contenir au moins 3 caractères.')
    }
    next.displayName = displayName
    next.initials = computeInitials(displayName)
  }
  if (patch.customRoleId !== undefined) {
    const customRoleId = patch.customRoleId?.trim() || undefined
    if (customRoleId) {
      const roleDef = getCustomRole(customRoleId)
      if (!roleDef) throw new Error('Rôle métier introuvable.')
      next.customRoleId = customRoleId
      next.role = roleDef.baseRole
    } else {
      delete next.customRoleId
      if (patch.role !== undefined) next.role = patch.role
    }
  } else if (patch.role !== undefined) {
    next.role = patch.role
    delete next.customRoleId
  }
  if (patch.storeId !== undefined) {
    const storeId = patch.storeId?.trim() || undefined
    if (storeId) next.storeId = storeId
    else delete next.storeId
  }
  if (patch.pin !== undefined) {
    const pin = patch.pin.trim()
    if (!/^\d{4,8}$/.test(pin)) {
      throw new Error('Le PIN doit contenir entre 4 et 8 chiffres.')
    }
    const conflict = listStaffProfiles().some(
      (p) => p.id !== profileId && p.pin === pin,
    )
    if (conflict) throw new Error('Ce PIN est déjà utilisé par un autre profil.')
    next.pin = pin
  }
  if (patch.password !== undefined) {
    const password = patch.password?.trim() || undefined
    if (password) next.password = password
    else delete next.password
  }
  if (patch.active !== undefined) next.active = patch.active
  if (patch.permissionOverrides !== undefined) {
    if (
      patch.permissionOverrides == null ||
      Object.keys(patch.permissionOverrides).length === 0
    ) {
      delete next.permissionOverrides
    } else {
      next.permissionOverrides = { ...patch.permissionOverrides }
    }
  }

  custom[idx] = next
  writeCustomProfiles(custom)
  void pushStaffToServer('update', {
    profileId,
    patch: {
      displayName: next.displayName,
      role: next.role,
      storeId: next.storeId ?? null,
      pin: patch.pin,
      password: patch.password ?? undefined,
      active: next.active,
      permissionOverrides: next.permissionOverrides ?? null,
      customRoleId: next.customRoleId ?? null,
    },
  })
  return profileById(profileId) ?? next
}

/** Soft-delete : désactive un profil personnalisé (conservé pour l’historique). */
export function deactivateStaffProfile(profileId: string): void {
  updateStaffProfile(profileId, { active: false })
}

export function reactivateStaffProfile(profileId: string, maxStaff?: number): void {
  if (
    typeof maxStaff === 'number' &&
    maxStaff > 0 &&
    countActiveStaffProfiles() >= maxStaff
  ) {
    throw new Error(
      `Limite d’utilisateurs atteinte (${maxStaff}). Désactivez un autre compte ou changez de plan.`,
    )
  }
  updateStaffProfile(profileId, { active: true })
}

/** Suppression définitive (profils personnalisés uniquement). */
export function deleteStaffProfile(profileId: string): void {
  if (isBuiltinProfileId(profileId)) {
    throw new Error('Les profils de démonstration ne peuvent pas être supprimés.')
  }
  const custom = readCustomProfiles().filter((p) => p.id !== profileId)
  writeCustomProfiles(custom)
  const overrides = readPasswordOverrides()
  if (overrides[profileId]) {
    delete overrides[profileId]
    writePasswordOverrides(overrides)
  }
  void pushStaffToServer('delete', { profileId })
}

export function changeStaffPassword(input: {
  profileId: string
  currentSecret: string
  nextPassword: string
}): void {
  const profile = profileById(input.profileId)
  if (!profile) {
    throw new Error('Profil introuvable.')
  }
  const current = input.currentSecret.trim()
  const next = input.nextPassword.trim()
  if (current.length === 0) {
    throw new Error('Saisissez votre mot de passe (ou PIN) actuel.')
  }
  const currentOk = current === profile.pin || current === (profile.password ?? '')
  if (!currentOk) {
    throw new Error('Mot de passe actuel incorrect.')
  }
  if (next.length < 4) {
    throw new Error('Le nouveau mot de passe doit contenir au moins 4 caractères.')
  }
  if (next === profile.pin) {
    throw new Error('Le mot de passe ne doit pas être identique au PIN.')
  }
  const overrides = readPasswordOverrides()
  overrides[profile.id] = next
  writePasswordOverrides(overrides)
}

export function profileById(id: string): StaffProfile | undefined {
  return listStaffProfiles().find((p) => p.id === id)
}

export function roleLabel(
  role: StaffProfile['role'],
  customRoleId?: string | null,
): string {
  const custom = getCustomRole(customRoleId)
  if (custom) return custom.label
  return builtinRoleLabel(role)
}

export function staffRoleLabel(profile: Pick<StaffProfile, 'role' | 'customRoleId'>): string {
  return roleLabel(profile.role, profile.customRoleId)
}

/** Retire l’affectation d’un rôle métier sur tous les profils locaux. */
export function clearCustomRoleAssignments(customRoleId: string): number {
  const custom = readCustomProfiles()
  let changed = 0
  for (const profile of custom) {
    if (profile.customRoleId !== customRoleId) continue
    delete profile.customRoleId
    changed += 1
  }
  if (changed > 0) writeCustomProfiles(custom)
  return changed
}
