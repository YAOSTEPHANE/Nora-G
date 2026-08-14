import { prisma } from './prisma.js'

export type RemoteSalePayload = {
  saleId: string
  sale: Record<string, unknown>
  terminalId?: string
  updatedAt: number
}

export type RemoteStockPayload = {
  productId: string
  storeId: string
  stock: number
  lowStockThreshold?: number
  terminalId?: string
  updatedAt: number
}

export type RemoteProductPayload = {
  productId: string
  action: 'upsert' | 'delete'
  product?: Record<string, unknown>
  terminalId?: string
  updatedAt: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

export async function collectOrgSyncDeltas(
  organizationId: string,
  sinceMs: number,
  excludeTerminalId?: string | null,
): Promise<{
  sales: RemoteSalePayload[]
  stockUpdates: RemoteStockPayload[]
  productUpdates: RemoteProductPayload[]
}> {
  const since = new Date(sinceMs)
  const items = await prisma.syncItem.findMany({
    where: {
      syncBatch: { organizationId },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'asc' },
    take: 5000,
    include: {
      syncBatch: { select: { source: true } },
    },
  })

  const salesMap = new Map<string, RemoteSalePayload>()
  const stockMap = new Map<string, RemoteStockPayload>()
  const productMap = new Map<string, RemoteProductPayload>()

  for (const item of items) {
    const payload = asRecord(item.payload)
    if (!payload) continue
    const terminalId =
      typeof payload.terminalId === 'string'
        ? payload.terminalId
        : item.syncBatch.source ?? undefined
    if (excludeTerminalId && terminalId === excludeTerminalId) continue

    if (item.kind === 'sale') {
      const saleId =
        typeof payload.saleId === 'string'
          ? payload.saleId
          : typeof payload.id === 'string'
            ? payload.id
            : null
      const saleBody = asRecord(payload.sale) ?? payload
      if (!saleId) continue
      salesMap.set(saleId, {
        saleId,
        sale: saleBody,
        terminalId,
        updatedAt: item.createdAt.getTime(),
      })
      continue
    }

    if (item.kind === 'stock') {
      const productId = typeof payload.productId === 'string' ? payload.productId : null
      const storeId = typeof payload.storeId === 'string' ? payload.storeId : null
      const stock = typeof payload.stock === 'number' ? payload.stock : null
      if (!productId || !storeId || stock == null) continue
      const key = `${storeId}:${productId}`
      stockMap.set(key, {
        productId,
        storeId,
        stock,
        lowStockThreshold:
          typeof payload.lowStockThreshold === 'number'
            ? payload.lowStockThreshold
            : undefined,
        terminalId,
        updatedAt: item.createdAt.getTime(),
      })
      continue
    }

    if (item.kind === 'product') {
      const productId = typeof payload.productId === 'string' ? payload.productId : null
      if (!productId) continue
      const type = payload.type === 'product_delete' ? 'delete' : 'upsert'
      productMap.set(productId, {
        productId,
        action: type,
        product: asRecord(payload.product) ?? undefined,
        terminalId,
        updatedAt: item.createdAt.getTime(),
      })
    }
  }

  return {
    sales: [...salesMap.values()],
    stockUpdates: [...stockMap.values()],
    productUpdates: [...productMap.values()],
  }
}
