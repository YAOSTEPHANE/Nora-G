import type { ProductGridDensity } from '../components/ProductGrid'
import { DEFAULT_VAT_RATE_PCT } from './money'
import {
  isBusinessDomain,
  type BusinessDomain,
} from './businessDomain'

const STORAGE_KEY = 'nora-app-settings'

export const TABLE_AUTO_RELEASE_ENABLED_KEY = 'nora-tables-auto-release-enabled'
export const TABLE_AUTO_RELEASE_MINUTES_KEY = 'nora-tables-auto-release-minutes'

export const APP_SETTINGS_CHANGED_EVENT = 'nora-app-settings-changed'

export type AppSettings = {
  /** Domaine métier : détermine les modules et spécificités produit. */
  businessDomain: BusinessDomain
  defaultVatRatePct: number
  productGridDensity: ProductGridDensity
  autoPrintReceiptAfterSale: boolean
  blockSaleWhenOutOfStock: boolean
  receiptFooterLine: string
  kitchenSlaThresholdMin: number
  tableAutoReleaseEnabled: boolean
  tableAutoReleaseMinutes: string
  /** Heure d’arrivée attendue (HH:mm) pour détecter les retards. */
  pointageExpectedStartTime: string
  /** Durée journalière cible en heures (affichage synthèse). */
  pointageExpectedDailyHours: number
}

const DEFAULTS: AppSettings = {
  businessDomain: 'retail',
  defaultVatRatePct: DEFAULT_VAT_RATE_PCT,
  productGridDensity: 'compact',
  autoPrintReceiptAfterSale: true,
  blockSaleWhenOutOfStock: true,
  receiptFooterLine: 'Merci de votre visite !',
  kitchenSlaThresholdMin: 20,
  tableAutoReleaseEnabled: false,
  tableAutoReleaseMinutes: '120',
  pointageExpectedStartTime: '08:00',
  pointageExpectedDailyHours: 8,
}

function readLegacyTableSettings(): Pick<
  AppSettings,
  'tableAutoReleaseEnabled' | 'tableAutoReleaseMinutes'
> {
  try {
    const enabled = localStorage.getItem(TABLE_AUTO_RELEASE_ENABLED_KEY)
    const minutes = localStorage.getItem(TABLE_AUTO_RELEASE_MINUTES_KEY)
    return {
      tableAutoReleaseEnabled: enabled === '1',
      tableAutoReleaseMinutes: minutes ?? DEFAULTS.tableAutoReleaseMinutes,
    }
  } catch {
    return {
      tableAutoReleaseEnabled: DEFAULTS.tableAutoReleaseEnabled,
      tableAutoReleaseMinutes: DEFAULTS.tableAutoReleaseMinutes,
    }
  }
}

function normalizeSettings(raw: Partial<AppSettings>): AppSettings {
  const vat = Number(raw.defaultVatRatePct)
  const sla = Number(raw.kitchenSlaThresholdMin)
  const density =
    raw.productGridDensity === 'confort' ? 'confort' : 'compact'

  return {
    businessDomain: isBusinessDomain(raw.businessDomain)
      ? raw.businessDomain
      : DEFAULTS.businessDomain,
    defaultVatRatePct:
      Number.isFinite(vat) && vat >= 0 && vat <= 100
        ? vat
        : DEFAULTS.defaultVatRatePct,
    productGridDensity: density,
    autoPrintReceiptAfterSale:
      raw.autoPrintReceiptAfterSale ?? DEFAULTS.autoPrintReceiptAfterSale,
    blockSaleWhenOutOfStock:
      raw.blockSaleWhenOutOfStock ?? DEFAULTS.blockSaleWhenOutOfStock,
    receiptFooterLine:
      typeof raw.receiptFooterLine === 'string' && raw.receiptFooterLine.trim()
        ? raw.receiptFooterLine.trim()
        : DEFAULTS.receiptFooterLine,
    kitchenSlaThresholdMin:
      Number.isFinite(sla) && sla >= 5 && sla <= 120
        ? Math.round(sla)
        : DEFAULTS.kitchenSlaThresholdMin,
    tableAutoReleaseEnabled:
      raw.tableAutoReleaseEnabled ?? DEFAULTS.tableAutoReleaseEnabled,
    tableAutoReleaseMinutes:
      typeof raw.tableAutoReleaseMinutes === 'string' &&
      raw.tableAutoReleaseMinutes.trim()
        ? raw.tableAutoReleaseMinutes.trim()
        : DEFAULTS.tableAutoReleaseMinutes,
    pointageExpectedStartTime:
      typeof raw.pointageExpectedStartTime === 'string' &&
      /^\d{1,2}:\d{2}$/.test(raw.pointageExpectedStartTime.trim())
        ? raw.pointageExpectedStartTime.trim()
        : DEFAULTS.pointageExpectedStartTime,
    pointageExpectedDailyHours: (() => {
      const h = Number(raw.pointageExpectedDailyHours)
      return Number.isFinite(h) && h >= 1 && h <= 16
        ? Math.round(h)
        : DEFAULTS.pointageExpectedDailyHours
    })(),
  }
}

export function getAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      return normalizeSettings({ ...readLegacyTableSettings(), ...parsed })
    }
  } catch {
    /* ignore */
  }
  return normalizeSettings(readLegacyTableSettings())
}

export function saveAppSettings(patch: Partial<AppSettings>): AppSettings {
  const next = normalizeSettings({ ...getAppSettings(), ...patch })
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    localStorage.setItem(
      TABLE_AUTO_RELEASE_ENABLED_KEY,
      next.tableAutoReleaseEnabled ? '1' : '0',
    )
    localStorage.setItem(
      TABLE_AUTO_RELEASE_MINUTES_KEY,
      next.tableAutoReleaseMinutes,
    )
    window.dispatchEvent(new CustomEvent(APP_SETTINGS_CHANGED_EVENT))
  } catch {
    /* ignore */
  }
  return next
}

export function resetAppSettings(): AppSettings {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.setItem(TABLE_AUTO_RELEASE_ENABLED_KEY, '0')
    localStorage.setItem(
      TABLE_AUTO_RELEASE_MINUTES_KEY,
      DEFAULTS.tableAutoReleaseMinutes,
    )
    window.dispatchEvent(new CustomEvent(APP_SETTINGS_CHANGED_EVENT))
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS }
}
