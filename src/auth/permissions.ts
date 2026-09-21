import { getCustomRole } from './customRoles'
import { ROLE_DEFAULT_PERMISSIONS } from './roleDefaults'
import type { StaffProfile, StaffPermissions } from './types'

export { ROLE_DEFAULT_PERMISSIONS } from './roleDefaults'

export function effectivePermissions(profile: StaffProfile): StaffPermissions {
  const custom = getCustomRole(profile.customRoleId)
  const base =
    custom?.permissions ?? ROLE_DEFAULT_PERMISSIONS[profile.role]
  return { ...base, ...profile.permissionOverrides }
}

/** Vérifie le secret : PIN ou mot de passe (si défini). */
export function profileSecretMatches(
  profile: StaffProfile,
  secret: string,
): boolean {
  const s = secret.trim()
  if (s === profile.pin) return true
  if (profile.password && s === profile.password) return true
  return false
}
