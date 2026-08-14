import { prisma } from './prisma.js'
import { getPaymentSecrets } from './paymentProviderSettings.js'

export type PaymentProviderCreds = {
  waveApiKey: string | null
  waveWebhookSecret: string | null
  waveSigningSecret: string | null
  waveDemoMode: boolean
  cinetpayApiKey: string | null
  cinetpaySiteId: string | null
  cinetpayDemoMode: boolean
}

export type OrgPaymentProvidersPublicStatus = {
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

export type OrgPaymentProvidersUpdateInput = {
  waveApiKey?: string | null
  waveWebhookSecret?: string | null
  waveSigningSecret?: string | null
  waveDemoMode?: boolean
  cinetpayApiKey?: string | null
  cinetpaySiteId?: string | null
  cinetpayDemoMode?: boolean
}

/** Champs paiement commerçant (indépendants du client Prisma généré). */
export type OrgPaymentFields = {
  waveApiKey?: string | null
  waveWebhookSecret?: string | null
  waveSigningSecret?: string | null
  waveDemoMode?: boolean | null
  cinetpayApiKey?: string | null
  cinetpaySiteId?: string | null
  cinetpayDemoMode?: boolean | null
}

export function asOrgPaymentFields(org: object): OrgPaymentFields {
  return org as OrgPaymentFields
}

function trimOrNull(value: string | null | undefined): string | null {
  const t = value?.trim()
  return t ? t : null
}

function maskSecret(value: string | null | undefined): string | null {
  const v = trimOrNull(value)
  if (!v) return null
  if (v.length <= 4) return '••••'
  return `••••${v.slice(-4)}`
}

function publicBaseUrl(): string {
  return (
    process.env.APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:4000'
  ).replace(/\/$/, '')
}

/** Clés globales plateforme (abonnement Nora). */
export function platformPaymentCreds(): PaymentProviderCreds {
  const s = getPaymentSecrets()
  return {
    waveApiKey: s.waveApiKey,
    waveWebhookSecret: s.waveWebhookSecret,
    waveSigningSecret: s.waveSigningSecret,
    waveDemoMode: s.waveDemoMode,
    cinetpayApiKey: s.cinetpayApiKey,
    cinetpaySiteId: s.cinetpaySiteId,
    cinetpayDemoMode: s.cinetpayDemoMode,
  }
}

/** Clés du commerçant uniquement (pas de repli plateforme). */
export function merchantPaymentCreds(org: OrgPaymentFields): PaymentProviderCreds {
  const prod = process.env.NODE_ENV === 'production'
  return {
    waveApiKey: trimOrNull(org.waveApiKey),
    waveWebhookSecret: trimOrNull(org.waveWebhookSecret),
    waveSigningSecret: trimOrNull(org.waveSigningSecret),
    waveDemoMode: prod ? false : Boolean(org.waveDemoMode),
    cinetpayApiKey: trimOrNull(org.cinetpayApiKey),
    cinetpaySiteId: trimOrNull(org.cinetpaySiteId),
    cinetpayDemoMode: prod ? false : Boolean(org.cinetpayDemoMode),
  }
}

export function waveCredsEnabled(creds: PaymentProviderCreds): boolean {
  return Boolean(creds.waveApiKey) || creds.waveDemoMode
}

export function cinetpayCredsEnabled(creds: PaymentProviderCreds): boolean {
  return Boolean(creds.cinetpayApiKey && creds.cinetpaySiteId) || creds.cinetpayDemoMode
}

export function orgPaymentProvidersPublicStatus(
  org: OrgPaymentFields,
): OrgPaymentProvidersPublicStatus {
  const c = merchantPaymentCreds(org)
  const waveConfigured = Boolean(c.waveApiKey)
  const orangeConfigured = Boolean(c.cinetpayApiKey && c.cinetpaySiteId)
  const base = publicBaseUrl()

  return {
    wave: {
      configured: waveConfigured,
      demoMode: c.waveDemoMode,
      enabled: waveCredsEnabled(c),
      apiKeyHint: maskSecret(c.waveApiKey),
      webhookSecretSet: Boolean(c.waveWebhookSecret),
      signingSecretSet: Boolean(c.waveSigningSecret),
    },
    orangeMoney: {
      configured: orangeConfigured,
      demoMode: c.cinetpayDemoMode,
      enabled: cinetpayCredsEnabled(c),
      apiKeyHint: maskSecret(c.cinetpayApiKey),
      siteIdHint: maskSecret(c.cinetpaySiteId),
    },
    webhookUrls: {
      wave: `${base}/api/billing/wave/webhook`,
      cinetpay: `${base}/api/billing/cinetpay/notify`,
    },
  }
}

export async function updateOrganizationPaymentProviders(
  organizationId: string,
  input: OrgPaymentProvidersUpdateInput,
): Promise<OrgPaymentProvidersPublicStatus> {
  const existingRaw = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
  })
  const existing = asOrgPaymentFields(existingRaw)

  const next = {
    waveApiKey:
      input.waveApiKey === undefined
        ? existing.waveApiKey ?? null
        : trimOrNull(input.waveApiKey),
    waveWebhookSecret:
      input.waveWebhookSecret === undefined
        ? existing.waveWebhookSecret ?? null
        : trimOrNull(input.waveWebhookSecret),
    waveSigningSecret:
      input.waveSigningSecret === undefined
        ? existing.waveSigningSecret ?? null
        : trimOrNull(input.waveSigningSecret),
    waveDemoMode:
      input.waveDemoMode === undefined
        ? Boolean(existing.waveDemoMode)
        : Boolean(input.waveDemoMode) && process.env.NODE_ENV !== 'production',
    cinetpayApiKey:
      input.cinetpayApiKey === undefined
        ? existing.cinetpayApiKey ?? null
        : trimOrNull(input.cinetpayApiKey),
    cinetpaySiteId:
      input.cinetpaySiteId === undefined
        ? existing.cinetpaySiteId ?? null
        : trimOrNull(input.cinetpaySiteId),
    cinetpayDemoMode:
      input.cinetpayDemoMode === undefined
        ? Boolean(existing.cinetpayDemoMode)
        : Boolean(input.cinetpayDemoMode) &&
          process.env.NODE_ENV !== 'production',
  }

  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: next as never,
  })

  return orgPaymentProvidersPublicStatus(asOrgPaymentFields(updated))
}
