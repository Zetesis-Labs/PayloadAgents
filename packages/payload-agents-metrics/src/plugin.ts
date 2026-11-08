import type { Config, Plugin } from 'payload'
import { createLlmUsageEventsCollection } from './collections/llm-usage-events'
import { createAggregateHandler } from './endpoints/aggregate'
import { createFilterOptionsHandler } from './endpoints/filter-options'
import { createIngestHandler } from './endpoints/ingest'
import { createSessionDetailHandler } from './endpoints/session-detail'
import { createSessionsHandler } from './endpoints/sessions'
import { createOnRunCompleted } from './lib/on-run-completed'
import type { MetricsPluginConfig, ResolvedMetricsConfig } from './types'

/**
 * Default access in single-tenant mode: any authenticated user reads everything.
 * Only used when `multiTenant` is `false` (or omitted) — the discriminated
 * union forces real callbacks when `multiTenant: true`.
 */
const defaultCheckAccess = async (): Promise<{ allTenants: true }> => ({ allTenants: true })

/**
 * Default tenant resolver in single-tenant mode: returns null (no tenant).
 * Safe because in single-tenant mode the `tenant` field is not added to the
 * collection and the ingest path skips tenant resolution entirely.
 */
const defaultResolveTenantId = async (): Promise<null> => null

function resolveConfig(userConfig: MetricsPluginConfig): ResolvedMetricsConfig {
  // Default to single-tenant mode. Multi-tenant is opt-in via `multiTenant: true`,
  // which the discriminated union pairs with required `checkAccess` + `resolveTenantId`.
  const multiTenant = userConfig.multiTenant === true
  return {
    multiTenant,
    checkAccess: userConfig.checkAccess ?? defaultCheckAccess,
    resolveTenantId: userConfig.resolveTenantId ?? defaultResolveTenantId,
    basePath: userConfig.basePath ?? '/metrics',
    ingestSecret: userConfig.ingestSecret ?? process.env.AGNO_INTERNAL_SECRET ?? 'dev',
    collectionSlug: userConfig.collectionSlug ?? 'llm-usage-events',
    usersSlug: userConfig.usersSlug ?? 'users',
    tenantsSlug: userConfig.tenantsSlug ?? 'tenants',
    agentsSlug: userConfig.agentsSlug ?? 'agents',
    collectionOverrides: userConfig.collectionOverrides,
    extraPricing: userConfig.extraPricing ?? {},
    agnoRunsTable: userConfig.agnoRunsTable ?? 'agno.agno_runs'
  }
}

/**
 * Return type of `metricsPlugin()`. Exported so downstream packages that
 * re-export the wrapped plugin can name it; otherwise TS bails with TS4023.
 */
export interface MetricsPluginResult extends Plugin {
  /** Callback for `agentPlugin({ onRunCompleted })`. */
  onRunCompleted: ReturnType<typeof createOnRunCompleted>
}

export function metricsPlugin(userConfig: MetricsPluginConfig): MetricsPluginResult {
  const config = resolveConfig(userConfig)
  const basePath = config.basePath

  const plugin = ((incomingConfig: Config): Config => {
    const collection = createLlmUsageEventsCollection(config)

    const endpoints = [
      { path: `${basePath}/ingest`, method: 'post' as const, handler: createIngestHandler(config) },
      { path: `${basePath}/aggregate`, method: 'get' as const, handler: createAggregateHandler(config) },
      { path: `${basePath}/sessions`, method: 'get' as const, handler: createSessionsHandler(config) },
      { path: `${basePath}/session`, method: 'get' as const, handler: createSessionDetailHandler(config) },
      { path: `${basePath}/filter-options`, method: 'get' as const, handler: createFilterOptionsHandler(config) }
    ]

    return {
      ...incomingConfig,
      collections: [...(incomingConfig.collections ?? []), collection],
      endpoints: [...(incomingConfig.endpoints ?? []), ...endpoints]
    }
  }) as MetricsPluginResult

  plugin.onRunCompleted = createOnRunCompleted(config)

  return plugin
}
