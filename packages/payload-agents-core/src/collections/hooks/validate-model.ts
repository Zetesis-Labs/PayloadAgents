/**
 * beforeValidate hook — enforce the model catalog on agent writes.
 *
 * Only active when `modelCatalog` is configured. Untouched legacy documents
 * keep working; the rules kick in when the model changes (must be a catalog
 * preset) or when a new plaintext API key is provided (its format must match
 * the provider the chosen preset requires).
 */

import type { CollectionBeforeValidateHook } from 'payload'
import { APIError } from 'payload'
import { isEncrypted } from '../../lib/encryption'
import type { ModelCatalogSettings, ModelPreset } from '../../lib/model-catalog'
import { fetchModelCatalog, keyMatchesProvider } from '../../lib/model-catalog'
import type { ResolvedPluginConfig } from '../../types'

function readString(record: unknown, key: string): string | undefined {
  if (!record || typeof record !== 'object') return undefined
  const value = (record as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

async function loadCatalog(settings: ModelCatalogSettings): Promise<ModelPreset[] | null> {
  try {
    return await fetchModelCatalog(settings)
  } catch {
    // Don't couple the agent write to LiteLLM uptime. If the catalog can't be
    // reached (and isn't cached), skip validation rather than 503: the sync
    // job reconciles the key afterwards, and the runtime is fail-closed — an
    // agent referencing a bogus model simply won't load.
    return null
  }
}

function assertPresetExists(presets: ModelPreset[], model: string | undefined): void {
  if (!presets.some(p => p.name === model)) {
    throw new APIError(
      `llmModel "${model}" is not a catalog preset. Available presets: ${presets.map(p => p.name).join(', ')}`,
      400
    )
  }
}

function assertKeyMatchesPreset(preset: ModelPreset | undefined, apiKey: string): void {
  if (preset?.requiresKey && !keyMatchesProvider(apiKey, preset.requiresKey)) {
    throw new APIError(
      `The API key does not look like a ${preset.requiresKey} key, but preset "${preset.name}" requires one.`,
      400
    )
  }
}

export function createModelCatalogValidateHook(config: ResolvedPluginConfig): CollectionBeforeValidateHook {
  return async ({ data, operation, originalDoc }) => {
    const catalog = config.modelCatalog
    if (!data) return data

    const model = readString(data, 'llmModel')
    const previousModel = readString(originalDoc, 'llmModel')
    const modelChanged = operation === 'create' || (model !== undefined && model !== previousModel)

    const apiKey = readString(data, 'apiKey')
    const keyProvided = apiKey !== undefined && apiKey !== '' && !isEncrypted(apiKey)

    if (!modelChanged && !keyProvided) return data

    const presets = await loadCatalog(catalog)
    if (!presets) {
      console.warn(
        '[Agents] Model catalog unavailable — skipping model validation; the sync job will reconcile the key.'
      )
      return data
    }
    if (modelChanged) assertPresetExists(presets, model)

    if (keyProvided && apiKey) {
      const effectiveModel = model ?? previousModel
      assertKeyMatchesPreset(
        presets.find(p => p.name === effectiveModel),
        apiKey
      )
    }
    return data
  }
}
