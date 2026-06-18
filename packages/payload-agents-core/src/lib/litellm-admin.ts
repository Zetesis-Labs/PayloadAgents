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
      ...(body ? { body: JSON.stringify(body) } : {})
    })
    if (!res.ok) {
      const message = await res.text().catch(() => '')
      throw new Error(`LiteLLM ${path} failed: HTTP ${res.status}${message ? ` ${message}` : ''}`)
    }
    return (await res.json()) as T
  }

  async generateKey(payload: LiteLlmVirtualKeyPayload): Promise<LiteLlmGeneratedKey> {
    const body = await this.request<Record<string, unknown>>('/key/generate', toApiPayload(payload))
    const key = body.key
    if (typeof key !== 'string' || !key) throw new Error('LiteLLM /key/generate did not return a key')
    return { key }
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
}
