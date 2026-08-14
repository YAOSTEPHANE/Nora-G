import type { OrganizationCredentials, SubscriptionSnapshot } from './types'

/** Grace hors-ligne pour le cache d’abonnement (7 jours). */
const OFFLINE_GRACE_MS = 168 * 60 * 60 * 1000

const ORG_KEY = 'nora-org-credentials-v1'
const SNAPSHOT_KEY = 'nora-subscription-snapshot-v1'
const SESSION_KEY = 'nora-session-token-v1'

function readSessionToken(): string | undefined {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw?.trim() || undefined
  } catch {
    return undefined
  }
}

function writeSessionToken(token: string | undefined): void {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token)
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

export function getOrganizationCredentials(): OrganizationCredentials | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(ORG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as OrganizationCredentials).licenseKey !== 'string' ||
      typeof (parsed as OrganizationCredentials).organizationId !== 'string' ||
      typeof (parsed as OrganizationCredentials).name !== 'string'
    ) {
      return null
    }
    const creds = parsed as OrganizationCredentials
    if (!creds.sessionToken) {
      creds.sessionToken = readSessionToken()
    }
    return creds
  } catch {
    return null
  }
}

export function setOrganizationCredentials(creds: OrganizationCredentials): void {
  writeSessionToken(creds.sessionToken)
  localStorage.setItem(ORG_KEY, JSON.stringify(creds))
}

export function clearOrganizationCredentials(): void {
  localStorage.removeItem(ORG_KEY)
  localStorage.removeItem(SNAPSHOT_KEY)
  localStorage.removeItem('nora-receipt-logo-url')
  localStorage.removeItem('nora-org-display-name')
  writeSessionToken(undefined)
}

export function getCachedSubscription(): SubscriptionSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SubscriptionSnapshot
    if (typeof parsed?.licenseKey !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function setCachedSubscription(snapshot: SubscriptionSnapshot): void {
  localStorage.setItem(
    SNAPSHOT_KEY,
    JSON.stringify({ ...snapshot, cachedAt: Date.now() }),
  )
}

export function isCacheWithinGrace(snapshot: SubscriptionSnapshot | null): boolean {
  if (!snapshot) return false
  return Date.now() - snapshot.cachedAt <= OFFLINE_GRACE_MS
}

export function effectiveUsable(
  snapshot: SubscriptionSnapshot | null,
  _online: boolean,
): boolean {
  return Boolean(snapshot)
}
