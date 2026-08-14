/** Clés localStorage pour la démo « intégrations » (sans backend). */
import {
  getStoredForceClientWipeAt,
  setStoredForceClientWipeAt,
} from './clientDataWipe'

const KEY_API = 'nora-demo-partner-api-key'
const KEY_COMPTA = 'nora-module-compta-demo'
const KEY_ECOM = 'nora-module-ecom-demo'
const KEY_DELIVERY = 'nora-module-delivery-demo'
const KEY_DELIVERY_PROVIDER = 'nora-delivery-provider'
const KEY_DELIVERY_WEBHOOK = 'nora-delivery-webhook-url'
const KEY_KITCHEN = 'nora-module-kitchen-demo'
const KEY_KITCHEN_STATION = 'nora-kitchen-station'
const KEY_ONLINE_PLATFORMS = 'nora-online-platforms'
const KEY_ONLINE_SYNC_MODE = 'nora-online-sync-mode'
const KEY_DEVICE_ORDER_TERMINALS = 'nora-device-order-terminals'
const KEY_DEVICE_RECEIPT_PRINTERS = 'nora-device-receipt-printers'
const KEY_DEVICE_KDS_SCREENS = 'nora-device-kds-screens'
const KEY_DEVICE_CASH_DRAWER = 'nora-device-cash-drawer'
const KEY_DEVICE_PAYMENT_TERMINALS = 'nora-device-payment-terminals'

export function getOrCreateDemoApiKey(): string {
  try {
    let k = localStorage.getItem(KEY_API)
    if (!k) {
      k = `ck_live_${crypto.randomUUID().replace(/-/g, '')}`
      localStorage.setItem(KEY_API, k)
    }
    return k
  } catch {
    return 'ck_live_••••••••••••••••'
  }
}

export function isComptaModuleDemoOn(): boolean {
  try {
    return localStorage.getItem(KEY_COMPTA) === '1'
  } catch {
    return false
  }
}

