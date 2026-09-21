import type {
  WhatsAppCampaign,
  WhatsAppCampaignKind,
  WhatsAppCampaignMessage,
} from '../db/types'
import type { CustomerProfileRow } from './customerSegmentation'
import { filterCustomerProfiles } from './customerSegmentation'

export const WHATSAPP_KIND_LABELS: Record<WhatsAppCampaignKind, string> = {
  promo: 'Promotion',
  relance: 'Relance',
  invitation: 'Invitation',
  reactivation: 'Réactivation',
  custom: 'Personnalisé',
}

export const WHATSAPP_TEMPLATES: Record<
  WhatsAppCampaignKind,
  { name: string; body: string }
> = {
  promo: {
    name: 'Offre du moment',
    body: `Bonjour {{prenom}} 👋

Une offre vous attend chez {{boutique}} : profitez-en dès aujourd’hui.

Votre solde fidélité : {{points}} pts.
À très vite !`,
  },
  relance: {
    name: 'Relance après achat',
    body: `Bonjour {{prenom}},

Merci pour votre dernière visite chez {{boutique}}.
Comment s’est passé votre achat ? On reste à votre disposition.

À bientôt 💬`,
  },
  invitation: {
    name: 'Invitation événement',
    body: `Bonjour {{prenom}},

{{boutique}} a le plaisir de vous inviter à notre prochaine animation.
Réservez votre place en répondant à ce message.

Au plaisir de vous accueillir !`,
  },
  reactivation: {
    name: 'Réactivation clientes',
    body: `Bonjour {{prenom}},

Cela fait un moment que l’on ne s’est pas vu(e) chez {{boutique}}.
Revenez nous voir : une petite attention vous attend.

Votre panier moyen habituel : {{panier}} — on a hâte de vous revoir 💛`,
  },
  custom: {
    name: 'Message libre',
    body: `Bonjour {{prenom}},

{{boutique}} vous contacte.

À bientôt !`,
  },
}

export function personalizeWhatsAppMessage(
  template: string,
  profile: CustomerProfileRow,
  boutiqueName: string,
): string {
  const prenom =
    profile.displayName.split(/\s+/)[0]?.trim() || profile.displayName || 'Cliente'
  return template
    .replaceAll('{{prenom}}', prenom)
    .replaceAll('{{nom}}', profile.displayName)
    .replaceAll('{{points}}', String(profile.points))
    .replaceAll(
      '{{depense}}',
      profile.totalSpentTTC.toLocaleString('fr-FR'),
    )
    .replaceAll(
      '{{panier}}',
      profile.avgBasketTTC.toLocaleString('fr-FR') + ' FCFA',
    )
    .replaceAll('{{boutique}}', boutiqueName)
    .replaceAll('{{telephone}}', profile.phone)
}

export function whatsappSendHref(phone: string, text: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) return null
  // Côte d’Ivoire : si 10 chiffres commençant par 0, garder tel quel pour wa.me
  // wa.me attend indicatif pays sans +
  let n = digits
  if (n.startsWith('00')) n = n.slice(2)
  if (n.length === 10 && n.startsWith('0')) {
    n = `225${n.slice(1)}`
  }
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}

export function resolveCampaignAudience(
  campaign: Pick<
    WhatsAppCampaign,
    | 'audience'
    | 'inactiveDays'
    | 'productId'
    | 'minSpendTTC'
    | 'minFrequency'
    | 'manualCustomerIds'
    | 'storeId'
  >,
  profiles: CustomerProfileRow[],
): CustomerProfileRow[] {
  if (campaign.audience === 'manual') {
    const ids = new Set(campaign.manualCustomerIds ?? [])
    return profiles.filter((p) => ids.has(p.customerId))
  }
  return filterCustomerProfiles(profiles, {
    segment: campaign.audience === 'all' ? 'all' : campaign.audience,
    inactiveDays: campaign.inactiveDays ?? 60,
    productId: campaign.productId ?? 'all',
    storeId:
      campaign.audience === 'store' ? (campaign.storeId ?? 'all') : 'all',
    minSpendTTC: campaign.minSpendTTC ?? 0,
    minFrequency: campaign.minFrequency ?? 0,
    query: '',
  })
}

export function campaignProgress(campaign: WhatsAppCampaign): {
  pct: number
  remaining: number
} {
  const total = campaign.targetedCount
  if (total <= 0) return { pct: 0, remaining: 0 }
  const done = campaign.sentCount + campaign.failedCount
  return {
    pct: Math.round((done / total) * 1000) / 10,
    remaining: Math.max(0, total - done),
  }
}

export function campaignResultSummary(messages: WhatsAppCampaignMessage[]): {
  pending: number
  sent: number
  failed: number
  skipped: number
  opened: number
  openRatePct: number | null
} {
  const pending = messages.filter((m) => m.status === 'pending').length
  const sent = messages.filter((m) => m.status === 'sent').length
  const failed = messages.filter((m) => m.status === 'failed').length
  const skipped = messages.filter((m) => m.status === 'skipped').length
  const opened = messages.filter((m) => m.openedAt != null).length
  return {
    pending,
    sent,
    failed,
    skipped,
    opened,
    openRatePct:
      sent > 0 ? Math.round((opened / sent) * 1000) / 10 : null,
  }
}
