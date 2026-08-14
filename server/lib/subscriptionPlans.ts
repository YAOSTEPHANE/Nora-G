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

export const PLAN_ORDER: PlanId[] = ['starter', 'pro', 'business']

export const SUBSCRIPTION_PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Caisse, catalogue et stocks pour un point de vente.',
    priceFcfa: 9_900,
    maxStores: 1,
    maxStaff: 3,
    features: [
      'Caisse & encaissement',
      'Catalogue & stocks',
      'Rapport journalier',
      '1 magasin · 3 utilisateurs',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'Modules avancés pour restaurants et commerces actifs.',
    priceFcfa: 24_900,
    maxStores: 3,
    maxStaff: 10,
    features: [
      'Tout Starter',
      'Cuisine (KDS), tables, fidélité',
      'Commandes en ligne & promotions',
      'Analytique & comptabilité',
      '3 magasins · 10 utilisateurs',
    ],
  },
  business: {
    id: 'business',
    name: 'Business',
    description: 'Accès complet — tous les modules (sans abonnement).',
    priceFcfa: 0,
    maxStores: 0,
    maxStaff: 0,
    features: [
      'Tout Pro',
      'Multi-magasins & transferts',
      'CRM clients & gestion RH',
      'Intégrations & webhooks',
      'Magasins & utilisateurs illimités',
    ],
  },
}

export const TRIAL_DAYS = 30
export const OFFLINE_GRACE_HOURS = 168

export function planAtLeast(current: PlanId, required: PlanId): boolean {
  return PLAN_ORDER.indexOf(current) >= PLAN_ORDER.indexOf(required)
}

export function parsePlanId(value: string | undefined): PlanId {
  if (value === 'pro' || value === 'business') return value
  return 'starter'
}

export function parseStatus(value: string | undefined): SubscriptionStatus {
  if (
    value === 'active' ||
    value === 'trialing' ||
    value === 'past_due' ||
    value === 'canceled' ||
    value === 'expired'
  ) {
    return value
  }
  return 'expired'
}

/** Système d’abonnement retiré : toujours utilisable. */
export function isSubscriptionUsable(
  _status: SubscriptionStatus,
  _periodEnd: Date | null,
  _trialEndsAt: Date | null = null,
  _now = new Date(),
): boolean {
  return true
}
