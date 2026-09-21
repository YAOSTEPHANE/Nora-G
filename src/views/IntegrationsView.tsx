import { useCallback, useMemo, useState } from 'react'
import {
  getConnectedPlatformsDemo,
  getDeviceConnectivityDemo,
  getDeliveryProviderDemo,
  getDeliveryWebhookDemo,
  getKitchenStationDemo,
  getOnlineSyncModeDemo,
  getOrCreateDemoApiKey,
  isComptaModuleDemoOn,
  isDeliveryModuleDemoOn,
  isKitchenModuleDemoOn,
  isEcomModuleDemoOn,
  setConnectedPlatformsDemo,
  setDeviceConnectivityDemo,
  setComptaModuleDemo,
  setOnlineSyncModeDemo,
  setDeliveryModuleDemo,
  setDeliveryProviderDemo,
  setDeliveryWebhookDemo,
  setKitchenModuleDemo,
  setKitchenStationDemo,
  setEcomModuleDemo,
} from '../lib/integrationsConfig'
import { OrgPaymentProvidersPanel } from '../components/OrgPaymentProvidersPanel'
import { apiUrl } from '../lib/apiUrl'
import { getOrganizationCredentials } from '../lib/subscription/store'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { PageHeader } from '../ui/PageHeader'
import { Switch } from '../ui/Switch'
import { Field, Input, Select } from '../ui/Input'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import {
  IconCheck,
  IconIntegrations,
  IconKey,
  IconMobile,
  IconSpreadsheet,
  IconTag,
  IconTruck,
  IconFile,
} from '../ui/icons'

type TabId = 'paiements' | 'marketplace' | 'api' | 'mobile'

const PARTNERS = [
  {
    name: 'Mobile money Côte d’Ivoire',
    desc: 'Wave, Orange Money, MTN MoMo, Moov Money — FCFA (XOF), caisse et boutique en ligne.',
  },
  {
    name: 'Transport & livraison',
    desc: 'Webhooks commande → partenaire logistique (API REST).',
  },
  {
    name: 'ERP / compta tiers',
    desc: 'Export FEC, écritures ventes, synchronisation plan comptable.',
  },
] as const

// IconPlug : non exporté par lucide-react sous ce nom dans toutes les versions ; alias secours.
function IconPlug({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 2v6" />
      <path d="M15 2v6" />
      <path d="M5 8h14" />
      <path d="M7 8v3a5 5 0 0 0 10 0V8" />
      <path d="M12 16v6" />
    </svg>
  )
}

