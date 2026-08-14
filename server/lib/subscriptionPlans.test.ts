import { describe, expect, it } from 'vitest'
import { calculateRenewalPeriodEnd } from './subscriptionActivation.js'
import { isSubscriptionUsable } from './subscriptionPlans.js'

const NOW = new Date('2026-07-16T12:00:00.000Z')

describe('isSubscriptionUsable', () => {
  it('accepte toujours (abonnements retirés)', () => {
    expect(
      isSubscriptionUsable(
        'expired',
        new Date('2020-01-01T00:00:00.000Z'),
        null,
        NOW,
      ),
    ).toBe(true)
    expect(isSubscriptionUsable('trialing', null, null, NOW)).toBe(true)
  })
})

describe('calculateRenewalPeriodEnd', () => {
  it('ajoute trente jours à la période encore disponible', () => {
    expect(
      calculateRenewalPeriodEnd(
        new Date('2026-07-26T12:00:00.000Z'),
        NOW,
      ).toISOString(),
    ).toBe('2026-08-25T12:00:00.000Z')
  })

  it('repart de maintenant lorsque la période est expirée', () => {
    expect(
      calculateRenewalPeriodEnd(
        new Date('2026-07-10T12:00:00.000Z'),
        NOW,
      ).toISOString(),
    ).toBe('2026-08-15T12:00:00.000Z')
  })
})
