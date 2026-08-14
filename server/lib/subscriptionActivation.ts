/** Prolonge une période de 30 jours à partir de la date de paiement (ou de la fin courante). */
export function calculateRenewalPeriodEnd(
  currentPeriodEnd: Date | null,
  paidAt: Date,
): Date {
  const baseMs =
    currentPeriodEnd && currentPeriodEnd.getTime() > paidAt.getTime()
      ? currentPeriodEnd.getTime()
      : paidAt.getTime()
  return new Date(baseMs + 30 * 24 * 60 * 60 * 1000)
}

/**
 * @deprecated Abonnements retirés — marque l’org active (accès gratuit).
 */
export async function activateMobileMoneySubscription(
  organizationId: string,
  _planId: string,
  _billingProvider: string,
): Promise<void> {
  const { prisma } = await import('./prisma.js')
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      status: 'active',
      planId: 'business',
      trialEndsAt: null,
      currentPeriodEnd: null,
    },
  })
}
