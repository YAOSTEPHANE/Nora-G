import { listActiveStaffProfiles } from '../auth/profiles'
import { profileSecretMatches } from '../auth/permissions'
import { ROLE_DEFAULT_PERMISSIONS } from '../auth/roleDefaults'
import type { BuiltinUserRole } from '../auth/types'
import { getCustomRole } from '../auth/customRoles'

/**
 * Vérifie le PIN / mot de passe d’un gérant ou admin
 * pour débloquer une remise au-delà du plafond caissier.
 */
export function verifyManagerOverrideSecret(secret: string): {
  ok: true
  profileId: string
  displayName: string
  role: BuiltinUserRole
} | { ok: false; message: string } {
  const s = secret.trim()
  if (!s) return { ok: false, message: 'Saisissez le PIN ou mot de passe gérant.' }

  for (const profile of listActiveStaffProfiles()) {
    if (profile.role !== 'admin' && profile.role !== 'gerant') continue
    const custom = getCustomRole(profile.customRoleId)
    const perms = custom?.permissions ?? ROLE_DEFAULT_PERMISSIONS[profile.role]
    if (perms.maxDiscountPct < 20 && profile.role !== 'admin') continue
    if (!profileSecretMatches(profile, s)) continue
    return {
      ok: true,
      profileId: profile.id,
      displayName: profile.displayName,
      role: profile.role,
    }
  }
  return { ok: false, message: 'Secret gérant / admin incorrect.' }
}

export function clampDiscountPct(requested: number, maxAllowed: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return 0
  if (maxAllowed <= 0) return 0
  return Math.min(100, Math.max(0, Math.round(requested)), maxAllowed)
}
