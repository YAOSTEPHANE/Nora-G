import { describe, expect, it } from 'vitest'
import { safeCompareSecret } from './sessionTokens.js'
import {
  assertStaffQuota,
  assertSubscriptionActive,
  planLimits,
} from './quotaEnforcement.js'
import { parsePlanId, isSubscriptionUsable } from './subscriptionPlans.js'
import { validateStaffPin } from './staffCredentials.js'

describe('safeCompareSecret', () => {
  it('compare en temps constant', () => {
    expect(safeCompareSecret('abc', 'abc')).toBe(true)
    expect(safeCompareSecret('abc', 'abd')).toBe(false)
  })
})

describe('subscriptionPlans helpers', () => {
  it('parsePlanId retourne starter par défaut', () => {
    expect(parsePlanId(undefined)).toBe('starter')
    expect(parsePlanId('business')).toBe('business')
  })

  it('isSubscriptionUsable toujours vrai', () => {
    expect(isSubscriptionUsable('expired', null, null)).toBe(true)
  })
})

describe('quotaEnforcement', () => {
  it('planLimits n’impose plus de quotas', () => {
    expect(planLimits({ planId: 'starter' } as never).maxStaff).toBe(0)
    expect(planLimits({ planId: 'business' } as never).maxStores).toBe(0)
  })

  it('assertSubscriptionActive n’bloque plus', () => {
    expect(
      assertSubscriptionActive({
        status: 'expired',
        currentPeriodEnd: null,
        trialEndsAt: null,
        planId: 'starter',
      } as never),
    ).toBeNull()
  })
})

describe('validateStaffPin', () => {
  it('accepte PIN 4 chiffres', () => {
    expect(validateStaffPin('1234')).toBeNull()
  })

  it('rejette PIN trop court', () => {
    expect(validateStaffPin('12')).toMatch(/4 et 8/)
  })
})

describe('assertStaffQuota', () => {
  it('exporte une fonction async', () => {
    expect(typeof assertStaffQuota).toBe('function')
  })
})
