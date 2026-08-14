import { apiUrl } from '../apiUrl'
import { parseApiResponse } from '../parseApiResponse'
import { buildOrgAuthHeaders } from './authHeaders'
import type { SubscriptionSnapshot } from './types'

async function parseJson<T>(res: Response): Promise<T> {
  return parseApiResponse<T>(res)
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return buildOrgAuthHeaders({
    'Content-Type': 'application/json',
    ...extra,
  })
}

export async function refreshSubscription(
  _licenseKey: string,
): Promise<SubscriptionSnapshot> {
  const res = await fetch(apiUrl('/billing/status'), {
    headers: buildOrgAuthHeaders({ 'x-license-key': _licenseKey }),
  })
  const data = await parseJson<Omit<SubscriptionSnapshot, 'cachedAt'>>(res)
  return { ...data, cachedAt: Date.now() }
}

export type OrgPaymentProvidersStatus = {
  wave: {
    configured: boolean
    demoMode: boolean
    enabled: boolean
    apiKeyHint: string | null
    webhookSecretSet: boolean
    signingSecretSet: boolean
  }
  orangeMoney: {
    configured: boolean
    demoMode: boolean
    enabled: boolean
    apiKeyHint: string | null
    siteIdHint: string | null
  }
  webhookUrls: {
    wave: string
    cinetpay: string
  }
}

export type OrgPaymentProvidersUpdateBody = {
  waveApiKey?: string | null
  waveWebhookSecret?: string | null
  waveSigningSecret?: string | null
  waveDemoMode?: boolean
  cinetpayApiKey?: string | null
  cinetpaySiteId?: string | null
  cinetpayDemoMode?: boolean
}

export async function fetchOrgPaymentProviders(
  _licenseKey: string,
): Promise<OrgPaymentProvidersStatus> {
  const res = await fetch(apiUrl('/billing/payment-providers'), {
    headers: buildOrgAuthHeaders({ 'x-license-key': _licenseKey }),
  })
  return parseJson(res)
}

export async function saveOrgPaymentProviders(
  _licenseKey: string,
  body: OrgPaymentProvidersUpdateBody,
): Promise<OrgPaymentProvidersStatus> {
  const res = await fetch(apiUrl('/billing/payment-providers'), {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

/** Purge métier serveur + jeton wipe client (compte / abonnement conservés). */
export async function resetOrganizationData(confirmName: string): Promise<{
  ok: boolean
  forceClientWipeAt: number
}> {
  const res = await fetch(apiUrl('/org/reset-data'), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ confirmName }),
  })
  return parseJson(res)
}
