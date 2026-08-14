import { fetchStorefrontBranding } from './storefront/api'
import { storefrontDisplayName } from './storefront/types'
import { hasOrgAuth } from './subscription/authHeaders'
import {
  getCachedReceiptLogoUrl,
  setCachedReceiptLogoUrl,
} from './receiptLogo'

const NAME_KEY = 'nora-org-display-name'
export const ORG_BRANDING_CHANGED_EVENT = 'nora:org-branding-changed'

export type OrgWorkspaceBranding = {
  logoUrl: string | null
  displayName: string | null
}

export function getCachedOrgDisplayName(): string | null {
  try {
    const raw = localStorage.getItem(NAME_KEY)?.trim()
    return raw || null
  } catch {
    return null
  }
}

export function setCachedOrgDisplayName(name: string | null | undefined): void {
  try {
    const trimmed = name?.trim()
    if (!trimmed) {
      localStorage.removeItem(NAME_KEY)
      return
    }
    localStorage.setItem(NAME_KEY, trimmed)
  } catch {
    /* ignore */
  }
}

export function getCachedOrgWorkspaceBranding(): OrgWorkspaceBranding {
  return {
    logoUrl: getCachedReceiptLogoUrl(),
    displayName: getCachedOrgDisplayName(),
  }
}

export function cacheOrgWorkspaceBranding(input: {
  logoUrl?: string | null
  displayName?: string | null
}): void {
  if ('logoUrl' in input) setCachedReceiptLogoUrl(input.logoUrl)
  if ('displayName' in input) setCachedOrgDisplayName(input.displayName)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ORG_BRANDING_CHANGED_EVENT))
  }
}

/** Charge le branding boutique pour l’espace POS (logo + nom vitrine). */
export async function resolveOrgWorkspaceBranding(): Promise<OrgWorkspaceBranding> {
  if (!hasOrgAuth()) {
    return { logoUrl: null, displayName: null }
  }
  try {
    const data = await fetchStorefrontBranding()
    const logoUrl = data.branding.logoUrl?.trim() || null
    const displayName = storefrontDisplayName(
      data.branding,
      data.storeName,
      '',
    ).trim() || data.storeName.trim() || null
    cacheOrgWorkspaceBranding({ logoUrl, displayName })
    return { logoUrl, displayName }
  } catch {
    return getCachedOrgWorkspaceBranding()
  }
}
