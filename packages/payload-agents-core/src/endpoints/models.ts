/**
 * GET {basePath}/models — Curated model catalog for the agent admin UI.
 *
 * Proxies the LiteLLM gateway's /model/info (server-side, with the master
 * key — the browser never talks to the gateway) and returns the preset list
 * with its metadata. Requires an authenticated user.
 */

import type { PayloadHandler } from 'payload'
import { fetchModelCatalog } from '../lib/model-catalog'
import type { ResolvedPluginConfig } from '../types'

export function createModelsListHandler(config: ResolvedPluginConfig): PayloadHandler {
  return async req => {
    if (!req.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const catalog = config.modelCatalog
    if (!catalog) {
      return Response.json({ error: 'Model catalog is not configured' }, { status: 404 })
    }
    try {
      const presets = await fetchModelCatalog(catalog)
      return Response.json({ presets })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'model catalog unavailable'
      return Response.json({ error: message }, { status: 503 })
    }
  }
}
