import type { Organization } from '@prisma/client'
import { parsePlanId, type PlanId } from './subscriptionPlans.js'
import { prisma } from './prisma.js'

/** Accès toujours accordé — système d’abonnement retiré. */
export function orgSubscriptionUsable(_org: Organization): boolean {
  return true
}

export function orgPlan(org: Organization): PlanId {
  return parsePlanId(org.planId)
}

export function planLimits(_org: Organization): { maxStaff: number; maxStores: number } {
  return { maxStaff: 0, maxStores: 0 }
}

export async function countActiveStaff(organizationId: string): Promise<number> {
  return prisma.staffMember.count({
    where: { organizationId, active: true, revokedAt: null },
  })
}

export async function assertStaffQuota(
  _org: Organization,
  _additional = 1,
): Promise<string | null> {
  return null
}

export function assertSubscriptionActive(_org: Organization): string | null {
  return null
}
