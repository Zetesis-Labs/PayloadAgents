export interface LiteLlmAdminSettings {
  gatewayUrl: string
  masterKey: string
}

export interface LiteLlmVirtualKeyPayload {
  keyAlias: string
  models: string[]
  metadata: Record<string, unknown>
  maxBudget?: number
  budgetDuration?: string
  rpmLimit?: number
  tpmLimit?: number
}

export interface LiteLlmGeneratedKey {
  key: string
}

export interface LiteLlmModelPayload {
  modelName: string
  model: string
  modelInfo?: Record<string, unknown>
}

export interface LiteLlmMcpServerPayload {
  /** Stable id; also the `/{alias}/mcp` gateway path segment. */
  alias: string
  serverName: string
  description?: string
  transport: string
  url: string
  /** Client headers LiteLLM forwards to the MCP (`extra_headers`). */
  extraHeaders?: string[]
  /** When true, any virtual key can use this server (no per-key grant needed). */
  allowAllKeys?: boolean
  mcpInfo?: Record<string, unknown>
}

/** Shape of an MCP server as returned by GET /v1/mcp/server (loosely typed). */
export interface LiteLlmMcpServer {
  server_id: string
  alias?: string
  mcp_info?: { source?: string; env?: string } | null
}

/** Error carrying the HTTP status + raw body so callers can react to specific failures. */
export class LiteLlmRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message: string
  ) {
    super(message)
    this.name = 'LiteLlmRequestError'
  }
}

/**
 * True when a `/key/generate` failed because the alias is already taken. LiteLLM
 * answers 400 with a body like `Key with alias 'agent/x' already exists. Unique
 * key aliases across all keys are required.` This is the divergence signal
 * (Payload has no key, LiteLLM does) that `generateKey` self-heals.
 */
function isAliasConflict(error: unknown): boolean {
  if (!(error instanceof LiteLlmRequestError) || error.status !== 400) return false
  return /already exists/i.test(error.body) && /alias/i.test(error.body)
}

function toApiPayload(payload: LiteLlmVirtualKeyPayload, key?: string): Record<string, unknown> {
  const isUpdate = key !== undefined
  const result: Record<string, unknown> = {
    ...(key ? { key } : {}),
    key_alias: payload.keyAlias,
    models: payload.models,
    metadata: payload.metadata
  }
  // On update, an unset limit becomes explicit null so LiteLLM clears a
  // previously-set value — /key/update is a partial PATCH, so an omitted field
  // would otherwise keep the old limit live. On generate, an unset limit is
  // simply omitted.
  const limits: Record<string, number | string | undefined> = {
    max_budget: payload.maxBudget,
    budget_duration: payload.budgetDuration || undefined,
    rpm_limit: payload.rpmLimit,
    tpm_limit: payload.tpmLimit
  }
  for (const [apiField, value] of Object.entries(limits)) {
    if (value !== undefined) result[apiField] = value
    else if (isUpdate) result[apiField] = null
  }
  return result
}

function toModelApiPayload(payload: LiteLlmModelPayload): Record<string, unknown> {
  return {
    model_name: payload.modelName,
    litellm_params: { model: payload.model },
    ...(payload.modelInfo ? { model_info: payload.modelInfo } : {})
  }
}

function toMcpApiPayload(payload: LiteLlmMcpServerPayload): Record<string, unknown> {
  return {
    alias: payload.alias,
    server_name: payload.serverName,
    ...(payload.description ? { description: payload.description } : {}),
    transport: payload.transport,
    url: payload.url,
    extra_headers: payload.extraHeaders ?? [],
    allow_all_keys: payload.allowAllKeys ?? false,
    // Marks this server as Payload-managed so reconciliation never touches
    // servers an admin added directly in LiteLLM.
    mcp_info: { source: 'payload', ...(payload.mcpInfo ?? {}) }
  }
}

export class LiteLlmAdminClient {
  private readonly gatewayUrl: string
  private readonly masterKey: string

  constructor(settings: LiteLlmAdminSettings) {
    this.gatewayUrl = settings.gatewayUrl.replace(/\/$/, '')
    this.masterKey = settings.masterKey
  }

