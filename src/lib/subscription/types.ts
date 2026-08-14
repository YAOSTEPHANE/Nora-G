export type PlanId = 'starter' | 'pro' | 'business'

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired'

export type PlanDefinition = {
  id: PlanId
  name: string
  description: string
  priceFcfa: number
  maxStores: number
  maxStaff: number
  features: string[]
}

export type SubscriptionSnapshot = {
  organizationId: string
  name: string
  email: string
  licenseKey: string
  sessionToken?: string
  storeCode: string | null
  /** Segment URL boutique (nom d’entreprise slugifié). */
  storeSlug?: string | null
  /** Clé préférée pour /boutique/... (slug ou code). */
  storefrontKey?: string | null
  planId: PlanId
  plan: PlanDefinition
  status: SubscriptionStatus
  usable: boolean
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  stripeEnabled: boolean
  mobileMoneyEnabled: boolean
  billingPhone: string | null
  smsRemindersEnabled: boolean
  cachedAt: number
}

export type OrganizationCredentials = {
  licenseKey: string
  sessionToken?: string
  organizationId: string
  name: string
  storeCode?: string | null
  storeSlug?: string | null
  storefrontKey?: string | null
}
