import { apiUrl, isCloudApiConfigured } from './apiUrl'
import { mergeCloudDeltas } from './cloudMerge'
import { parseApiResponse } from './parseApiResponse'
import { buildOrgAuthHeaders } from './subscription/authHeaders'
import { getLastSyncTimestamp, setLastSyncTimestamp } from './syncMeta'
import { importStorefrontOrdersFromPull } from './storefront/syncInbox'
import type { UserRole } from '../auth/types'
import type { StaffPermissions } from '../auth/types'
import { getOrCreateTerminalId } from './session'

export type CloudPullResult = {
  ok: boolean
  staffCount: number
  ordersImported: number
  salesImported: number
  stockMerged: number
  mergeConflicts: number
  error?: string
}

type PullResponse = {
  ok: boolean
  pulledAt: number
  staff: Array<{
    id: string
    displayName: string
    initials: string
    role: UserRole
    storeId: string | null
    active: boolean
    updatedAt: number
    permissionOverrides?: Partial<StaffPermissions>
    customRoleId?: string | null
  }>
  storefrontOrders: Array<{
    id: string
    status: string
    payload: unknown
    createdAt: number
    updatedAt: number
  }>
  sales: Array<{ saleId: string; sale: Record<string, unknown>; terminalId?: string }>
  stockUpdates: Array<{
    productId: string
    storeId: string
    stock: number
    lowStockThreshold?: number
    terminalId?: string
    updatedAt: number
  }>
  productUpdates?: Array<{
    productId: string
    action: 'upsert' | 'delete'
    product?: Record<string, unknown>
    terminalId?: string
    updatedAt: number
  }>
  integrations: Record<string, unknown>
}

export async function pullCloudData(): Promise<CloudPullResult> {
  if (!isCloudApiConfigured()) {
    return emptyResult('Cloud non configuré.')
  }

  const since = getLastSyncTimestamp() ?? 0
  try {
    const res = await fetch(apiUrl(`/nora/sync/pull?since=${since}`), {
      headers: buildOrgAuthHeaders({
        Accept: 'application/json',
        'x-terminal-id': getOrCreateTerminalId(),
      }),
    })
    const data = await parseApiResponse<PullResponse>(res)
    const staffCount = await applyStaffFromCloud(data.staff)
    const ordersImported = await importStorefrontOrdersFromPull(data.storefrontOrders)
    const merge = await mergeCloudDeltas({
      sales: data.sales ?? [],
      stockUpdates: data.stockUpdates ?? [],
      productUpdates: data.productUpdates ?? [],
    })
    await applyIntegrationsFromCloud(data.integrations)
    setLastSyncTimestamp(data.pulledAt)
    // Après un reset serveur, le pull peut réimporter des restes : re-appliquer la purge locale.
    const { ensureSeed, maybeApplyPendingLocalDataWipe } = await import('../db/db')
    const wiped = await maybeApplyPendingLocalDataWipe()
    if (wiped) await ensureSeed()
    return {
      ok: true,
      staffCount,
      ordersImported,
      salesImported: merge.salesImported,
      stockMerged: merge.stockMerged,
      mergeConflicts: merge.conflicts,
    }
  } catch (err) {
    return emptyResult(err instanceof Error ? err.message : 'Pull cloud échoué')
  }
}

function emptyResult(error: string): CloudPullResult {
  return {
    ok: false,
    staffCount: 0,
    ordersImported: 0,
    salesImported: 0,
    stockMerged: 0,
    mergeConflicts: 0,
    error,
  }
}

async function applyStaffFromCloud(
  staff: PullResponse['staff'],
): Promise<number> {
  if (staff.length === 0) return 0
  const { mergeStaffFromCloud } = await import('../auth/profiles')
  return mergeStaffFromCloud(
    staff.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      initials: row.initials,
      role: row.role,
      storeId: row.storeId,
      active: row.active,
      permissionOverrides: row.permissionOverrides,
      customRoleId: row.customRoleId,
    })),
  )
}

async function applyIntegrationsFromCloud(config: Record<string, unknown>): Promise<void> {
  if (Object.keys(config).length === 0) return
  const { applyIntegrationConfigFromCloud } = await import('./integrationsConfig')
  applyIntegrationConfigFromCloud(config)
}
