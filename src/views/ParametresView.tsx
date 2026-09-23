import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BUSINESS_DOMAINS,
  type BusinessDomain,
} from '../lib/businessDomain'
import {
  getAppSettings,
  resetAppSettings,
  saveAppSettings,
  type AppSettings,
} from '../lib/appSettings'
import { VIEW_LABELS } from '../navigation'
import {
  ensureAllLocationStockRows,
  ensureAllStoreStockRows,
  ensureDomainProductCategories,
  ensureDomainSampleProductsIfEmpty,
  ensureDomainStocksConcordant,
  ensureSeed,
  loadTestData,
  migrateProductBusinessDomains,
  syncProductCategoriesFromProducts,
  wipeLocalBusinessData,
} from '../db/db'
import {
  setAppliedLocalWipeAt,
  setStoredForceClientWipeAt,
} from '../lib/clientDataWipe'
import { resetOrganizationData } from '../lib/subscription/api'
import { getOrganizationCredentials } from '../lib/subscription/store'
import {
  getDeviceConnectivityDemo,
  getDeliveryProviderDemo,
  getKitchenStationDemo,
  isComptaModuleDemoOn,
  isDeliveryModuleDemoOn,
  isKitchenModuleDemoOn,
  setComptaModuleDemo,
  setDeliveryModuleDemo,
  setDeliveryProviderDemo,
  setDeviceConnectivityDemo,
  setKitchenModuleDemo,
  setKitchenStationDemo,
  type DeviceConnectivityDemo,
} from '../lib/integrationsConfig'
import {
  CASH_DRAWER_WINDOWS_HINT,
  kickCashDrawer,
  printToplinkTestPage,
} from '../lib/printer/printReceipt'
import {
  connectToplinkPrinter,
  disconnectToplinkPrinter,
  getToplinkPrinterMeta,
  isToplinkPrinterLinked,
  isWebSerialSupported,
  reconnectToplinkPrinter,
  type ToplinkPrinterMeta,
} from '../lib/printer/toplinkSerial'
import {
  getOrCreateTerminalId,
  getTerminalLabel,
  setTerminalLabel,
} from '../lib/session'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { FormSwitchRow } from '../ui/Form'
import { Field, Input, Select } from '../ui/Input'
import { PageHeader } from '../ui/PageHeader'
import { Switch } from '../ui/Switch'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { IconSettings, IconStore } from '../ui/icons'
import { ProductFormSectionsAdmin } from '../components/ProductFormSectionsAdmin'
import { ensureDefaultProductFormSections } from '../lib/productFormSections'

type TabId =
  | 'general'
  | 'caisse'
  | 'service'
  | 'peripheriques'
  | 'modules'
  | 'formulaires'

type Props = {
  activeStoreId: string
  activeStoreName: string
  canManageIntegrations: boolean
  canResetData?: boolean
  organizationName?: string
  onOpenIntegrations?: () => void
}

