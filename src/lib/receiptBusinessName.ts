import {
  getCachedSubscription,
  getOrganizationCredentials,
} from './subscription/store'

/**
 * Nom d’entreprise affiché en tête des tickets / reçus.
 * Source : credentials org ou snapshot d’abonnement en cache.
 */
export function getReceiptBusinessName(): string {
  const fromCreds = getOrganizationCredentials()?.name?.trim()
  if (fromCreds) return fromCreds
  const fromSnap = getCachedSubscription()?.name?.trim()
  if (fromSnap) return fromSnap
  return 'Nora'
}

export function receiptDocumentLabel(
  kind: 'sale' | 'onlineOrder' | 'ticket' | 'facture',
): string {
  switch (kind) {
    case 'onlineOrder':
      return 'Commande web'
    case 'facture':
      return 'Facture'
    case 'ticket':
      return 'Ticket'
    case 'sale':
      return 'Ticket de caisse'
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}
