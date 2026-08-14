import { clientEnv } from './clientEnv'

function configuredApiOrigin(): string {
  const configured = clientEnv.apiBaseUrl()
  if (!configured) return ''

  return configured.replace(/\/+$/, '').replace(/\/api$/i, '')
}

/**
 * Indique si le client peut joindre l’API cloud (push/pull sync, staff distant).
 * - `NEXT_PUBLIC_API_BASE_URL` : frontend et API sur des domaines distincts ;
 * - rewrites Next `/api` ou monolithe API : chemins relatifs `/api/...`.
 */
export function isCloudApiConfigured(): boolean {
  if (clientEnv.apiBaseUrl()) return true
  if (clientEnv.cloudSyncUrl()) return true
  return typeof window !== 'undefined'
}

/**
 * URL d’envoi de la file sync locale → cloud.
 * Préfère `apiUrl('/nora/sync')` ; `NEXT_PUBLIC_CLOUD_SYNC_URL` reste un repli legacy.
 */
export function cloudSyncPushUrl(): string {
  const legacy = clientEnv.cloudSyncUrl()
  if (legacy) return legacy
  return apiUrl('/nora/sync')
}

/**
 * Construit une URL API compatible avec :
 * - un déploiement fullstack sur le même domaine ;
 * - un frontend Next et une API hébergée séparément.
 */
export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${configuredApiOrigin()}/api${normalizedPath}`
}