export function IntegrationsView() {
  const toast = useToast()
  const [tab, setTab] = useState<TabId>('paiements')
  const licenseKey = getOrganizationCredentials()?.licenseKey ?? null
  const [apiKey] = useState(() => getOrCreateDemoApiKey())
  const [comptaOn, setComptaOn] = useState(() => isComptaModuleDemoOn())
  const [ecomOn, setEcomOn] = useState(() => isEcomModuleDemoOn())
  const [deliveryOn, setDeliveryOn] = useState(() => isDeliveryModuleDemoOn())
  const [deliveryProvider, setDeliveryProvider] = useState(() =>
    getDeliveryProviderDemo(),
  )
  const [deliveryWebhook, setDeliveryWebhook] = useState(() =>
    getDeliveryWebhookDemo(),
  )
  const [kitchenOn, setKitchenOn] = useState(() => isKitchenModuleDemoOn())
  const [kitchenStation, setKitchenStation] = useState(() =>
    getKitchenStationDemo(),
  )
  const [connectedPlatforms, setConnectedPlatforms] = useState(() =>
    getConnectedPlatformsDemo(),
  )
  const [onlineSyncMode, setOnlineSyncMode] = useState<'webhook' | 'pull'>(() =>
    getOnlineSyncModeDemo(),
  )
  const [deviceConnectivity, setDeviceConnectivity] = useState(() =>
    getDeviceConnectivityDemo(),
  )

  const webhookUrl = useMemo(() => apiUrl('/webhooks/nora'), [])

  const copyKey = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(apiKey)
      toast.success('Clé API copiée')
    } catch {
      toast.error('Copie impossible', 'Sélectionnez la clé manuellement.')
    }
  }, [apiKey, toast])

  const tabs = useMemo(
    () => [
      { id: 'paiements' as const, label: 'Wave & Orange' },
      { id: 'marketplace' as const, label: 'Marketplace' },
      { id: 'api' as const, label: 'API partenaires' },
      { id: 'mobile' as const, label: 'App mobile' },
    ],
    [],
  )

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconIntegrations />}
        eyebrow="Écosystème"
        title="Connexions"
        subtitle="Paiements boutique, modules métiers, API et application mobile"
      />

      <Tabs items={tabs} active={tab} onChange={setTab} />

      {tab === 'paiements' ? (
        licenseKey ? (
          <OrgPaymentProvidersPanel licenseKey={licenseKey} />
        ) : (
          <Card>
            <CardContent className="space-y-2 py-8 text-center">
              <p className="text-[14px] font-semibold text-zinc-900">
                Abonnement requis
              </p>
              <p className="text-[13px] text-zinc-500">
                Connectez votre licence (menu Abonnement) pour configurer les clés
                Wave et Orange Money de votre boutique.
              </p>
            </CardContent>
          </Card>
        )
      ) : null}

      {tab === 'marketplace' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card hover>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge tone="violet">Comptabilité</Badge>
                  <h3 className="mt-2 text-[15px] font-semibold text-zinc-900">
                    Module Compta & fiscalité
                  </h3>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                  <IconSpreadsheet className="h-4 w-4" />
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-zinc-600">
                Export des ventes (journal, TVA), rapprochement caisse, formats
                d’échange comptable (FEC, CSV).
              </p>
              <ul className="space-y-1 text-[12px] text-zinc-500">
                <li>· Écritures automatiques par session / jour</li>
                <li>· Multi-caisses / multi-magasins (schéma API)</li>
              </ul>
              <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
                <span className="text-[12px] font-medium text-zinc-700">
                  Mode démo local
                </span>
                <Switch
                  checked={comptaOn}
                  onChange={(e) => {
                    const v = e.target.checked
                    setComptaModuleDemo(v)
                    setComptaOn(v)
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card hover>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge tone="info">E-commerce</Badge>
                  <h3 className="mt-2 text-[15px] font-semibold text-zinc-900">
                    Commandes web
                  </h3>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                  <IconTag className="h-4 w-4" />
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-zinc-600">
                Synchronisation bidirectionnelle catalogue / stocks, import de
                commandes web, étiquettes d’expédition.
              </p>
              <ul className="space-y-1 text-[12px] text-zinc-500">
                <li>· Webhooks « commande payée »</li>
                <li>· Réserve stock temps réel</li>
              </ul>
              <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
                <span className="text-[12px] font-medium text-zinc-700">
                  Intérêt e-commerce
                </span>
                <Switch
                  checked={ecomOn}
                  onChange={(e) => {
                    const v = e.target.checked
                    setEcomModuleDemo(v)
                    setEcomOn(v)
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-dashed bg-zinc-50/50 lg:col-span-2">
            <CardContent>
              <h3 className="text-[14px] font-semibold text-zinc-800">
                Bientôt disponibles
              </h3>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[
                  'Fidélité & cartes cadeaux',
                  'Achats fournisseurs',
                  'Étiquettes & codes-barres avancés',
                  'Multi-devises régionales',
                ].map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium text-zinc-600"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === 'api' ? (
        <div className="space-y-4">
          <Card>
            <CardContent>
              <div className="mb-3 flex items-center gap-2">
                <IconKey className="h-4 w-4 text-zinc-500" />
                <h3 className="text-[14px] font-semibold text-zinc-900">
                  Clé API partenaire (démo)
                </h3>
              </div>
              <p className="mb-3 text-[12px] text-zinc-500">
                En production : rotation, scopes par intégration, audit des
                appels.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="ui-card-flat min-w-0 flex-1 truncate rounded-lg px-3 py-2 font-mono-nums text-[12px] text-zinc-700">
                  {apiKey}
                </code>
                <Button variant="primary" onClick={() => void copyKey()}>
                  Copier
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <div className="mb-1 flex items-center gap-2">
                <IconIntegrations className="h-4 w-4 text-zinc-500" />
                <h3 className="text-[14px] font-semibold text-zinc-900">
                  Connexions plateformes commandes
                </h3>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { id: 'shopify', label: 'Shopify' },
                  { id: 'glovo', label: 'Glovo' },
                  { id: 'ubereats', label: 'Uber Eats' },
                  { id: 'jumia', label: 'Jumia Food' },
                  { id: 'whatsapp', label: 'WhatsApp Business' },
                ].map((p) => {
                  const active = connectedPlatforms.includes(
                    p.id as (typeof connectedPlatforms)[number],
                  )
                  return (
                    <label
                      key={p.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-100 p-2.5"
                    >
                      <span className="text-[12px] font-medium text-zinc-700">{p.label}</span>
                      <Switch
                        checked={active}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...new Set([...connectedPlatforms, p.id as (typeof connectedPlatforms)[number]])]
                            : connectedPlatforms.filter((x) => x !== p.id)
                          setConnectedPlatforms(next)
                          setConnectedPlatformsDemo(next)
                        }}
                      />
                    </label>
                  )
                })}
              </div>
              <Field label="Mode de synchronisation commandes">
                <Select
                  value={onlineSyncMode}
                  onChange={(e) => {
                    const mode = e.target.value as 'webhook' | 'pull'
                    setOnlineSyncMode(mode)
                    setOnlineSyncModeDemo(mode)
                  }}
                >
                  <option value="webhook">Webhook temps réel</option>
                  <option value="pull">Pull planifié</option>
                </Select>
              </Field>
              <p className="text-[11px] text-zinc-500">
                Les plateformes actives alimentent le module « Commandes » avec import distant et suivi livraison.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <div className="mb-1 flex items-center gap-2">
                <IconIntegrations className="h-4 w-4 text-zinc-500" />
                <h3 className="text-[14px] font-semibold text-zinc-900">
                  Équipements de caisse
                </h3>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  {
                    key: 'orderTerminals' as const,
                    label:
                      'Terminaux de prise de commande (tablette, POS tactile, borne)',
                  },
                  { key: 'receiptPrinters' as const, label: 'Imprimantes tickets' },
                  { key: 'kitchenScreens' as const, label: 'Écrans cuisine (KDS)' },
                  { key: 'cashDrawer' as const, label: 'Tiroir-caisse' },
                  {
                    key: 'paymentTerminals' as const,
                    label: 'Terminaux de paiement',
                  },
                ].map((device) => (
                  <label
                    key={device.key}
                    className="flex items-center justify-between rounded-lg border border-zinc-100 p-2.5"
                  >
                    <span className="pr-2 text-[12px] font-medium text-zinc-700">
                      {device.label}
                    </span>
                    <Switch
                      checked={deviceConnectivity[device.key]}
                      onChange={(e) => {
                        const next = {
                          ...deviceConnectivity,
                          [device.key]: e.target.checked,
                        }
                        setDeviceConnectivity(next)
                        setDeviceConnectivityDemo(next)
                      }}
                    />
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-zinc-500">
                Active les équipements présents en boutique pour préparer le
                couplage matériel (USB, réseau local, Bluetooth ou cloud).
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <div className="mb-1 flex items-center gap-2">
                <IconTruck className="h-4 w-4 text-zinc-500" />
                <h3 className="text-[14px] font-semibold text-zinc-900">
                  Intégration livraison
                </h3>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-zinc-100 p-2.5">
                <span className="text-[12px] font-medium text-zinc-700">
                  Connecteur logistique actif
                </span>
                <Switch
                  checked={deliveryOn}
                  onChange={(e) => {
                    const v = e.target.checked
                    setDeliveryOn(v)
                    setDeliveryModuleDemo(v)
                  }}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Prestataire">
                  <Select
                    value={deliveryProvider}
                    onChange={(e) => {
                      setDeliveryProvider(e.target.value)
                      setDeliveryProviderDemo(e.target.value)
                    }}
                  >
                    <option value="Coursier interne">Coursier interne</option>
                    <option value="Yango Delivery">Yango Delivery</option>
                    <option value="Glovo">Glovo</option>
                    <option value="Uber Direct">Uber Direct</option>
                  </Select>
                </Field>
                <Field label="Webhook sortant livraison">
                  <Input
                    value={deliveryWebhook}
                    onChange={(e) => {
                      setDeliveryWebhook(e.target.value)
                      setDeliveryWebhookDemo(e.target.value)
                    }}
                    placeholder="https://partner.example.com/webhooks/orders"
                  />
                </Field>
              </div>
              <p className="text-[11px] text-zinc-500">
                Les commandes livraison validées pourront être suivies avec
                statuts, livreur et code de tracking.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <div className="mb-1 flex items-center gap-2">
                <IconFile className="h-4 w-4 text-zinc-500" />
                <h3 className="text-[14px] font-semibold text-zinc-900">
                  Intégration cuisine
                </h3>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-zinc-100 p-2.5">
                <span className="text-[12px] font-medium text-zinc-700">
                  Kitchen display / tickets actifs
                </span>
                <Switch
                  checked={kitchenOn}
                  onChange={(e) => {
                    const v = e.target.checked
                    setKitchenOn(v)
                    setKitchenModuleDemo(v)
                  }}
                />
              </div>
              <Field label="Station cuisine">
                <Input
                  value={kitchenStation}
                  onChange={(e) => {
                    setKitchenStation(e.target.value)
                    setKitchenStationDemo(e.target.value)
                  }}
                  placeholder="Cuisine principale"
                />
              </Field>
              <p className="text-[11px] text-zinc-500">
                Les commandes validées seront routées vers la station cuisine
                avec suivi: en file, en préparation, prêt, servi.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="mb-3 flex items-center gap-2">
                <IconPlug className="h-4 w-4 text-zinc-500" />
                <h3 className="text-[14px] font-semibold text-zinc-900">
                  Webhook entrant
                </h3>
              </div>
              <p className="mb-3 text-[12px] text-zinc-500">
                URL à configurer chez le partenaire.
              </p>
              <code className="ui-card-flat block break-all rounded-lg px-3 py-2 font-mono-nums text-[12px] text-zinc-700">
                POST {webhookUrl}
              </code>
              <code className="ui-card-flat mt-2 block break-all rounded-lg px-3 py-2 font-mono-nums text-[12px] text-zinc-700">
                POST {webhookUrl.replace('/nora', '/orders')} (x-platform + x-webhook-token)
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h3 className="mb-3 text-[14px] font-semibold text-zinc-900">
                Connecteurs & partenaires
              </h3>
              <ul className="space-y-2">
                {PARTNERS.map((p) => (
                  <li
                    key={p.name}
                    className="flex gap-3 rounded-lg border border-zinc-100 p-3"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                      <IconTruck className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-zinc-900">
                        {p.name}
                      </p>
                      <p className="mt-0.5 text-[12px] text-zinc-600">
                        {p.desc}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === 'mobile' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardContent>
              <div className="mb-3 flex items-center gap-2">
                <IconMobile className="h-4 w-4 text-zinc-500" />
                <h3 className="text-[14px] font-semibold text-zinc-900">
                  Application mobile — Gérant
                </h3>
              </div>
              <p className="text-[13px] leading-relaxed text-zinc-600">
                Companion iOS &amp; Android pour le responsable magasin : suivre
                le chiffre du jour, valider remises, recevoir alertes rupture.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone="neutral">App Store — bientôt</Badge>
                <Badge tone="neutral">Google Play — bientôt</Badge>
              </div>
              <div className="mt-4 rounded-lg border border-dashed border-emerald-200 bg-emerald-50/40 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  Schéma d’URL universel
                </p>
                <code className="mt-1 block font-mono-nums text-[12px] text-emerald-800">
                  nora-manager://boutique/SESSION?token=…
                </code>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="mb-3 flex items-center gap-2">
                <IconIntegrations className="h-4 w-4 text-zinc-500" />
                <h3 className="text-[14px] font-semibold text-zinc-900">
                  Fonctions prévues
                </h3>
              </div>
              <ul className="space-y-2 text-[13px] text-zinc-700">
                {[
                  'Tableau de bord temps réel (CA, tickets, paiements)',
                  'Notifications push rupture & seuils',
                  'Validation workflow remises (PIN gérant)',
                  'État file synchronisation cloud & retry manuel',
                  'Authentification alignée sur les profils Nora',
                ].map((it) => (
                  <li key={it} className="flex items-start gap-2">
                    <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {comptaOn ? (
        <Card>
          <CardContent className="flex items-start gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <IconSpreadsheet className="h-4 w-4" />
            </span>
            <p className="text-[12px] text-zinc-700">
              <strong>Module compta (démo)</strong> activé : en production, un
              menu « Exports comptables » apparaîtrait ici et dans le rapport
              journalier.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
