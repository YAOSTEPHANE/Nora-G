/** Jeton serveur → purge IndexedDB sur tous les postes de l’org. */

const FORCE_CLIENT_WIPE_AT_KEY = 'nora-force-client-wipe-at'
const LOCAL_WIPE_APPLIED_AT_PREFIX = 'nora-local-data-wipe-at:'

export function getStoredForceClientWipeAt(): number {
  if (typeof window === 'undefined') return 0
  try {
    const n = Number.parseInt(
      localStorage.getItem(FORCE_CLIENT_WIPE_AT_KEY) ?? '',
      10,
    )
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

export function setStoredForceClientWipeAt(at: number): void {
  if (typeof window === 'undefined') return
  try {
    const prev = getStoredForceClientWipeAt()
    if (at > prev) {
      localStorage.setItem(FORCE_CLIENT_WIPE_AT_KEY, String(at))
    }
  } catch {
    /* ignore */
  }
}

export function getAppliedLocalWipeAt(organizationId: string): number {
  try {
    const n = Number.parseInt(
      localStorage.getItem(`${LOCAL_WIPE_APPLIED_AT_PREFIX}${organizationId}`) ??
        '',
      10,
    )
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

export function setAppliedLocalWipeAt(organizationId: string, at: number): void {
  try {
    localStorage.setItem(
      `${LOCAL_WIPE_APPLIED_AT_PREFIX}${organizationId}`,
      String(at),
    )
  } catch {
    /* ignore */
  }
}
