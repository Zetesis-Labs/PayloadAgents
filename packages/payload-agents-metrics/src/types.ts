import type { CollectionConfig, Payload, TypedUser } from 'payload'

/**
 * Access check result returned by the consumer's `checkAccess` callback.
 *
 * - `{ allTenants: true }` — user can see all data (superadmin).
 * - `{ tenantIds: [...] }` — user scoped to specific tenants.
 * - `null` — access denied (403).
 */
export type AccessResult = { allTenants: true } | { tenantIds: Array<number | string> } | null

/** Resolves what the current user can see. */
export type CheckAccessFn = (payload: Payload, user: TypedUser) => Promise<AccessResult> | AccessResult

/** Resolves the tenant ID for a given user when persisting usage events. */
export type ResolveTenantIdFn = (payload: Payload, userId: string | number) => Promise<number | string | null>

/** Shared between the multi-tenant and single-tenant variants. */
interface MetricsPluginConfigBase {
  /** Base path for all endpoints. Default: `'/metrics'`. */
  basePath?: string

  /** Shared secret for the ingest endpoint. Default: `env.AGNO_INTERNAL_SECRET || 'dev'`. */
  ingestSecret?: string

  /** Collection slug. Default: `'llm-usage-events'`. */
  collectionSlug?: string

  /** Users collection slug. Default: `'users'`. */
  usersSlug?: string

  /** Tenants collection slug. Default: `'tenants'`. */
  tenantsSlug?: string

  /** Agents collection slug. Default: `'agents'`. */
  agentsSlug?: string

  /** Transform the collection config before registration. */
  collectionOverrides?: (current: CollectionConfig) => CollectionConfig

  /** Extra model pricing (merged with built-in table). `{ input, output }` in USD per token. */
  extraPricing?: Record<string, { input: number; output: number }>

  /**
   * Fully-qualified Agno runs table (one row per run, Agno >= 3) used to resolve
   * conversation detail and first-message previews. Default: `'agno.agno_runs'`.
   * Override if your Agno deployment uses a different schema or table name.
   */
  agnoRunsTable?: string
}

/**
 * Plugin configuration for `metricsPlugin()`.
 *
 * Discriminated union on `multiTenant`. When `multiTenant: true`, both
 * `checkAccess` and `resolveTenantId` are required at the type level —
 * a previous default of `() => null` paired with `multiTenant: true`
 * silently dropped every event.
 *
 * Omitting `multiTenant` (or passing `false`) is single-tenant mode:
 * no tenant column, no tenant filter, no callbacks needed.
 */
export type MetricsPluginConfig =
  | (MetricsPluginConfigBase & {
      multiTenant: true
      /** Called on every read endpoint to determine what the user can see. */
      checkAccess: CheckAccessFn
      /** Called by `onRunCompleted` to resolve the tenant for a usage event. */
      resolveTenantId: ResolveTenantIdFn
    })
  | (MetricsPluginConfigBase & {
      multiTenant?: false
      checkAccess?: never
      resolveTenantId?: never
    })

/** Internal resolved config with all defaults applied. */
export interface ResolvedMetricsConfig {
  multiTenant: boolean
  checkAccess: CheckAccessFn
  resolveTenantId: ResolveTenantIdFn
  basePath: string
  ingestSecret: string
  collectionSlug: string
  usersSlug: string
  tenantsSlug: string
  agentsSlug: string
  collectionOverrides: ((current: CollectionConfig) => CollectionConfig) | undefined
  extraPricing: Record<string, { input: number; output: number }>
  agnoRunsTable: string
}
