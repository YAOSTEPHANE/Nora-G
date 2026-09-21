/** Configuration connectivité IA (OpenAI-compatible), stockée localement. */

const KEY = 'nora-ai-connectivity-v1'

export type AiProviderId = 'openai' | 'compatible'

export type AiConnectivityConfig = {
  enabled: boolean
  provider: AiProviderId
  /** Base URL sans slash final — ex. https://api.openai.com/v1 */
  baseUrl: string
  apiKey: string
  model: string
  /** Assistant suggestions catalogue / descriptions. */
  featureCatalog: boolean
  /** Aide rédaction campagnes marketing. */
  featureMarketing: boolean
  /** Synthèse pilotage / reporting. */
  featureReporting: boolean
}

export const DEFAULT_AI_CONFIG: AiConnectivityConfig = {
  enabled: false,
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  featureCatalog: true,
  featureMarketing: true,
  featureReporting: true,
}

export const AI_CONFIG_CHANGED_EVENT = 'nora-ai-config-changed'

export function getAiConnectivityConfig(): AiConnectivityConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_AI_CONFIG }
    const parsed = JSON.parse(raw) as Partial<AiConnectivityConfig>
    return {
      ...DEFAULT_AI_CONFIG,
      ...parsed,
      baseUrl: (parsed.baseUrl ?? DEFAULT_AI_CONFIG.baseUrl).replace(/\/$/, ''),
    }
  } catch {
    return { ...DEFAULT_AI_CONFIG }
  }
}

export function setAiConnectivityConfig(
  patch: Partial<AiConnectivityConfig>,
): AiConnectivityConfig {
  const next = {
    ...getAiConnectivityConfig(),
    ...patch,
  }
  next.baseUrl = next.baseUrl.replace(/\/$/, '')
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
    window.dispatchEvent(new Event(AI_CONFIG_CHANGED_EVENT))
  } catch {
    /* ignore */
  }
  return next
}

export function maskApiKey(key: string): string {
  const k = key.trim()
  if (k.length < 8) return k ? '••••' : ''
  return `${k.slice(0, 3)}••••${k.slice(-4)}`
}

export function isAiReady(config = getAiConnectivityConfig()): boolean {
  return (
    config.enabled &&
    config.apiKey.trim().length >= 8 &&
    config.baseUrl.trim().length > 8 &&
    config.model.trim().length > 0
  )
}

export type AiChatResult =
  | { ok: true; content: string; latencyMs: number }
  | { ok: false; error: string }

/**
 * Appel chat completions compatible OpenAI.
 * Ne journalise pas la clé ; timeout 25 s.
 */
export async function aiChatCompletion(params: {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  config?: AiConnectivityConfig
  temperature?: number
  maxTokens?: number
}): Promise<AiChatResult> {
  const config = params.config ?? getAiConnectivityConfig()
  if (!isAiReady(config)) {
    return {
      ok: false,
      error: 'Connectivité IA inactive ou clé / URL manquante.',
    }
  }
  const started = Date.now()
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 25_000)
  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens ?? 400,
      }),
      signal: controller.signal,
    })
    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string }
      choices?: { message?: { content?: string } }[]
    } | null
    if (!res.ok) {
      return {
        ok: false,
        error:
          data?.error?.message ??
          `Erreur HTTP ${res.status} — vérifiez clé, modèle et URL.`,
      }
    }
    const content = data?.choices?.[0]?.message?.content?.trim()
    if (!content) {
      return { ok: false, error: 'Réponse IA vide.' }
    }
    return { ok: true, content, latencyMs: Date.now() - started }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, error: 'Délai dépassé (25 s).' }
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Connexion IA impossible.',
    }
  } finally {
    window.clearTimeout(timer)
  }
}

export async function testAiConnectivity(
  config?: AiConnectivityConfig,
): Promise<AiChatResult> {
  return aiChatCompletion({
    config,
    messages: [
      {
        role: 'system',
        content: 'Tu es un test de connectivité. Réponds en une phrase courte en français.',
      },
      {
        role: 'user',
        content: 'Dis uniquement : Connexion Nora IA OK.',
      },
    ],
    maxTokens: 40,
  })
}
