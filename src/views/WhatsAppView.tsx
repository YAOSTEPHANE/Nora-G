import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type {
  WhatsAppCampaign,
  WhatsAppCampaignKind,
  WhatsAppCampaignMessage,
} from '../db/types'
import { buildCustomerProfiles } from '../lib/customerSegmentation'
import { productIsActive } from '../lib/productFilters'
import {
  campaignProgress,
  campaignResultSummary,
  personalizeWhatsAppMessage,
  resolveCampaignAudience,
  WHATSAPP_KIND_LABELS,
  WHATSAPP_TEMPLATES,
  whatsappSendHref,
} from '../lib/whatsappCampaigns'
import { measureWhatsAppCampaignCa } from '../lib/marketingCampaigns'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader, SectionHeader } from '../ui/PageHeader'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { IconMail, IconMobile, IconSparkles } from '../ui/icons'
import { cn } from '../ui/cn'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

type TabId = 'campagnes' | 'creer' | 'envoi' | 'suivi'

export function WhatsAppView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId, activeStore } = useActiveStore()
  const [tab, setTab] = useState<TabId>('campagnes')
  const [busy, setBusy] = useState(false)
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null)

  const campaigns =
    useLiveQuery(
      () =>
        db.whatsappCampaigns
          .where('storeId')
          .equals(activeStoreId)
          .reverse()
          .sortBy('createdAt'),
      [activeStoreId],
      [],
    ) ?? []
  const allMessages =
    useLiveQuery(() => db.whatsappCampaignMessages.toArray(), [], []) ?? []
  const customers =
    useLiveQuery(() => db.loyaltyCustomers.toArray(), [], []) ?? []
  const sales = useLiveQuery(() => db.sales.toArray(), [], []) ?? []
  const products = useLiveQuery(() => db.products.toArray(), [], []) ?? []
  const stores =
    useLiveQuery(() => db.stores.orderBy('sortOrder').toArray(), [], []) ?? []
  const vipClients = useLiveQuery(() => db.vipClients.toArray(), [], []) ?? []

  const boutiqueName = activeStore?.name ?? 'la boutique'
  const profiles = useMemo(
    () =>
      buildCustomerProfiles({
        customers,
        sales,
        products,
        stores: stores.filter((s) => !s.archived),
        vipClients,
      }),
    [customers, sales, products, stores, vipClients],
  )

  const sortedCampaigns = useMemo(
    () => [...campaigns].sort((a, b) => b.createdAt - a.createdAt),
    [campaigns],
  )

  const activeCampaign =
    sortedCampaigns.find((c) => c.id === activeCampaignId) ??
    sortedCampaigns.find((c) => c.status === 'ready') ??
    null

  const campaignMessages = useMemo(
    () =>
      activeCampaign
        ? allMessages
            .filter((m) => m.campaignId === activeCampaign.id)
            .sort((a, b) => a.createdAt - b.createdAt)
        : [],
    [allMessages, activeCampaign],
  )

  const nextPending = campaignMessages.find((m) => m.status === 'pending')
  const resultSummary = useMemo(
    () => campaignResultSummary(campaignMessages),
    [campaignMessages],
  )

  const caAttribution = useMemo(() => {
    if (!activeCampaign) return null
    return measureWhatsAppCampaignCa({
      campaign: activeCampaign,
      messages: campaignMessages,
      sales,
      profiles,
    })
  }, [activeCampaign, campaignMessages, sales, profiles])

  const totals = useMemo(() => {
    return {
      campaigns: sortedCampaigns.length,
      sent: sortedCampaigns.reduce((s, c) => s + c.sentCount, 0),
      opened: sortedCampaigns.reduce((s, c) => s + c.openedCount, 0),
      ready: sortedCampaigns.filter((c) => c.status === 'ready').length,
    }
  }, [sortedCampaigns])

  // —— Create form ——
  const [name, setName] = useState('')
  const [kind, setKind] = useState<WhatsAppCampaignKind>('reactivation')
  const [template, setTemplate] = useState(
    WHATSAPP_TEMPLATES.reactivation.body,
  )
  const [audience, setAudience] =
    useState<WhatsAppCampaign['audience']>('inactive')
  const [inactiveDays, setInactiveDays] = useState(60)
  const [productId, setProductId] = useState('')
  const [minSpend, setMinSpend] = useState('100000')
  const [minFreq, setMinFreq] = useState('2')
  const [promoCode, setPromoCode] = useState('')
  const [attrDays, setAttrDays] = useState('14')

  const previewAudience = useMemo(() => {
    const draft: Pick<
      WhatsAppCampaign,
      | 'audience'
      | 'inactiveDays'
      | 'productId'
      | 'minSpendTTC'
      | 'minFrequency'
      | 'manualCustomerIds'
      | 'storeId'
    > = {
      audience,
      inactiveDays,
      productId: productId || undefined,
      minSpendTTC: Number(minSpend.replace(/\s/g, '')) || 0,
      minFrequency: Number(minFreq.replace(',', '.')) || 0,
      storeId: activeStoreId,
    }
    return resolveCampaignAudience(draft, profiles)
  }, [
    audience,
    inactiveDays,
    productId,
    minSpend,
    minFreq,
    activeStoreId,
    profiles,
  ])

  const previewBody = useMemo(() => {
    const sample = previewAudience[0] ?? profiles[0]
    if (!sample) return template
    return personalizeWhatsAppMessage(template, sample, boutiqueName)
  }, [template, previewAudience, profiles, boutiqueName])

  const applyKindTemplate = (k: WhatsAppCampaignKind) => {
    setKind(k)
    setTemplate(WHATSAPP_TEMPLATES[k].body)
    if (!name.trim()) setName(WHATSAPP_TEMPLATES[k].name)
    if (k === 'reactivation') setAudience('inactive')
    if (k === 'promo') setAudience('all')
    if (k === 'invitation') setAudience('vip')
    if (k === 'relance') setAudience('frequency')
  }

  const createCampaign = async () => {
    if (!canManage) return
    if (!name.trim()) return toast.error('Nom de campagne requis')
    if (!template.trim()) return toast.error('Message requis')
    if (previewAudience.length === 0) {
      return toast.error(
        'Audience vide',
        'Aucune cliente ne correspond au ciblage.',
      )
    }
    setBusy(true)
    try {
      const now = Date.now()
      const campaignId = crypto.randomUUID()
      const campaign: WhatsAppCampaign = {
        id: campaignId,
        storeId: activeStoreId,
        storeName: activeStore?.name,
        name: name.trim(),
        kind,
        status: 'ready',
        messageTemplate: template.trim(),
        audience,
        inactiveDays:
          audience === 'inactive' ? inactiveDays : undefined,
        productId:
          audience === 'product' && productId ? productId : undefined,
        minSpendTTC:
          audience === 'spend'
            ? Number(minSpend.replace(/\s/g, '')) || 0
            : undefined,
        minFrequency:
          audience === 'frequency'
            ? Number(minFreq.replace(',', '.')) || 0
            : undefined,
        promoCode: promoCode.trim().toUpperCase() || undefined,
        attributionWindowDays: Number.parseInt(attrDays, 10) || 14,
        createdAt: now,
        updatedAt: now,
        createdByProfileId: actor.id,
        createdByDisplayName: actor.displayName,
        targetedCount: previewAudience.length,
        sentCount: 0,
        failedCount: 0,
        openedCount: 0,
      }

      const messages: WhatsAppCampaignMessage[] = previewAudience.map(
        (p) => {
          const body = personalizeWhatsAppMessage(
            campaign.messageTemplate,
            p,
            boutiqueName,
          )
          const digits = p.phone.replace(/\D/g, '')
          const ok = digits.length >= 8
          return {
            id: crypto.randomUUID(),
            campaignId,
            customerId: p.customerId,
            customerName: p.displayName,
            customerPhone: p.phone,
            body,
            status: ok ? 'pending' : 'skipped',
            createdAt: now,
            error: ok ? undefined : 'Numéro invalide',
          }
        },
      )

      await db.transaction(
        'rw',
        db.whatsappCampaigns,
        db.whatsappCampaignMessages,
        async () => {
          await db.whatsappCampaigns.add(campaign)
          await db.whatsappCampaignMessages.bulkAdd(messages)
        },
      )

      setActiveCampaignId(campaignId)
      setName('')
      setTab('envoi')
      toast.success(
        'Campagne prête',
        `${messages.filter((m) => m.status === 'pending').length} message(s) à envoyer`,
      )
    } finally {
      setBusy(false)
    }
  }

  const refreshCampaignStats = async (campaignId: string) => {
    const campaign = await db.whatsappCampaigns.get(campaignId)
    const msgs = await db.whatsappCampaignMessages
      .where('campaignId')
      .equals(campaignId)
      .toArray()
    const sent = msgs.filter((m) => m.status === 'sent').length
    const failed = msgs.filter((m) => m.status === 'failed').length
    const opened = msgs.filter((m) => m.openedAt != null).length
    const pending = msgs.filter((m) => m.status === 'pending').length
    const allDone = pending === 0
    // Ne jamais réécrire le statut d’une campagne déjà annulée.
    const statusPatch =
      campaign?.status === 'cancelled'
        ? {}
        : allDone
          ? { status: 'completed' as const, completedAt: Date.now() }
          : { status: 'ready' as const }
    await db.whatsappCampaigns.update(campaignId, {
      sentCount: sent,
      failedCount: failed,
      openedCount: opened,
      updatedAt: Date.now(),
      ...statusPatch,
    })
  }

  const openAndMark = async (msg: WhatsAppCampaignMessage) => {
    if (!canManage || !activeCampaign) return
    const href = whatsappSendHref(msg.customerPhone, msg.body)
    if (!href) {
      toast.error('Numéro invalide', msg.customerPhone)
      await db.whatsappCampaignMessages.update(msg.id, {
        status: 'failed',
        error: 'Numéro invalide',
      })
      await refreshCampaignStats(activeCampaign.id)
      return
    }

    window.open(href, '_blank', 'noopener,noreferrer')
    const now = Date.now()
    await db.transaction(
      'rw',
      [
        db.whatsappCampaignMessages,
        db.whatsappCampaigns,
        db.crmInteractions,
      ],
      async () => {
        await db.whatsappCampaignMessages.update(msg.id, {
          status: 'sent',
          sentAt: msg.sentAt ?? now,
          openedAt: now,
        })
        await db.crmInteractions.add({
          id: crypto.randomUUID(),
          createdAt: now,
          customerId: msg.customerId,
          customerPhone: msg.customerPhone,
          customerName: msg.customerName,
          kind: 'whatsapp',
          note: `[Campagne ${activeCampaign.name}] ${msg.body.slice(0, 180)}`,
          actorProfileId: actor.id,
          actorDisplayName: actor.displayName,
        })
      },
    )
    await refreshCampaignStats(activeCampaign.id)
    toast.success('WhatsApp ouvert', msg.customerName)
  }

  const skipMessage = async (msg: WhatsAppCampaignMessage) => {
    if (!canManage || !activeCampaign || msg.status !== 'pending') return
    await db.whatsappCampaignMessages.update(msg.id, {
      status: 'skipped',
      error: 'Ignoré',
    })
    await refreshCampaignStats(activeCampaign.id)
  }

  const cancelCampaign = async (c: WhatsAppCampaign) => {
    if (!canManage) return
    await db.whatsappCampaigns.update(c.id, {
      status: 'cancelled',
      updatedAt: Date.now(),
    })
    toast.info('Campagne annulée', c.name)
  }

  const activeProducts = useMemo(
    () =>
      products
        .filter(productIsActive)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [products],
  )

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconMobile />}
        eyebrow={`Boutique · ${activeStore?.name ?? '—'}`}
        title="WhatsApp"
        subtitle="Campagnes ciblées, messages personnalisés, relances et suivi des résultats"
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Campagnes" value={String(totals.campaigns)} tone="accent" />
        <Kpi label="Prêtes / en cours" value={String(totals.ready)} tone="amber" />
        <Kpi label="Messages envoyés" value={String(totals.sent)} tone="violet" />
        <Kpi
          label="Ouvertures WA"
          value={String(totals.opened)}
          hint="Clics vers WhatsApp"
          tone="sky"
        />
      </div>

      <Tabs
        variant="segmented"
        active={tab}
        onChange={setTab}
        items={[
          {
            id: 'campagnes',
            label: 'Campagnes',
            count: sortedCampaigns.length || undefined,
          },
          { id: 'creer', label: 'Créer' },
          { id: 'envoi', label: 'Envoi' },
          { id: 'suivi', label: 'Résultats' },
        ]}
      />

      {tab === 'campagnes' ? (
        <div className="space-y-4">
          <SectionHeader
            title="Campagnes WhatsApp"
            subtitle="Relances, invitations, réactivation et promotions"
          />
          {sortedCampaigns.length === 0 ? (
            <EmptyState
              title="Aucune campagne"
              description="Créez une campagne ciblée à partir de la segmentation clientes."
            />
          ) : (
            <ul className="space-y-3">
              {sortedCampaigns.map((c) => {
                const prog = campaignProgress(c)
                return (
                  <li
                    key={c.id}
                    className="rounded-xl border border-border bg-white p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink">{c.name}</p>
                        <p className="text-[11px] text-ink-muted">
                          {WHATSAPP_KIND_LABELS[c.kind]} · audience{' '}
                          {c.audience} · {c.targetedCount} destinatrices
                        </p>
                      </div>
                      <Badge
                        tone={
                          c.status === 'completed'
                            ? 'success'
                            : c.status === 'cancelled'
                              ? 'danger'
                              : c.status === 'ready'
                                ? 'info'
                                : 'neutral'
                        }
                      >
                        {c.status === 'ready'
                          ? 'Prête'
                          : c.status === 'completed'
                            ? 'Terminée'
                            : c.status === 'cancelled'
                              ? 'Annulée'
                              : 'Brouillon'}
                      </Badge>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.min(100, prog.pct)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-ink-muted">
                      Envoyés {c.sentCount}/{c.targetedCount} · Ouverts{' '}
                      {c.openedCount} · Échecs {c.failedCount}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="accent"
                        onClick={() => {
                          setActiveCampaignId(c.id)
                          setTab('envoi')
                        }}
                      >
                        Ouvrir l’envoi
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setActiveCampaignId(c.id)
                          setTab('suivi')
                        }}
                      >
                        Résultats
                      </Button>
                      {canManage && c.status === 'ready' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void cancelCampaign(c)}
                        >
                          Annuler
                        </Button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'creer' ? (
        <div className="space-y-4">
          {!canManage ? (
            <EmptyState
              title="Création réservée"
              description="Gérant ou administrateur uniquement."
            />
          ) : (
            <FormPanel
              eyebrow="Nouvelle campagne"
              title="Ciblage & message personnalisé"
              description="Variables : {{prenom}} {{nom}} {{points}} {{depense}} {{panier}} {{boutique}}"
              actions={
                <Button
                  variant="accent"
                  loading={busy}
                  iconLeft={<IconSparkles />}
                  onClick={() => void createCampaign()}
                >
                  Créer ({previewAudience.length})
                </Button>
              }
            >
              <div className="mb-3 flex flex-wrap gap-2">
                {(
                  Object.keys(WHATSAPP_KIND_LABELS) as WhatsAppCampaignKind[]
                ).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    variant={kind === k ? 'accent' : 'ghost'}
                    onClick={() => applyKindTemplate(k)}
                  >
                    {WHATSAPP_KIND_LABELS[k]}
                  </Button>
                ))}
              </div>
              <FormGrid columns={2}>
                <Field label="Nom de la campagne" required>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ex. Réactivation mars"
                  />
                </Field>
                <Field label="Audience">
                  <Select
                    value={audience}
                    onChange={(e) =>
                      setAudience(
                        e.target.value as WhatsAppCampaign['audience'],
                      )
                    }
                  >
                    <option value="all">Toutes les clientes</option>
                    <option value="vip">VIP</option>
                    <option value="inactive">Inactives</option>
                    <option value="product">Ont acheté un produit</option>
                    <option value="store">Cette boutique</option>
                    <option value="spend">Montant dépensé min.</option>
                    <option value="frequency">Fréquence d’achat</option>
                  </Select>
                </Field>
              </FormGrid>

              {audience === 'inactive' ? (
                <Field label="Inactives depuis (jours)" className="mt-3 sm:w-48">
                  <Select
                    value={String(inactiveDays)}
                    onChange={(e) => setInactiveDays(Number(e.target.value))}
                  >
                    <option value="30">30</option>
                    <option value="60">60</option>
                    <option value="90">90</option>
                    <option value="180">180</option>
                  </Select>
                </Field>
              ) : null}
              {audience === 'product' ? (
                <Field label="Produit" className="mt-3">
                  <Select
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                  >
                    <option value="">— Choisir —</option>
                    {activeProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              {audience === 'spend' ? (
                <Field label="Dépensé min. TTC" className="mt-3 sm:w-48">
                  <Input
                    value={minSpend}
                    onChange={(e) => setMinSpend(e.target.value)}
                    className="font-mono-nums"
                  />
                </Field>
              ) : null}
              {audience === 'frequency' ? (
                <Field label="Fréq. min. / mois" className="mt-3 sm:w-40">
                  <Input
                    value={minFreq}
                    onChange={(e) => setMinFreq(e.target.value)}
                    className="font-mono-nums"
                  />
                </Field>
              ) : null}

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Code promo (mesure CA)">
                  <Input
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="Optionnel · ex. WA15"
                  />
                </Field>
                <Field label="Fenêtre attribution (jours)">
                  <Input
                    value={attrDays}
                    onChange={(e) => setAttrDays(e.target.value)}
                    inputMode="numeric"
                  />
                </Field>
              </div>

              <p className="mt-3 text-[12px] text-ink-muted">
                {previewAudience.length} cliente(s) ciblée(s)
              </p>

              <Field label="Message" className="mt-3" required>
                <Textarea
                  rows={8}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                />
              </Field>
              <div className="mt-3 rounded-lg border border-border/70 bg-zinc-50/80 p-3 text-[12px]">
                <p className="mb-1 font-semibold text-ink">Aperçu personnalisé</p>
                <pre className="whitespace-pre-wrap font-sans text-ink-muted">
                  {previewBody}
                </pre>
              </div>
            </FormPanel>
          )}
        </div>
      ) : null}

      {tab === 'envoi' ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeader
              title="Envoi message par message"
              subtitle="Ouvre WhatsApp Web / appli avec le texte déjà personnalisé"
            />
            <Field label="Campagne active" className="sm:w-64">
              <Select
                value={activeCampaign?.id ?? ''}
                onChange={(e) => setActiveCampaignId(e.target.value || null)}
              >
                <option value="">— Choisir —</option>
                {sortedCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.status})
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {!activeCampaign ? (
            <EmptyState
              title="Sélectionnez une campagne"
              description="Ou créez-en une nouvelle."
            />
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-4">
                <Kpi
                  label="Restants"
                  value={String(resultSummary.pending)}
                  tone="amber"
                />
                <Kpi
                  label="Envoyés"
                  value={String(resultSummary.sent)}
                  tone="accent"
                />
                <Kpi
                  label="Ouverts"
                  value={String(resultSummary.opened)}
                  tone="sky"
                />
                <Kpi
                  label="Taux ouverture"
                  value={
                    resultSummary.openRatePct != null
                      ? `${resultSummary.openRatePct} %`
                      : '—'
                  }
                  tone="violet"
                />
              </div>

              {nextPending && canManage ? (
                <div className="rounded-xl border border-[#25D366]/40 bg-[#25D366]/5 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <IconMobile className="h-4 w-4 text-[#128C7E]" />
                    <p className="text-[14px] font-semibold text-ink">
                      Prochaine : {nextPending.customerName}
                    </p>
                  </div>
                  <p className="font-mono-nums text-[11px] text-ink-muted">
                    {nextPending.customerPhone}
                  </p>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-white/80 p-3 text-[12px] text-ink-muted">
                    {nextPending.body}
                  </pre>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="accent"
                      onClick={() => void openAndMark(nextPending)}
                    >
                      Ouvrir WhatsApp & marquer envoyé
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => void skipMessage(nextPending)}
                    >
                      Ignorer
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title={
                    resultSummary.pending === 0
                      ? 'File d’envoi terminée'
                      : 'Lecture seule'
                  }
                  description={
                    resultSummary.pending === 0
                      ? 'Consultez l’onglet Résultats.'
                      : undefined
                  }
                  variant="flat"
                />
              )}

              <SectionHeader title="File d’attente" />
              <ul className="divide-y divide-border rounded-xl border border-border bg-white">
                {campaignMessages.slice(0, 40).map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[13px]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{m.customerName}</p>
                      <p className="truncate text-[11px] text-ink-muted">
                        {m.customerPhone} · {m.body.slice(0, 60)}…
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          m.status === 'sent'
                            ? 'success'
                            : m.status === 'pending'
                              ? 'warning'
                              : m.status === 'failed'
                                ? 'danger'
                                : 'neutral'
                        }
                      >
                        {m.status === 'sent'
                          ? 'Envoyé'
                          : m.status === 'pending'
                            ? 'En attente'
                            : m.status === 'failed'
                              ? 'Échec'
                              : 'Ignoré'}
                      </Badge>
                      {canManage && m.status === 'pending' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void openAndMark(m)}
                        >
                          Envoyer
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}

      {tab === 'suivi' ? (
        <div className="space-y-4">
          <SectionHeader
            title="Suivi des résultats"
            subtitle="Envois, ouvertures WhatsApp et interactions CRM journalisées"
          />
          {!activeCampaign ? (
            <EmptyState title="Choisissez une campagne dans Envoi" />
          ) : (
            <>
              <div className="rounded-xl border border-border bg-white p-4">
                <p className="text-[14px] font-semibold text-ink">
                  {activeCampaign.name}
                </p>
                <p className="text-[12px] text-ink-muted">
                  {WHATSAPP_KIND_LABELS[activeCampaign.kind]} · créée le{' '}
                  {new Date(activeCampaign.createdAt).toLocaleString('fr-FR')}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <Stat
                    label="Ciblées"
                    value={String(activeCampaign.targetedCount)}
                  />
                  <Stat
                    label="Envoyés"
                    value={String(resultSummary.sent)}
                  />
                  <Stat
                    label="Ouverts"
                    value={String(resultSummary.opened)}
                  />
                  <Stat
                    label="Taux ouverture"
                    value={
                      resultSummary.openRatePct != null
                        ? `${resultSummary.openRatePct} %`
                        : '—'
                    }
                  />
                  <Stat
                    label="Échecs / ignorés"
                    value={`${resultSummary.failed} / ${resultSummary.skipped}`}
                  />
                </div>
                {caAttribution ? (
                  <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-3">
                    <Stat
                      label="CA attribué"
                      value={`${caAttribution.attributedCaTTC.toLocaleString('fr-FR')} FCFA`}
                    />
                    <Stat
                      label="CA code promo"
                      value={`${caAttribution.promoCaTTC.toLocaleString('fr-FR')} FCFA`}
                    />
                    <Stat
                      label="Ventes attribuées"
                      value={String(caAttribution.attributedSalesCount)}
                    />
                  </div>
                ) : null}
              </div>

              <ul className="divide-y divide-border rounded-xl border border-border bg-white">
                {campaignMessages.map((m) => (
                  <li
                    key={m.id}
                    className={cn(
                      'px-3 py-2.5 text-[13px]',
                      m.status === 'sent' && 'bg-emerald-50/40',
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-ink">{m.customerName}</p>
                        <p className="text-[11px] text-ink-muted">
                          {m.sentAt
                            ? `Envoyé ${new Date(m.sentAt).toLocaleString('fr-FR')}`
                            : m.error ?? '—'}
                          {m.openedAt
                            ? ` · Ouvert ${new Date(m.openedAt).toLocaleString('fr-FR')}`
                            : ''}
                        </p>
                      </div>
                      <Badge
                        tone={
                          m.status === 'sent'
                            ? 'success'
                            : m.status === 'failed'
                              ? 'danger'
                              : 'neutral'
                        }
                      >
                        {m.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="flex items-start gap-2 text-[11px] text-ink-subtle">
            <IconMail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Chaque envoi crée aussi une interaction CRM (kind WhatsApp) pour
            l’historique cliente.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-2.5 py-2">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="font-mono-nums text-[15px] font-semibold text-zinc-900">
        {value}
      </p>
    </div>
  )
}
