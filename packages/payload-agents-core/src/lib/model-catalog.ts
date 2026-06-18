/**
 * Model catalog backed by a LiteLLM gateway.
 *
 * The LiteLLM gateway catalog is the source of truth for which models agents
 * may use. In config mode it is backed by `model_list`; in DB mode it is backed
 * by LiteLLM DB/Admin UI. This module fetches `/model/info`, normalises it into
 * presets and caches the result briefly so the admin select and the validation
 * hook don't hit the gateway on every call.
 */

export interface ModelPreset {
  /** Preset name agents reference as `llmModel` (e.g. "chat-premium"). */
  name: string
  description?: string
  /** Provider whose API key the agent must bring (e.g. "openai", "anthropic", "google"). */
  requiresKey?: string
  tier?: string
}

export interface ModelCatalogSettings {
  /** Gateway base URL without /v1 (e.g. http://litellm:4000). */
  gatewayUrl: string
  /** Key used to read /model/info (the gateway master key). */
  masterKey: string
  /** Catalog cache TTL in ms. */
  cacheTtlMs: number
}

interface RawModelInfo {
  model_name?: string
  model_info?: Record<string, unknown>
}

const CACHE = new Map<string, { at: number; presets: ModelPreset[] }>()

function readString(info: Record<string, unknown>, key: string): string | undefined {
  const value = info[key]
  return typeof value === 'string' ? value : undefined
}

export async function fetchModelCatalog(settings: ModelCatalogSettings): Promise<ModelPreset[]> {
  const cached = CACHE.get(settings.gatewayUrl)
  if (cached && Date.now() - cached.at < settings.cacheTtlMs) return cached.presets

  const res = await fetch(`${settings.gatewayUrl}/model/info`, {
    headers: { Authorization: `Bearer ${settings.masterKey}` }
  })
  if (!res.ok) {
    throw new Error(`model catalog fetch failed: HTTP ${res.status}`)
  }
  const body = (await res.json()) as { data?: RawModelInfo[] }
  // LiteLLM's router registers an extra deployment per BYOK call (client-side
  // credentials), so /model/info can list the same model_name several times —
  // dedupe by name; the clones carry identical metadata.
  const byName = new Map<string, ModelPreset>()
  for (const m of body.data ?? []) {
    // "*" is the legacy passthrough entry, not a preset
    if (typeof m.model_name !== 'string' || m.model_name === '*' || byName.has(m.model_name)) continue
    const info = m.model_info ?? {}
    byName.set(m.model_name, {
      name: m.model_name,
      description: readString(info, 'description'),
      requiresKey: readString(info, 'requires_key'),
      tier: readString(info, 'catalog_tier')
    })
  }
  const presets = [...byName.values()]

  CACHE.set(settings.gatewayUrl, { at: Date.now(), presets })
  return presets
}

/** Heuristic provider detection from the BYOK key format. */
const KEY_CHECKS: Record<string, (key: string) => boolean> = {
  anthropic: key => key.startsWith('sk-ant-'),
  openai: key => key.startsWith('sk-') && !key.startsWith('sk-ant-'),
  google: key => key.startsWith('AIza'),
  gemini: key => key.startsWith('AIza')
}

/**
 * Whether a BYOK key plausibly belongs to the provider a preset requires.
 * Unknown providers are not blocked — the heuristic only rejects keys whose
 * format clearly belongs to a different provider.
 */
export function keyMatchesProvider(apiKey: string, requiresKey: string): boolean {
  const check = KEY_CHECKS[requiresKey.toLowerCase()]
  return check ? check(apiKey) : true
}

/** Test helper — drops the in-memory catalog cache. */
export function clearModelCatalogCache(): void {
  CACHE.clear()
}
