import { db } from '../db/db'
import type { Product, SyncQueueItem } from '../db/types'
import { cloudSyncPushUrl, isCloudApiConfigured } from './apiUrl'
import { buildOrgAuthHeaders } from './subscription/authHeaders'
import { getOrganizationCredentials } from './subscription/store'
import { setLastSyncTimestamp } from './syncMeta'
import { pullCloudData } from './cloudPull'
import { getOrCreateTerminalId } from './session'

export type SyncResult = {
  processed: number
  mode: 'cloud' | 'local' | 'failed' | 'noop'
  error?: string
}

function parseSaleId(payload: string): string | undefined {
  try {
    const o = JSON.parse(payload) as { saleId?: string }
    return typeof o.saleId === 'string' ? o.saleId : undefined
  } catch {
    return undefined
  }
}

function buildBatchPayload(items: SyncQueueItem[]) {
  return items.map((item) => {
    let parsed: unknown = item.payload
    try {
      parsed = JSON.parse(item.payload) as unknown
    } catch {
      /* garder la chaîne brute */
    }
    return {
      kind: item.kind,
      createdAt: item.createdAt,
      payload: parsed,
    }
  })
}

/**
 * Envoie les mouvements de stock vers la file cloud (traitée au prochain flush).
 */
export async function enqueueStockSync(payload: {
  productId: string
  stock: number
  lowStockThreshold: number
  storeId: string
}): Promise<void> {
  await db.syncQueue.add({
    kind: 'stock',
    payload: JSON.stringify({
      type: 'stock_update',
      terminalId: getOrCreateTerminalId(),
      ...payload,
      at: Date.now(),
    }),
    createdAt: Date.now(),
  })
}

export async function enqueueProductSync(input: {
  action: 'upsert' | 'delete'
  productId: string
  product?: Product
}): Promise<void> {
  await db.syncQueue.add({
    kind: 'product',
    payload: JSON.stringify({
      type: input.action === 'delete' ? 'product_delete' : 'product_upsert',
      productId: input.productId,
      product: input.product,
      terminalId: getOrCreateTerminalId(),
      at: Date.now(),
    }),
    createdAt: Date.now(),
  })
}

/**
 * Synchronise la file vers le cloud via `POST /api/nora/sync` lorsque l’API est joignable.
 * La file n'est supprimée qu'après accusé de réception du serveur.
 */
export async function flushSyncQueue(): Promise<SyncResult> {
  const pending = await db.syncQueue.orderBy('createdAt').toArray()
  if (pending.length === 0) {
    return { processed: 0, mode: 'noop' }
  }

  const saleIds = pending
    .filter((p) => p.kind === 'sale')
    .map((p) => parseSaleId(p.payload))
    .filter(Boolean) as string[]

  const cloudUrl = cloudSyncPushUrl()
  const credentials = getOrganizationCredentials()

  const runtimeOnline = typeof navigator === 'undefined' ? true : navigator.onLine

  if (isCloudApiConfigured() && runtimeOnline && credentials?.licenseKey) {
    try {
      const body = JSON.stringify({
        batchId: crypto.randomUUID(),
        sentAt: Date.now(),
        items: buildBatchPayload(pending),
      })

      const ctrl = new AbortController()
      const timer = window.setTimeout(() => ctrl.abort(), 18_000)

      const res = await fetch(cloudUrl, {
        method: 'POST',
        headers: {
          ...buildOrgAuthHeaders({
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-terminal-id': getOrCreateTerminalId(),
          }),
        },
        body,
        signal: ctrl.signal,
      })
      window.clearTimeout(timer)

      if (!res.ok) {
        const err = `Cloud sync : HTTP ${res.status}`
        return { processed: 0, mode: 'failed', error: err }
      }

      for (const item of pending) {
        if (item.id != null) await db.syncQueue.delete(item.id)
      }
      for (const sid of saleIds) {
        await db.sales.update(sid, { synced: true })
      }
      setLastSyncTimestamp(Date.now())
      void pullCloudData().catch(() => undefined)
      return { processed: pending.length, mode: 'cloud' }
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Échec de la synchronisation cloud'
      return {
        processed: 0,
        mode: 'failed',
        error: msg.includes('abort') ? 'Délai dépassé (cloud)' : msg,
      }
    }
  }

  const reason = !isCloudApiConfigured()
    ? 'Synchronisation cloud non configurée : données conservées localement.'
    : !credentials?.licenseKey
      ? 'Licence absente : données conservées localement.'
      : 'Connexion indisponible : données conservées pour la prochaine synchronisation.'
  return { processed: 0, mode: 'failed', error: reason }
}

export async function pendingSyncCount(): Promise<number> {
  return db.syncQueue.count()
}
