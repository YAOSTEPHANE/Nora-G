import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db, ensureAllStoreStockRows } from '../db/db'
import { isWarehouseStore } from '../db/seedStores'
import type { Store } from '../db/types'
import {
  AI_CONFIG_CHANGED_EVENT,
  aiChatCompletion,
  getAiConnectivityConfig,
  isAiReady,
  maskApiKey,
  setAiConnectivityConfig,
  testAiConnectivity,
  type AiConnectivityConfig,
  type AiProviderId,
} from '../lib/aiConnectivity'
import { appendAuditEvent, type AuditActor } from '../lib/auditLog'
import {
  assessNetworkGrowth,
  suggestStoreCode,
} from '../lib/evolutivite'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader, SectionHeader } from '../ui/PageHeader'
import { Tabs } from '../ui/Tabs'
import { Switch } from '../ui/Switch'
import { useToast } from '../ui/Toast'
import {
  IconCheck,
  IconNetwork,
  IconPlus,
  IconSparkles,
  IconStore,
} from '../ui/icons'
import { cn } from '../ui/cn'

type TabId = 'croissance' | 'ia'

type Props = {
  canConfigureStores: boolean
  maxStores: number
  auditActor: AuditActor
  onOpenNetwork?: () => void
}

export function EvolutiviteView({
  canConfigureStores,
  maxStores,
  auditActor,
  onOpenNetwork,
}: Props) {
  const toast = useToast()
  const { setActiveStoreId } = useActiveStore()
  const [tab, setTab] = useState<TabId>('croissance')
  const [busy, setBusy] = useState(false)

  const stores =
    useLiveQuery(() => db.stores.orderBy('sortOrder').toArray(), [], []) ?? []
  const transfers =
    useLiveQuery(
      () => db.stockTransfers.orderBy('createdAt').reverse().toArray(),
      [],
      [],
    ) ?? []
  const terminals =
    useLiveQuery(
      () => db.terminalNodes.orderBy('lastSeenAt').reverse().toArray(),
      [],
      [],
    ) ?? []

  const snapshot = useMemo(
    () =>
      assessNetworkGrowth({
        stores,
        transfers,
        terminals,
        maxStores,
      }),
    [stores, transfers, terminals, maxStores],
  )

  const boutiques = useMemo(
    () => stores.filter((s) => !s.archived && !isWarehouseStore(s)),
    [stores],
  )

  // —— Ajout boutique ——
  const [storeName, setStoreName] = useState('')
  const [storeCode, setStoreCode] = useState('')

  useEffect(() => {
    if (!storeName.trim()) return
    const codes = stores.map((s) => s.shortCode)
    setStoreCode(suggestStoreCode(storeName, codes))
  }, [storeName, stores])

  const addBoutique = async () => {
    if (!canConfigureStores) return
    const name = storeName.trim()
    const sc = storeCode.trim().toUpperCase().slice(0, 6)
    if (!name || !sc) {
      toast.error('Nom et code requis')
      return
    }
    if (
      snapshot.maxStores > 0 &&
      snapshot.boutiqueCount >= snapshot.maxStores
    ) {
      toast.error(
        'Limite atteinte',
        `Votre plan autorise ${snapshot.maxStores} boutique(s).`,
      )
      return
    }
    if (stores.some((s) => s.shortCode.toUpperCase() === sc && !s.archived)) {
      toast.error('Code déjà utilisé')
      return
    }
    setBusy(true)
    try {
      const maxSort = stores.reduce((m, s) => Math.max(m, s.sortOrder), -1) + 1
      const row: Store = {
        id: crypto.randomUUID(),
        name,
        shortCode: sc,
        sortOrder: maxSort,
        archived: false,
        kind: 'store',
      }
      await db.stores.add(row)
      await ensureAllStoreStockRows()
      void appendAuditEvent({
        kind: 'stock_adjusted',
        actor: auditActor,
        reason: `Évolutivité : création boutique « ${name} » (${sc})`,
        payload: {
          source: 'evolutivite',
          action: 'store_created',
          storeId: row.id,
          storeName: name,
          shortCode: sc,
        },
      })
      setStoreName('')
      setStoreCode('')
      setActiveStoreId(row.id)
      toast.success('Boutique ajoutée', `${name} — même système Nora`)
    } finally {
      setBusy(false)
    }
  }

  // —— IA ——
  const [aiConfig, setAiConfig] = useState<AiConnectivityConfig>(() =>
    getAiConnectivityConfig(),
  )
  const [aiPrompt, setAiPrompt] = useState(
    'Résume en 3 puces comment passer d’1 à plusieurs boutiques avec Nora.',
  )
  const [aiReply, setAiReply] = useState('')
  const [aiTesting, setAiTesting] = useState(false)

  useEffect(() => {
    const sync = () => setAiConfig(getAiConnectivityConfig())
    window.addEventListener(AI_CONFIG_CHANGED_EVENT, sync)
    return () => window.removeEventListener(AI_CONFIG_CHANGED_EVENT, sync)
  }, [])

  const saveAi = useCallback(
    (patch: Partial<AiConnectivityConfig>) => {
      const next = setAiConnectivityConfig(patch)
      setAiConfig(next)
    },
    [],
  )

  const runAiTest = async () => {
    setAiTesting(true)
    setAiReply('')
    try {
      const result = await testAiConnectivity(aiConfig)
      if (result.ok) {
        setAiReply(result.content)
        toast.success('Connexion IA OK', `${result.latencyMs} ms`)
      } else {
        toast.error('Échec connexion IA', result.error)
        setAiReply(result.error)
      }
    } finally {
      setAiTesting(false)
    }
  }

  const runAiAsk = async () => {
    if (!aiPrompt.trim()) return
    setAiTesting(true)
    setAiReply('')
    try {
      const result = await aiChatCompletion({
        config: aiConfig,
        messages: [
          {
            role: 'system',
            content:
              'Tu es l’assistant Nora POS (Côte d’Ivoire). Réponds en français, concis et actionnable.',
          },
          { role: 'user', content: aiPrompt.trim() },
        ],
      })
      if (result.ok) {
        setAiReply(result.content)
      } else {
        toast.error('IA indisponible', result.error)
        setAiReply(result.error)
      }
    } finally {
      setAiTesting(false)
    }
  }

  const networkChecks = snapshot.checks.filter((c) => c.group === 'network')
  const aiChecks = snapshot.checks.filter((c) => c.group === 'ai')

  return (
    <div className="module-page space-y-6">
      <PageHeader
        icon={<IconSparkles />}
        title="Évolutivité"
        subtitle="Passer de 1 à N boutiques sans changer de système · connectivité IA"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Mode réseau"
          value={snapshot.mode === 'multi' ? 'Multi' : 'Mono'}
          hint={`${snapshot.boutiqueCount} boutique(s)`}
          tone="accent"
        />
        <Kpi
          label="Entrepôts"
          value={String(snapshot.warehouseCount)}
          tone="violet"
        />
        <Kpi
          label="Prêt évolutif"
          value={`${snapshot.readinessPct} %`}
          tone="amber"
        />
        <Kpi
          label="IA"
          value={isAiReady(aiConfig) ? 'Connectée' : 'Off'}
          hint={isAiReady(aiConfig) ? aiConfig.model : 'Configurer une clé'}
          tone={isAiReady(aiConfig) ? 'sky' : 'rose'}
        />
      </div>

      <Tabs
        variant="segmented"
        active={tab}
        onChange={setTab}
        items={[
          { id: 'croissance', label: '1 → N boutiques' },
          { id: 'ia', label: 'Connectivité IA' },
        ]}
      />

      {tab === 'croissance' ? (
        <div className="space-y-6">
          <SectionHeader
            title="Même système, plus de points de vente"
            subtitle="Catalogue, caisse, reporting et contrôle restent partagés. Seul le stock est par boutique."
          />

          <ul className="space-y-2">
            {networkChecks.map((c) => (
              <li
                key={c.id}
                className={cn(
                  'flex gap-3 rounded-xl border px-4 py-3',
                  c.done
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : 'border-zinc-200 bg-white',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                    c.done
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-100 text-zinc-400',
                  )}
                >
                  {c.done ? <IconCheck /> : null}
                </span>
                <div>
                  <p className="font-medium text-zinc-900">{c.label}</p>
                  <p className="text-sm text-zinc-500">{c.description}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            {onOpenNetwork ? (
              <Button
                type="button"
                variant="secondary"
                iconLeft={<IconNetwork />}
                onClick={onOpenNetwork}
              >
                Ouvrir Magasins (transferts & stocks)
              </Button>
            ) : null}
          </div>

          <FormPanel
            title="Ajouter une boutique"
            description={
              snapshot.maxStores > 0
                ? `Quota plan : ${snapshot.boutiqueCount}/${snapshot.maxStores}`
                : 'Aucune limite de boutiques sur ce plan (0 = illimité).'
            }
          >
            {!canConfigureStores ? (
              <p className="text-sm text-zinc-500">
                Réservé à l’administrateur pour créer des points de vente.
              </p>
            ) : !snapshot.canAddBoutique ? (
              <EmptyState
                title="Limite de boutiques atteinte"
                description="Passez à un plan supérieur pour ajouter des points de vente."
              />
            ) : (
              <div className="space-y-4">
                <FormGrid>
                  <Field label="Nom de la boutique">
                    <Input
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      placeholder="Ex. Boutique Cocody"
                    />
                  </Field>
                  <Field label="Code court">
                    <Input
                      value={storeCode}
                      onChange={(e) =>
                        setStoreCode(e.target.value.toUpperCase().slice(0, 6))
                      }
                      placeholder="CO"
                    />
                  </Field>
                </FormGrid>
                <Button
                  type="button"
                  disabled={busy}
                  iconLeft={<IconPlus />}
                  onClick={() => void addBoutique()}
                >
                  {busy ? 'Création…' : 'Créer la boutique'}
                </Button>
                <p className="text-xs text-zinc-500">
                  Après création, le sélecteur de magasin bascule dessus — pas
                  de nouvelle installation.
                </p>
              </div>
            )}
          </FormPanel>

          <SectionHeader title="Boutiques actuelles" />
          {boutiques.length === 0 ? (
            <EmptyState title="Aucune boutique" />
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
              {boutiques.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <IconStore />
                    <div>
                      <p className="font-medium text-zinc-900">{s.name}</p>
                      <p className="text-xs text-zinc-500">{s.shortCode}</p>
                    </div>
                  </div>
                  <Badge tone="accent">Boutique</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'ia' ? (
        <div className="space-y-6">
          <SectionHeader
            title="Connectivité IA"
            subtitle="API OpenAI ou endpoint compatible (Azure, proxy, etc.) — clé stockée localement sur ce terminal."
          />

          <ul className="space-y-2">
            {aiChecks.map((c) => (
              <li
                key={c.id}
                className={cn(
                  'flex gap-3 rounded-xl border px-4 py-3',
                  c.done
                    ? 'border-sky-200 bg-sky-50/50'
                    : 'border-zinc-200 bg-white',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                    c.done
                      ? 'bg-sky-600 text-white'
                      : 'bg-zinc-100 text-zinc-400',
                  )}
                >
                  {c.done ? '✓' : '·'}
                </span>
                <div>
                  <p className="font-medium text-zinc-900">{c.label}</p>
                  <p className="text-sm text-zinc-500">{c.description}</p>
                </div>
              </li>
            ))}
          </ul>

          <FormPanel title="Configuration">
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-zinc-800">Activer l’IA</span>
                <Switch
                  checked={aiConfig.enabled}
                  onChange={(e) => saveAi({ enabled: e.target.checked })}
                />
              </label>

              <FormGrid>
                <Field label="Fournisseur">
                  <Select
                    value={aiConfig.provider}
                    onChange={(e) => {
                      const provider = e.target.value as AiProviderId
                      saveAi({
                        provider,
                        baseUrl:
                          provider === 'openai'
                            ? 'https://api.openai.com/v1'
                            : aiConfig.baseUrl,
                      })
                    }}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="compatible">Compatible OpenAI</option>
                  </Select>
                </Field>
                <Field label="Modèle">
                  <Input
                    value={aiConfig.model}
                    onChange={(e) => saveAi({ model: e.target.value })}
                    placeholder="gpt-4o-mini"
                  />
                </Field>
                <Field label="URL de base (API)" className="sm:col-span-2">
                  <Input
                    value={aiConfig.baseUrl}
                    onChange={(e) => saveAi({ baseUrl: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                  />
                </Field>
                <Field label="Clé API" className="sm:col-span-2">
                  <Input
                    type="password"
                    value={aiConfig.apiKey}
                    onChange={(e) => saveAi({ apiKey: e.target.value })}
                    placeholder={
                      aiConfig.apiKey
                        ? maskApiKey(aiConfig.apiKey)
                        : 'sk-…'
                    }
                    autoComplete="off"
                  />
                </Field>
              </FormGrid>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                  <span>Catalogue</span>
                  <Switch
                    checked={aiConfig.featureCatalog}
                    onChange={(e) =>
                      saveAi({ featureCatalog: e.target.checked })
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                  <span>Marketing</span>
                  <Switch
                    checked={aiConfig.featureMarketing}
                    onChange={(e) =>
                      saveAi({ featureMarketing: e.target.checked })
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                  <span>Pilotage</span>
                  <Switch
                    checked={aiConfig.featureReporting}
                    onChange={(e) =>
                      saveAi({ featureReporting: e.target.checked })
                    }
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={aiTesting || !aiConfig.apiKey.trim()}
                  onClick={() => void runAiTest()}
                >
                  {aiTesting ? 'Test…' : 'Tester la connexion'}
                </Button>
              </div>
            </div>
          </FormPanel>

          <FormPanel
            title="Essai rapide"
            description="Envoie un prompt via votre endpoint configuré."
          >
            <Field label="Prompt">
              <Textarea
                rows={3}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
              />
            </Field>
            <Button
              type="button"
              className="mt-3"
              disabled={aiTesting || !isAiReady(aiConfig)}
              iconLeft={<IconSparkles />}
              onClick={() => void runAiAsk()}
            >
              Demander à l’IA
            </Button>
            {aiReply ? (
              <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm whitespace-pre-wrap text-zinc-800">
                {aiReply}
              </div>
            ) : null}
          </FormPanel>
        </div>
      ) : null}
    </div>
  )
}