export function setComptaModuleDemo(on: boolean): void {
  try {
    localStorage.setItem(KEY_COMPTA, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function isEcomModuleDemoOn(): boolean {
  try {
    return localStorage.getItem(KEY_ECOM) === '1'
  } catch {
    return false
  }
}

export function setEcomModuleDemo(on: boolean): void {
  try {
    localStorage.setItem(KEY_ECOM, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function isDeliveryModuleDemoOn(): boolean {
  try {
    return localStorage.getItem(KEY_DELIVERY) === '1'
  } catch {
    return false
  }
}

export function setDeliveryModuleDemo(on: boolean): void {
  try {
    localStorage.setItem(KEY_DELIVERY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function getDeliveryProviderDemo(): string {
  try {
    return localStorage.getItem(KEY_DELIVERY_PROVIDER) || 'Coursier interne'
  } catch {
    return 'Coursier interne'
  }
}

export function setDeliveryProviderDemo(provider: string): void {
  try {
    localStorage.setItem(KEY_DELIVERY_PROVIDER, provider.trim() || 'Coursier interne')
  } catch {
    /* ignore */
  }
}

export function getDeliveryWebhookDemo(): string {
  try {
    return localStorage.getItem(KEY_DELIVERY_WEBHOOK) || ''
  } catch {
    return ''
  }
}

export function setDeliveryWebhookDemo(url: string): void {
  try {
    localStorage.setItem(KEY_DELIVERY_WEBHOOK, url.trim())
  } catch {
    /* ignore */
  }
}

export function isKitchenModuleDemoOn(): boolean {
  try {
    const raw = localStorage.getItem(KEY_KITCHEN)
    if (raw === null) return true
    return raw === '1'
  } catch {
    return true
  }
}

export function setKitchenModuleDemo(on: boolean): void {
  try {
    localStorage.setItem(KEY_KITCHEN, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function getKitchenStationDemo(): string {
  try {
    return localStorage.getItem(KEY_KITCHEN_STATION) || 'Cuisine principale'
  } catch {
    return 'Cuisine principale'
  }
}

export function setKitchenStationDemo(station: string): void {
  try {
    localStorage.setItem(
      KEY_KITCHEN_STATION,
      station.trim() || 'Cuisine principale',
    )
  } catch {
    /* ignore */
  }
}

export type ConnectedPlatform =
  | 'shopify'
  | 'glovo'
  | 'ubereats'
  | 'jumia'
  | 'whatsapp'

const DEFAULT_PLATFORMS: ConnectedPlatform[] = ['shopify']

export function getConnectedPlatformsDemo(): ConnectedPlatform[] {
  try {
    const raw = localStorage.getItem(KEY_ONLINE_PLATFORMS)
    if (!raw) return DEFAULT_PLATFORMS
    const parsed = JSON.parse(raw) as string[]
    const allowed = new Set<ConnectedPlatform>([
      'shopify',
      'glovo',
      'ubereats',
      'jumia',
      'whatsapp',
    ])
    const out = parsed.filter((p): p is ConnectedPlatform => allowed.has(p as ConnectedPlatform))
    return out.length > 0 ? out : DEFAULT_PLATFORMS
  } catch {
    return DEFAULT_PLATFORMS
  }
}

export function setConnectedPlatformsDemo(platforms: ConnectedPlatform[]): void {
  try {
    localStorage.setItem(KEY_ONLINE_PLATFORMS, JSON.stringify(platforms))
  } catch {
    /* ignore */
  }
}

export function getOnlineSyncModeDemo(): 'webhook' | 'pull' {
  try {
    const raw = localStorage.getItem(KEY_ONLINE_SYNC_MODE)
    return raw === 'pull' ? 'pull' : 'webhook'
  } catch {
    return 'webhook'
  }
}

export function setOnlineSyncModeDemo(mode: 'webhook' | 'pull'): void {
  try {
    localStorage.setItem(KEY_ONLINE_SYNC_MODE, mode)
  } catch {
    /* ignore */
  }
}

export type DeviceConnectivityDemo = {
  orderTerminals: boolean
  receiptPrinters: boolean
  kitchenScreens: boolean
  cashDrawer: boolean
  paymentTerminals: boolean
}

const DEFAULT_DEVICE_CONNECTIVITY: DeviceConnectivityDemo = {
  orderTerminals: true,
  receiptPrinters: true,
  kitchenScreens: true,
  cashDrawer: true,
  paymentTerminals: false,
}

function readBoolKey(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return raw === '1'
  } catch {
    return fallback
  }
}

function writeBoolKey(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function getDeviceConnectivityDemo(): DeviceConnectivityDemo {
  return {
    orderTerminals: readBoolKey(
      KEY_DEVICE_ORDER_TERMINALS,
      DEFAULT_DEVICE_CONNECTIVITY.orderTerminals,
    ),
    receiptPrinters: readBoolKey(
      KEY_DEVICE_RECEIPT_PRINTERS,
      DEFAULT_DEVICE_CONNECTIVITY.receiptPrinters,
    ),
    kitchenScreens: readBoolKey(
      KEY_DEVICE_KDS_SCREENS,
      DEFAULT_DEVICE_CONNECTIVITY.kitchenScreens,
    ),
    cashDrawer: readBoolKey(
      KEY_DEVICE_CASH_DRAWER,
      DEFAULT_DEVICE_CONNECTIVITY.cashDrawer,
    ),
    paymentTerminals: readBoolKey(
      KEY_DEVICE_PAYMENT_TERMINALS,
      DEFAULT_DEVICE_CONNECTIVITY.paymentTerminals,
    ),
  }
}

export function setDeviceConnectivityDemo(config: DeviceConnectivityDemo): void {
  writeBoolKey(KEY_DEVICE_ORDER_TERMINALS, config.orderTerminals)
  writeBoolKey(KEY_DEVICE_RECEIPT_PRINTERS, config.receiptPrinters)
  writeBoolKey(KEY_DEVICE_KDS_SCREENS, config.kitchenScreens)
  writeBoolKey(KEY_DEVICE_CASH_DRAWER, config.cashDrawer)
  writeBoolKey(KEY_DEVICE_PAYMENT_TERMINALS, config.paymentTerminals)
  void saveIntegrationConfigToServer(getIntegrationConfigSnapshot()).catch(() => undefined)
}

function getIntegrationConfigSnapshot(): Record<string, unknown> {
  const forceClientWipeAt = getStoredForceClientWipeAt()
  return {
    compta: isComptaModuleDemoOn(),
    ecom: isEcomModuleDemoOn(),
    delivery: isDeliveryModuleDemoOn(),
    kitchen: isKitchenModuleDemoOn(),
    deliveryProvider: getDeliveryProviderDemo(),
    deliveryWebhook: getDeliveryWebhookDemo(),
    kitchenStation: getKitchenStationDemo(),
    onlinePlatforms: getConnectedPlatformsDemo(),
    onlineSyncMode: getOnlineSyncModeDemo(),
    devices: getDeviceConnectivityDemo(),
    ...(forceClientWipeAt > 0 ? { forceClientWipeAt } : {}),
  }
}

export function applyIntegrationConfigFromCloud(config: Record<string, unknown>): void {
  if (typeof config.forceClientWipeAt === 'number' && config.forceClientWipeAt > 0) {
    setStoredForceClientWipeAt(config.forceClientWipeAt)
  }
  if (typeof config.compta === 'boolean') setComptaModuleDemo(config.compta)
  if (typeof config.ecom === 'boolean') setEcomModuleDemo(config.ecom)
  if (typeof config.delivery === 'boolean') setDeliveryModuleDemo(config.delivery)
  if (typeof config.kitchen === 'boolean') setKitchenModuleDemo(config.kitchen)
  if (typeof config.deliveryProvider === 'string') {
    setDeliveryProviderDemo(config.deliveryProvider)
  }
  if (typeof config.deliveryWebhook === 'string') {
    setDeliveryWebhookDemo(config.deliveryWebhook)
  }
  if (typeof config.kitchenStation === 'string') {
    setKitchenStationDemo(config.kitchenStation)
  }
  if (Array.isArray(config.onlinePlatforms)) {
    const allowed = new Set<ConnectedPlatform>([
      'shopify',
      'glovo',
      'ubereats',
      'jumia',
      'whatsapp',
    ])
    setConnectedPlatformsDemo(
      config.onlinePlatforms.filter(
        (v): v is ConnectedPlatform =>
          typeof v === 'string' && allowed.has(v as ConnectedPlatform),
      ),
    )
  }
  if (typeof config.onlineSyncMode === 'string') {
    setOnlineSyncModeDemo(config.onlineSyncMode === 'pull' ? 'pull' : 'webhook')
  }
  if (typeof config.devices === 'object' && config.devices !== null) {
    const devices = config.devices as Partial<DeviceConnectivityDemo>
    setDeviceConnectivityDemo({
      orderTerminals: devices.orderTerminals ?? DEFAULT_DEVICE_CONNECTIVITY.orderTerminals,
      receiptPrinters: devices.receiptPrinters ?? DEFAULT_DEVICE_CONNECTIVITY.receiptPrinters,
      kitchenScreens: devices.kitchenScreens ?? DEFAULT_DEVICE_CONNECTIVITY.kitchenScreens,
      cashDrawer: devices.cashDrawer ?? DEFAULT_DEVICE_CONNECTIVITY.cashDrawer,
      paymentTerminals: devices.paymentTerminals ?? DEFAULT_DEVICE_CONNECTIVITY.paymentTerminals,
    })
  }
}

async function saveIntegrationConfigToServer(
  config: Record<string, unknown>,
): Promise<void> {
  const { buildOrgAuthHeaders } = await import('./subscription/authHeaders')
  const { apiUrl } = await import('./apiUrl')
  await fetch(apiUrl('/org/integrations'), {
    method: 'PUT',
    headers: buildOrgAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ config }),
  })
}
