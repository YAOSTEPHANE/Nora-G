import type { Store, StockTransfer, TerminalNode } from '../db/types'
import { isWarehouseStore } from '../db/seedStores'
import { isAiReady, getAiConnectivityConfig } from './aiConnectivity'

export type EvolutiviteCheckId =
  | 'same_system'
  | 'multi_store_ready'
  | 'warehouse'
  | 'transfers'
  | 'terminals'
  | 'store_switch'
  | 'ai_connected'
  | 'ai_catalog'
  | 'ai_marketing'
  | 'ai_reporting'

export type EvolutiviteCheck = {
  id: EvolutiviteCheckId
  label: string
  description: string
  done: boolean
  group: 'network' | 'ai'
}

export type NetworkGrowthSnapshot = {
  boutiqueCount: number
  warehouseCount: number
  transferCount: number
  terminalCount: number
  mode: 'mono' | 'multi'
  /** 0 = illimité */
  maxStores: number
  canAddBoutique: boolean
  checks: EvolutiviteCheck[]
  readinessPct: number
}

export function assessNetworkGrowth(params: {
  stores: Store[]
  transfers: StockTransfer[]
  terminals: TerminalNode[]
  maxStores?: number
}): NetworkGrowthSnapshot {
  const active = params.stores.filter((s) => !s.archived)
  const boutiques = active.filter((s) => !isWarehouseStore(s))
  const warehouses = active.filter(isWarehouseStore)
  const maxStores = params.maxStores ?? 0
  const boutiqueCount = boutiques.length
  const canAddBoutique =
    maxStores <= 0 || boutiqueCount < maxStores

  const ai = getAiConnectivityConfig()
  const aiOk = isAiReady(ai)

  const checks: EvolutiviteCheck[] = [
    {
      id: 'same_system',
      label: 'Même système Nora',
      description:
        'Caisse, stocks, reporting et contrôle restent identiques en mono ou multi.',
      done: true,
      group: 'network',
    },
    {
      id: 'multi_store_ready',
      label: 'Multi-boutiques actif',
      description:
        boutiqueCount <= 1
          ? 'Ajoutez une 2ᵉ boutique : le catalogue et les droits restent partagés.'
          : `${boutiqueCount} boutiques sur le même compte.`,
      done: boutiqueCount >= 2,
      group: 'network',
    },
    {
      id: 'warehouse',
      label: 'Entrepôt central',
      description: 'Réapprovisionnement vers les points de vente.',
      done: warehouses.length > 0,
      group: 'network',
    },
    {
      id: 'transfers',
      label: 'Transferts de stock',
      description:
        params.transfers.length > 0
          ? `${params.transfers.length} transfert(s) enregistré(s).`
          : 'Utilisez Magasins → Transferts pour déplacer le stock.',
      done: params.transfers.length > 0,
      group: 'network',
    },
    {
      id: 'terminals',
      label: 'Terminaux multi-points',
      description:
        params.terminals.length > 0
          ? `${params.terminals.length} terminal(aux) vu(s).`
          : 'Chaque caisse se rattache à une boutique sans changer d’app.',
      done: params.terminals.length > 0,
      group: 'network',
    },
    {
      id: 'store_switch',
      label: 'Changement de boutique',
      description:
        'Le sélecteur de magasin bascule stock et ventes sans nouvelle installation.',
      done: boutiqueCount >= 1,
      group: 'network',
    },
    {
      id: 'ai_connected',
      label: 'Connectivité IA',
      description: aiOk
        ? `Prête · modèle ${ai.model}`
        : 'Branchez une clé API OpenAI (ou compatible) pour activer l’assistant.',
      done: aiOk,
      group: 'ai',
    },
    {
      id: 'ai_catalog',
      label: 'IA catalogue',
      description: 'Suggestions de libellés et descriptions produits.',
      done: aiOk && ai.featureCatalog,
      group: 'ai',
    },
    {
      id: 'ai_marketing',
      label: 'IA marketing',
      description: 'Aide à la rédaction de campagnes et messages.',
      done: aiOk && ai.featureMarketing,
      group: 'ai',
    },
    {
      id: 'ai_reporting',
      label: 'IA pilotage',
      description: 'Synthèses CA / stock / alertes en langage naturel.',
      done: aiOk && ai.featureReporting,
      group: 'ai',
    },
  ]

  const doneCount = checks.filter((c) => c.done).length
  const readinessPct = Math.round((doneCount / checks.length) * 100)

  return {
    boutiqueCount,
    warehouseCount: warehouses.length,
    transferCount: params.transfers.length,
    terminalCount: params.terminals.length,
    mode: boutiqueCount >= 2 ? 'multi' : 'mono',
    maxStores,
    canAddBoutique,
    checks,
    readinessPct,
  }
}

export function suggestStoreCode(name: string, existing: string[]): string {
  const letters = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  let base = letters.slice(0, 2) || 'BX'
  if (base.length < 2) base = `${base}X`
  const used = new Set(existing.map((c) => c.toUpperCase()))
  if (!used.has(base)) return base.slice(0, 6)
  for (let i = 2; i < 100; i++) {
    const cand = `${base.slice(0, 2)}${i}`.slice(0, 6)
    if (!used.has(cand)) return cand
  }
  return `B${String(Date.now() % 1000)}`.slice(0, 6)
}