export function ParametresView({
  activeStoreId,
  activeStoreName,
  canManageIntegrations,
  canResetData = false,
  organizationName = '',
  onOpenIntegrations,
}: Props) {
  const toast = useToast()
  const [tab, setTab] = useState<TabId>('general')
  const [settings, setSettings] = useState<AppSettings>(() => getAppSettings())
  const [terminalLabel, setTerminalLabelState] = useState(() => getTerminalLabel())
  const [kitchenStation, setKitchenStation] = useState(() => getKitchenStationDemo())
  const [deliveryProvider, setDeliveryProvider] = useState(() => getDeliveryProviderDemo())
  const [deviceConnectivity, setDeviceConnectivity] = useState<DeviceConnectivityDemo>(() =>
    getDeviceConnectivityDemo(),
  )
  const [comptaOn, setComptaOn] = useState(() => isComptaModuleDemoOn())
  const [resetConfirmName, setResetConfirmName] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [testDataBusy, setTestDataBusy] = useState(false)
  const [deliveryOn, setDeliveryOn] = useState(() => isDeliveryModuleDemoOn())
  const [kitchenOn, setKitchenOn] = useState(() => isKitchenModuleDemoOn())
  const [printerMeta, setPrinterMeta] = useState<ToplinkPrinterMeta>(() =>
    getToplinkPrinterMeta(),
  )
  const [printerBusy, setPrinterBusy] = useState(false)
  const webSerialOk = isWebSerialSupported()

  const terminalId = useMemo(() => getOrCreateTerminalId(), [])

  useEffect(() => {
    void reconnectToplinkPrinter().then((ok) => {
      if (ok) setPrinterMeta(getToplinkPrinterMeta())
    })
  }, [])

  const tabs = useMemo(
    () => [
      { id: 'general' as const, label: 'Général' },
      { id: 'caisse' as const, label: 'Caisse' },
      { id: 'service' as const, label: 'Service' },
      { id: 'peripheriques' as const, label: 'Périphériques' },
      { id: 'modules' as const, label: 'Modules' },
      { id: 'formulaires' as const, label: 'Formulaires' },
    ],
    [],
  )

  useEffect(() => {
    const reload = () => setSettings(getAppSettings())
    window.addEventListener('nora-app-settings-changed', reload)
    return () => window.removeEventListener('nora-app-settings-changed', reload)
  }, [])

  const patchSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings(saveAppSettings(patch))
  }, [])

  const handleSaveAll = useCallback(() => {
    setTerminalLabel(terminalLabel)
    setKitchenStationDemo(kitchenStation)
    setDeliveryProviderDemo(deliveryProvider)
    setDeviceConnectivityDemo(deviceConnectivity)
    saveAppSettings(settings)
    toast.success('Paramètres enregistrés', 'Les changements sont appliqués sur ce poste.')
  }, [
    deliveryProvider,
    deviceConnectivity,
    kitchenStation,
    settings,
    terminalLabel,
    toast,
  ])

  const handleReset = useCallback(() => {
    const next = resetAppSettings()
    setSettings(next)
    setTerminalLabelState(getTerminalLabel())
    toast.info('Paramètres réinitialisés', 'Valeurs par défaut restaurées.')
  }, [toast])

  const copyTerminalId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(terminalId)
      toast.success('ID terminal copié')
    } catch {
      toast.error('Copie impossible')
    }
  }, [terminalId, toast])

  const canConfirmReset =
    Boolean(organizationName.trim()) &&
    resetConfirmName.trim().toLowerCase() === organizationName.trim().toLowerCase()

  const handleResetAllData = useCallback(async () => {
    if (!canResetData || !canConfirmReset) return
    setResetBusy(true)
    try {
      const result = await resetOrganizationData(resetConfirmName.trim())
      setStoredForceClientWipeAt(result.forceClientWipeAt)
      await wipeLocalBusinessData()
      const orgId = getOrganizationCredentials()?.organizationId
      if (orgId) setAppliedLocalWipeAt(orgId, result.forceClientWipeAt)
      await ensureSeed()
      toast.success(
        'Données réinitialisées',
        'Catalogue, ventes, compta et boutique ont été vidés. Le compte est conservé.',
      )
      window.setTimeout(() => {
        window.location.reload()
      }, 600)
    } catch (err) {
      toast.error(
        'Réinitialisation impossible',
        err instanceof Error ? err.message : 'Réessayez plus tard.',
      )
    } finally {
      setResetBusy(false)
    }
  }, [canConfirmReset, canResetData, resetConfirmName, toast])

  const handleLoadTestData = useCallback(async () => {
    setTestDataBusy(true)
    try {
      await loadTestData()
      toast.success(
        'Données test chargées',
        '18 produits, stocks, cuisine, tables, promos, fidélité et ventes d’exemple.',
      )
      window.setTimeout(() => {
        window.location.reload()
      }, 500)
    } catch (err) {
      toast.error(
        'Chargement impossible',
        err instanceof Error ? err.message : 'Réessayez plus tard.',
      )
    } finally {
      setTestDataBusy(false)
    }
  }, [toast])

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconSettings />}
        eyebrow="Configuration"
        title="Réglages"
        subtitle="Magasin, caisse, cuisine, tables et périphériques de ce poste"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Réinitialiser
            </Button>
            <Button variant="accent" size="sm" onClick={handleSaveAll}>
              Enregistrer
            </Button>
          </div>
        }
      />

      <Tabs items={tabs} active={tab} onChange={setTab} />

      {tab === 'general' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <IconStore className="h-4 w-4 text-ink-subtle" />
                <h3 className="text-[14px] font-semibold text-ink">Magasin actif</h3>
              </div>
              <p className="text-[13px] text-ink-muted">
                <span className="font-medium text-ink">{activeStoreName}</span>
                <span className="text-ink-subtle"> · {activeStoreId}</span>
              </p>
              <p className="text-[12px] text-ink-subtle">
                Le magasin actif se change depuis la barre latérale (si votre rôle le permet).
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <IconSettings className="h-4 w-4 text-ink-subtle" />
                <h3 className="text-[14px] font-semibold text-ink">Terminal</h3>
              </div>
              <Field label="Nom affiché sur les tickets">
                <Input
                  value={terminalLabel}
                  onChange={(e) => setTerminalLabelState(e.target.value)}
                  placeholder="Caisse 1"
                />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-lg bg-surface-sunken px-2 py-1 font-mono-nums text-[12px] text-ink-muted">
                  {terminalId}
                </code>
                <Button size="sm" variant="secondary" onClick={() => void copyTerminalId()}>
                  Copier l’ID
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardContent className="space-y-3">
              <h3 className="text-[14px] font-semibold text-ink">Fiscalité & reçu</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="TVA par défaut (nouveaux articles)">
                  <Input
                    inputMode="decimal"
                    value={String(settings.defaultVatRatePct)}
                    onChange={(e) =>
                      patchSettings({
                        defaultVatRatePct: Number.parseFloat(
                          e.target.value.replace(',', '.'),
                        ),
                      })
                    }
                  />
                </Field>
                <Field label="Message pied de ticket">
                  <Input
                    value={settings.receiptFooterLine}
                    onChange={(e) =>
                      patchSettings({ receiptFooterLine: e.target.value })
                    }
                    placeholder="Merci de votre visite !"
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardContent className="space-y-3">
              <h3 className="text-[14px] font-semibold text-ink">
                Données de test
              </h3>
              <p className="text-[12px] text-mute">
                Charge un catalogue d’exemple (produits, stocks, magasin annexe,
                cuisine, tables, codes promo, clients fidélité et ventes) pour
                explorer l’application.
              </p>
              <Button
                variant="accent"
                size="sm"
                disabled={testDataBusy}
                onClick={() => void handleLoadTestData()}
              >
                {testDataBusy ? 'Chargement…' : 'Charger les données test'}
              </Button>
            </CardContent>
          </Card>

          {canResetData ? (
            <Card className="lg:col-span-2 border-rose-200 bg-rose-50/40">
              <CardContent className="space-y-3">
                <h3 className="text-[14px] font-semibold text-rose-900">
                  Zone dangereuse
                </h3>
                <p className="text-[12px] text-rose-900/80">
                  Réinitialise catalogue, stocks, ventes, comptabilité, tickets,
                  promotions, commandes boutique, personnel caisse et sync.
                  Conservés : compte (email / mot de passe) et licence.
                </p>
                <Field
                  label={`Tapez « ${organizationName} » pour confirmer`}
                >
                  <Input
                    value={resetConfirmName}
                    onChange={(e) => setResetConfirmName(e.target.value)}
                    placeholder={organizationName}
                    disabled={resetBusy}
                    autoComplete="off"
                  />
                </Field>
                <Button
                  variant="danger"
                  disabled={!canConfirmReset || resetBusy}
                  onClick={() => void handleResetAllData()}
                >
                  {resetBusy
                    ? 'Réinitialisation…'
                    : 'Réinitialiser toutes les données'}
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'caisse' ? (
        <Card>
          <CardContent className="space-y-4">
            <h3 className="text-[14px] font-semibold text-ink">Comportement caisse</h3>
            <Field label="Densité grille produits">
              <Select
                value={settings.productGridDensity}
                onChange={(e) =>
                  patchSettings({
                    productGridDensity: e.target.value as AppSettings['productGridDensity'],
                  })
                }
              >
                <option value="compact">Compacte (plus d’articles visibles)</option>
                <option value="confort">Confort (cartes plus grandes)</option>
              </Select>
            </Field>
            <FormSwitchRow
              label="Bloquer la vente si stock à 0"
              hint="Empêche d’ajouter au panier au-delà du stock disponible."
            >
              <Switch
                checked={settings.blockSaleWhenOutOfStock}
                onChange={(e) =>
                  patchSettings({ blockSaleWhenOutOfStock: e.target.checked })
                }
              />
            </FormSwitchRow>
            <FormSwitchRow
              label="Impression auto après vente"
              hint="Dès l’encaissement, ouvre le ticket et le dialogue d’impression Windows (POS-80). Nécessite « Imprimantes tickets » dans Périphériques."
            >
              <Switch
                checked={settings.autoPrintReceiptAfterSale}
                onChange={(e) =>
                  patchSettings({ autoPrintReceiptAfterSale: e.target.checked })
                }
              />
            </FormSwitchRow>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'service' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[14px] font-semibold text-ink">Cuisine (KDS)</h3>
                <Badge tone={kitchenOn ? 'success' : 'neutral'}>
                  {kitchenOn ? 'Activé' : 'Désactivé'}
                </Badge>
              </div>
              <Field label="Station par défaut">
                <Input
                  value={kitchenStation}
                  onChange={(e) => setKitchenStation(e.target.value)}
                  placeholder="Cuisine principale"
                />
              </Field>
              <Field label="Seuil SLA priorité haute (minutes)">
                <Input
                  inputMode="numeric"
                  value={String(settings.kitchenSlaThresholdMin)}
                  onChange={(e) =>
                    patchSettings({
                      kitchenSlaThresholdMin: Number.parseInt(e.target.value, 10),
                    })
                  }
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <h3 className="text-[14px] font-semibold text-ink">Tables & salle</h3>
              <FormSwitchRow
                label="Libération auto des tables"
                hint="Repasse une table occupée en « libre » après inactivité."
              >
                <Switch
                  checked={settings.tableAutoReleaseEnabled}
                  onChange={(e) =>
                    patchSettings({ tableAutoReleaseEnabled: e.target.checked })
                  }
                />
              </FormSwitchRow>
              <Field label="Délai avant libération (minutes, min. 15)">
                <Input
                  inputMode="numeric"
                  value={settings.tableAutoReleaseMinutes}
                  onChange={(e) =>
                    patchSettings({ tableAutoReleaseMinutes: e.target.value })
                  }
                  disabled={!settings.tableAutoReleaseEnabled}
                />
              </Field>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardContent className="space-y-3">
              <h3 className="text-[14px] font-semibold text-ink">Pointage équipe</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Heure d’arrivée attendue">
                  <Input
                    type="time"
                    value={settings.pointageExpectedStartTime}
                    onChange={(e) =>
                      patchSettings({ pointageExpectedStartTime: e.target.value })
                    }
                  />
                </Field>
                <Field label="Durée journalière cible (heures)">
                  <Input
                    inputMode="numeric"
                    value={String(settings.pointageExpectedDailyHours)}
                    onChange={(e) =>
                      patchSettings({
                        pointageExpectedDailyHours: Number.parseInt(e.target.value, 10),
                      })
                    }
                  />
                </Field>
              </div>
              <p className="text-[11px] text-ink-subtle">
                Sert à signaler les retards et comparer le temps pointé à l’objectif dans la
                synthèse RH.
              </p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardContent className="space-y-3">
              <h3 className="text-[14px] font-semibold text-ink">Livraison</h3>
              <Field label="Prestataire / coursier par défaut">
                <Input
                  value={deliveryProvider}
                  onChange={(e) => setDeliveryProvider(e.target.value)}
                  placeholder="Coursier interne"
                />
              </Field>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === 'peripheriques' ? (
        <div className="space-y-3">
          <Card>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-[14px] font-semibold text-ink">
                    Toplink TL-R120
                  </h3>
                  <p className="mt-1 text-[12px] text-ink-subtle">
                    Imprimante thermique 80 mm ESC/POS. Pour « Connecter USB », Windows
                    doit exposer un <strong>port COM</strong> (Chrome / Edge, localhost
                    ou HTTPS).
                  </p>
                </div>
                <Badge
                  tone={
                    isToplinkPrinterLinked() && printerMeta.connectedAt
                      ? 'success'
                      : 'neutral'
                  }
                >
                  {isToplinkPrinterLinked() && printerMeta.connectedAt
                    ? 'Liée'
                    : 'Non liée'}
                </Badge>
              </div>

              {!webSerialOk ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                  Web Serial indisponible sur ce navigateur. Ouvrez Nora dans
                  Chrome / Edge, ou imprimez via le dialogue Windows (pilote
                  « Printer POS-80 »).
                </p>
              ) : (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">
                  <p className="font-medium">Si l’ordinateur ne détecte pas la TL-R120</p>
                  <ol className="list-decimal space-y-1 pl-4 text-amber-900">
                    <li>
                      Gestionnaire de périphériques → cherchez{' '}
                      <strong>Ports (COM et LPT)</strong>. Il faut un port du type
                      COM3, COM4…
                    </li>
                    <li>
                      Si vous voyez seulement <strong>Printer POS-80</strong> ou
                      « USB Printing Support » (sans COM), le mode USB actuel n’est
                      pas compatible Web Serial : installez le pilote vendeur en mode{' '}
                      <strong>USB Virtual COM / série</strong>, ou basculez le mode
                      USB via l’utilitaire / DIP switch de l’imprimante.
                    </li>
                    <li>
                      Essayez un autre câble USB (données, pas charge seule), un
                      autre port USB direct (pas un hub), imprimante allumée avec
                      papier.
                    </li>
                    <li>
                      En attendant le COM : les tickets peuvent passer par le
                      dialogue d’impression Windows (choisir « Printer POS-80 »).
                    </li>
                  </ol>
                  <p className="text-amber-900">
                    Baud détecté après liaison : {printerMeta.baudRate ?? 9600}.
                  </p>
                </div>
              )}

              <dl className="grid gap-1 text-[12px] text-ink-muted sm:grid-cols-2">
                <div>
                  <dt className="text-ink-subtle">Modèle</dt>
                  <dd className="font-medium text-ink">{printerMeta.model}</dd>
                </div>
                <div>
                  <dt className="text-ink-subtle">Libellé</dt>
                  <dd className="font-medium text-ink">{printerMeta.label}</dd>
                </div>
                <div>
                  <dt className="text-ink-subtle">Dernière utilisation</dt>
                  <dd className="font-medium text-ink">
                    {printerMeta.lastUsedAt
                      ? new Date(printerMeta.lastUsedAt).toLocaleString('fr-FR')
                      : '—'}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  disabled={printerBusy || !webSerialOk}
                  onClick={() => {
                    setPrinterBusy(true)
                    void connectToplinkPrinter()
                      .then((meta) => {
                        setPrinterMeta(meta)
                        toast.success(
                          'Imprimante liée',
                          'Toplink TL-R120 prête pour les tickets.',
                        )
                      })
                      .catch((err) =>
                        toast.error(
                          'Connexion impossible',
                          err instanceof Error ? err.message : 'Erreur',
                        ),
                      )
                      .finally(() => setPrinterBusy(false))
                  }}
                >
                  Connecter USB
                </Button>
                <Button
                  variant="secondary"
                  disabled={printerBusy || !webSerialOk}
                  onClick={() => {
                    setPrinterBusy(true)
                    void printToplinkTestPage()
                      .then((msg) => {
                        setPrinterMeta(getToplinkPrinterMeta())
                        toast.success('Test OK', msg)
                      })
                      .catch((err) =>
                        toast.error(
                          'Test échoué',
                          err instanceof Error ? err.message : 'Erreur',
                        ),
                      )
                      .finally(() => setPrinterBusy(false))
                  }}
                >
                  Page de test
                </Button>
                <Button
                  variant="secondary"
                  disabled={printerBusy}
                  onClick={() => {
                    setPrinterBusy(true)
                    void kickCashDrawer()
                      .then((ok) => {
                        if (ok) {
                          toast.success('Tiroir', 'Commande d’ouverture envoyée.')
                          return
                        }
                        toast.warning('Tiroir non ouvert', CASH_DRAWER_WINDOWS_HINT)
                      })
                      .catch((err) =>
                        toast.error(
                          'Tiroir',
                          err instanceof Error ? err.message : 'Erreur',
                        ),
                      )
                      .finally(() => setPrinterBusy(false))
                  }}
                >
                  Ouvrir le tiroir
                </Button>
                <Button
                  variant="ghost"
                  disabled={printerBusy || !printerMeta.connectedAt}
                  onClick={() => {
                    setPrinterBusy(true)
                    void disconnectToplinkPrinter()
                      .then(() => {
                        setPrinterMeta(getToplinkPrinterMeta())
                        toast.success('Imprimante déconnectée')
                      })
                      .finally(() => setPrinterBusy(false))
                  }}
                >
                  Déconnecter
                </Button>
              </div>
              <p className="text-[11px] text-ink-subtle">
                Le tiroir branché en RJ11 sur l’imprimante ne s’ouvre que via ESC/POS
                (port COM) ou via l’option « ouvrir le tiroir » dans les préférences
                Windows de <strong>POS-80</strong>. L’impression PDF/GDI seule ne
                déclenche pas le tiroir.
              </p>
              <p className="text-[11px] text-ink-subtle">
                Ticket coupé / incomplet sous Windows : préférences POS →{' '}
                <strong>Paper cutting = ON</strong>, marge de fin ~30–50 mm, échelle
                100 % (pas « ajuster à la page »), décocher en-têtes/pieds Chrome.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <h3 className="text-[14px] font-semibold text-ink">
                Périphériques connectés
              </h3>
              <p className="text-[12px] text-ink-subtle">
                Activez les modules locaux de ce poste (imprimante, tiroir-caisse, TPE,
                écran cuisine).
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { key: 'orderTerminals', label: 'Bornes commande' },
                    { key: 'receiptPrinters', label: 'Imprimantes tickets' },
                    { key: 'kitchenScreens', label: 'Écrans cuisine (KDS)' },
                    { key: 'cashDrawer', label: 'Tiroir-caisse (RJ11 via imprimante)' },
                    {
                      key: 'paymentTerminals',
                      label: 'Terminaux paiement (TPE)',
                    },
                  ] as const
                ).map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2.5"
                  >
                    <span className="text-[12px] font-medium text-ink">
                      {item.label}
                    </span>
                    <Switch
                      checked={deviceConnectivity[item.key]}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setDeviceConnectivity((prev) => {
                          const next = { ...prev, [item.key]: checked }
                          setDeviceConnectivityDemo(next)
                          return next
                        })
                      }}
                    />
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === 'modules' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardContent className="space-y-3">
              <div>
                <p className="text-[13px] font-semibold text-ink">
                  Domaine d’activité
                </p>
                <p className="mt-1 text-[12px] text-ink-muted">
                  Chaque domaine a ses modules, ses catégories et son catalogue
                  (ex. pharmacie ≠ restaurant). Le menu et les produits
                  s’adaptent.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {BUSINESS_DOMAINS.map((domain) => {
                  const selected = settings.businessDomain === domain.id
                  return (
                    <button
                      key={domain.id}
                      type="button"
                      onClick={() => {
                        void (async () => {
                          const prev = settings.businessDomain
                          const next = domain.id as BusinessDomain
                          patchSettings({ businessDomain: next })
                          if (
                            next === 'restaurant' ||
                            next === 'bakery' ||
                            next === 'hotel'
                          ) {
                            setKitchenModuleDemo(true)
                            setKitchenOn(true)
                          } else if (
                            prev === 'restaurant' ||
                            prev === 'bakery' ||
                            prev === 'hotel'
                          ) {
                            setKitchenModuleDemo(false)
                            setKitchenOn(false)
                          }
                          try {
                            await migrateProductBusinessDomains()
                            await ensureDomainProductCategories(next)
                            await ensureDefaultProductFormSections(next)
                            const seeded =
                              await ensureDomainSampleProductsIfEmpty(next)
                            const stockFilled =
                              await ensureDomainStocksConcordant(next)
                            await ensureAllStoreStockRows()
                            await ensureAllLocationStockRows()
                            await syncProductCategoriesFromProducts()
                            const extras: string[] = []
                            if (seeded > 0) {
                              extras.push(
                                `${seeded} articles d’exemple ajoutés`,
                              )
                            }
                            if (stockFilled > 0) {
                              extras.push(
                                `stocks alignés (${stockFilled} réf.)`,
                              )
                            }
                            toast.success(
                              'Domaine mis à jour',
                              extras.length > 0
                                ? `${domain.label} — ${extras.join(' · ')}`
                                : domain.label,
                            )
                          } catch (e) {
                            toast.error(
                              'Domaine enregistré, catalogue incomplet',
                              e instanceof Error ? e.message : 'Erreur locale',
                            )
                          }
                        })()
                      }}
                      className={
                        selected
                          ? 'rounded-xl border-2 border-[#0033aa] bg-[#e8eefa] px-3 py-3 text-left'
                          : 'rounded-xl border border-border/70 bg-white px-3 py-3 text-left hover:border-[#0033aa]/40'
                      }
                    >
                      <span className="block text-[13px] font-semibold text-ink">
                        {domain.label}
                      </span>
                      <span className="mt-1 block text-[11px] leading-snug text-ink-muted">
                        {domain.description}
                      </span>
                      {domain.extraModules.length > 0 ? (
                        <span className="mt-2 block text-[10px] font-medium uppercase tracking-wide text-[#0033aa]">
                          +{' '}
                          {domain.extraModules
                            .map((id) => VIEW_LABELS[id])
                            .join(' · ')}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {(
            [
              {
                label: 'Module cuisine',
                checked: kitchenOn,
                onChange: (v: boolean) => {
                  setKitchenModuleDemo(v)
                  setKitchenOn(v)
                },
              },
              {
                label: 'Livraison',
                checked: deliveryOn,
                onChange: (v: boolean) => {
                  setDeliveryModuleDemo(v)
                  setDeliveryOn(v)
                },
              },
              {
                label: 'Comptabilité avancée',
                checked: comptaOn,
                onChange: (v: boolean) => {
                  setComptaModuleDemo(v)
                  setComptaOn(v)
                },
              },
            ] as const
          ).map((mod) => (
            <label
              key={mod.label}
              className="flex items-center justify-between rounded-xl border border-border/70 bg-white px-4 py-3"
            >
              <span className="text-[13px] font-medium text-ink">{mod.label}</span>
              <Switch
                checked={mod.checked}
                onChange={(e) => mod.onChange(e.target.checked)}
              />
            </label>
          ))}

          {canManageIntegrations && onOpenIntegrations ? (
            <Card className="lg:col-span-2 border-dashed">
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-ink">API & partenaires</p>
                  <p className="text-[12px] text-ink-subtle">
                    Clés API, webhooks commandes et marketplace avancée.
                  </p>
                </div>
                <Button variant="secondary" onClick={onOpenIntegrations}>
                  Ouvrir Connexions
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'formulaires' ? (
        <ProductFormSectionsAdmin domain={settings.businessDomain} />
      ) : null}
    </div>
  )
}