  private async request<T>(path: string, body?: Record<string, unknown>, method = 'POST'): Promise<T> {
    const res = await fetch(`${this.gatewayUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.masterKey}`,
        'Content-Type': 'application/json'
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      // Bound the request: a hung gateway must not block boot or token/key syncs.
      signal: AbortSignal.timeout(15_000)
    })
    if (!res.ok) {
      // Keep the raw upstream body on `.body` (used for self-heal + server-side
      // logging) but NOT in the user-facing message — it surfaces to token
      // owners via the synced error field and the /mcp-servers endpoint.
      const body = await res.text().catch(() => '')
      throw new LiteLlmRequestError(res.status, body, `LiteLLM ${path} failed: HTTP ${res.status}`)
    }
    return (await res.json()) as T
  }

  /**
   * Mint a virtual key. Self-heals the one non-retryable failure mode: an alias
   * collision. When Payload has no key for this agent but LiteLLM already holds
   * one under `agent/<slug>` (DB restore, agent recreated with the same slug, or
   * a prior generate whose persist failed leaving a blocked key), `/key/generate`
   * 400s forever. The alias uniquely identifies one agent (slug is unique), so
   * the colliding key is necessarily an orphan — reclaim the alias by deleting it
   * and regenerate. Bounded to a single retry so a genuine error still surfaces.
   */
  async generateKey(payload: LiteLlmVirtualKeyPayload): Promise<LiteLlmGeneratedKey> {
    try {
      return await this.generateKeyOnce(payload)
    } catch (error) {
      if (!isAliasConflict(error)) throw error
      await this.deleteKeysByAlias([payload.keyAlias])
      return await this.generateKeyOnce(payload)
    }
  }

  private async generateKeyOnce(payload: LiteLlmVirtualKeyPayload): Promise<LiteLlmGeneratedKey> {
    const body = await this.request<Record<string, unknown>>('/key/generate', toApiPayload(payload))
    const key = body.key
    if (typeof key !== 'string' || !key) throw new Error('LiteLLM /key/generate did not return a key')
    return { key }
  }

  /** Delete keys by their aliases (used to reclaim an orphaned alias before regenerating). */
  async deleteKeysByAlias(aliases: string[]): Promise<void> {
    if (aliases.length === 0) return
    await this.request<Record<string, unknown>>('/key/delete', { key_aliases: aliases })
  }

  async updateKey(key: string, payload: LiteLlmVirtualKeyPayload): Promise<void> {
    await this.request<Record<string, unknown>>('/key/update', toApiPayload(payload, key))
  }

  async blockKey(key: string): Promise<void> {
    await this.request<Record<string, unknown>>('/key/block', { key })
  }

  async listModelNames(): Promise<Set<string>> {
    const body = await this.request<{ data?: Array<{ model_name?: unknown }> }>('/model/info', undefined, 'GET')
    const names = new Set<string>()
    for (const item of body.data ?? []) {
      if (typeof item.model_name === 'string') names.add(item.model_name)
    }
    return names
  }

  async createModel(payload: LiteLlmModelPayload): Promise<void> {
    await this.request<Record<string, unknown>>('/model/new', toModelApiPayload(payload))
  }

  async bootstrapModels(models: LiteLlmModelPayload[]): Promise<{ created: number; existing: number }> {
    const existingModels = await this.listModelNames()
    let created = 0
    for (const model of models) {
      if (existingModels.has(model.modelName)) continue
      await this.createModel(model)
      existingModels.add(model.modelName)
      created += 1
    }
    return { created, existing: existingModels.size - created }
  }

  // === MCP servers ===

  async listMcpServers(): Promise<LiteLlmMcpServer[]> {
    const body = await this.request<LiteLlmMcpServer[] | { data?: LiteLlmMcpServer[] }>(
      '/v1/mcp/server',
      undefined,
      'GET'
    )
    return Array.isArray(body) ? body : (body.data ?? [])
  }

  /**
   * Create an MCP server. Unlike `generateKey`, this deliberately does NOT
   * self-heal an alias conflict: a key alias (`agent/<slug>`) is unambiguously
   * Payload-owned, but an MCP alias may belong to an admin-added server or to
   * another environment's managed server — reclaiming it would delete something
   * we promised not to touch. Known limitation: the alias is the global
   * `/{alias}/mcp` gateway path, so two deployments sharing one LiteLLM cannot
   * both register the same alias; that needs per-environment alias prefixing,
   * not a reclaim. Single-deployment setups never hit this.
   */
  async createMcpServer(payload: LiteLlmMcpServerPayload): Promise<void> {
    await this.request('/v1/mcp/server', toMcpApiPayload(payload), 'POST')
  }

  async updateMcpServer(serverId: string, payload: LiteLlmMcpServerPayload): Promise<void> {
    await this.request('/v1/mcp/server', { server_id: serverId, ...toMcpApiPayload(payload) }, 'PUT')
  }

  async deleteMcpServer(serverId: string): Promise<void> {
    await this.request(`/v1/mcp/server/${serverId}`, undefined, 'DELETE')
  }

  /**
   * Reconcile the Payload-managed MCP servers in LiteLLM to match `servers`
   * (matched by alias). Creates missing ones, updates existing ones, and—when
   * `prune`—removes Payload-managed servers no longer present. Servers an admin
   * added directly (no `mcp_info.source === 'payload'`) are never touched.
   *
   * `environment` makes prune safe when several deployments share one LiteLLM:
   * managed servers are tagged with it, and reconciliation only adopts/prunes
   * servers of THIS environment (untagged legacy servers are adopted on first
   * sync, so they migrate forward). Without it, all Payload-managed servers are
   * in scope — fine for a single deployment, unsafe for a shared gateway.
   */
  async syncMcpServers(
    servers: LiteLlmMcpServerPayload[],
    opts: { prune?: boolean; environment?: string } = {}
  ): Promise<{ created: number; updated: number; deleted: number }> {
    const { prune = false, environment } = opts
    const existing = await this.listMcpServers()
    const managed = new Map<string, LiteLlmMcpServer>()
    for (const server of existing) {
      if (server.mcp_info?.source !== 'payload' || !server.alias) continue
      // Scope to this environment: skip servers explicitly tagged for another.
      // Untagged (env == null) servers are adopted and re-tagged on update.
      const env = server.mcp_info?.env
      if (environment != null && env != null && env !== environment) continue
      managed.set(server.alias, server)
    }

    const tag = (server: LiteLlmMcpServerPayload): LiteLlmMcpServerPayload =>
      environment ? { ...server, mcpInfo: { ...(server.mcpInfo ?? {}), env: environment } } : server

    let created = 0
    let updated = 0
    for (const server of servers) {
      const found = managed.get(server.alias)
      if (found) {
        await this.updateMcpServer(found.server_id, tag(server))
        updated += 1
      } else {
        await this.createMcpServer(tag(server))
        created += 1
      }
      managed.delete(server.alias)
    }

    let deleted = 0
    if (prune) {
      for (const orphan of managed.values()) {
        await this.deleteMcpServer(orphan.server_id)
        deleted += 1
      }
    }

    return { created, updated, deleted }
  }
}
