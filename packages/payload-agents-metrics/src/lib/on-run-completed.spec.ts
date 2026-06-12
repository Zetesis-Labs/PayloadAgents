import type { Payload } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResolvedMetricsConfig } from '../types'
import { createOnRunCompleted } from './on-run-completed'

function makePayload() {
  const create =
    vi.fn<
      (args: { collection: string; overrideAccess: boolean; data: Record<string, unknown> }) => Promise<{ id: number }>
    >()
  create.mockResolvedValue({ id: 1 })
  const payload = { create } as unknown as Payload
  return { payload, create }
}

function baseConfig(overrides: Partial<ResolvedMetricsConfig> = {}): ResolvedMetricsConfig {
  return {
    multiTenant: false,
    checkAccess: async () => ({ allTenants: true }),
    resolveTenantId: async () => null,
    basePath: '/metrics',
    ingestSecret: 'dev',
    collectionSlug: 'llm-usage-events',
    usersSlug: 'users',
    tenantsSlug: 'tenants',
    agentsSlug: 'agents',
    collectionOverrides: undefined,
    extraPricing: {},
    agnoSessionsTable: 'agno.agno_sessions',
    ...overrides
  }
}

const baseCtx = {
  userId: 42,
  agentSlug: 'bastos',
  sessionId: 'session-abc',
  metrics: {}
}

describe('onRunCompleted — provider & model resolution', () => {
  it('parses the "provider/model" form of ctx.llmModel', async () => {
    const hook = createOnRunCompleted(baseConfig())
    const { payload, create } = makePayload()
    await hook({ ...baseCtx, llmModel: 'openai/gpt-4o', metrics: {} }, payload)
    expect(create).toHaveBeenCalledOnce()
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.provider).toBe('openai')
    expect(data?.model).toBe('gpt-4o')
  })

  it('falls back to metrics.details.model[0] when ctx.llmModel is not prefixed', async () => {
    const hook = createOnRunCompleted(baseConfig())
    const { payload, create } = makePayload()
    await hook(
      {
        ...baseCtx,
        llmModel: 'gpt-4o',
        metrics: { details: { model: [{ id: 'gpt-4o', provider: 'openai' }] } }
      },
      payload
    )
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.provider).toBe('openai')
    expect(data?.model).toBe('gpt-4o')
  })

  it('uses metrics.details.model[0] entirely when ctx.llmModel is absent', async () => {
    const hook = createOnRunCompleted(baseConfig())
    const { payload, create } = makePayload()
    await hook(
      {
        ...baseCtx,
        metrics: { details: { model: [{ id: 'claude-sonnet-4-6', provider: 'anthropic' }] } }
      },
      payload
    )
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.provider).toBe('anthropic')
    expect(data?.model).toBe('claude-sonnet-4-6')
  })

  it('skips persistence when the provider cannot be normalised', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const hook = createOnRunCompleted(baseConfig())
    const { payload, create } = makePayload()
    await hook({ ...baseCtx, llmModel: 'mistral/any', metrics: {} }, payload)
    expect(create).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('onRunCompleted — tokens', () => {
  it('prefers detail-level token counts over metrics-level counts', async () => {
    const hook = createOnRunCompleted(baseConfig())
    const { payload, create } = makePayload()
    await hook(
      {
        ...baseCtx,
        llmModel: 'openai/gpt-4o-mini',
        metrics: {
          input_tokens: 999,
          output_tokens: 999,
          details: {
            model: [
              { id: 'gpt-4o-mini', provider: 'openai', input_tokens: 100, output_tokens: 50, cache_read_tokens: 20 }
            ]
          }
        }
      },
      payload
    )
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.inputTokens).toBe(100)
    expect(data?.outputTokens).toBe(50)
    expect(data?.cachedInputTokens).toBe(20)
  })

  it('falls back to metrics-level token counts when the detail has none', async () => {
    const hook = createOnRunCompleted(baseConfig())
    const { payload, create } = makePayload()
    await hook(
      { ...baseCtx, llmModel: 'openai/gpt-4o-mini', metrics: { input_tokens: 70, output_tokens: 30 } },
      payload
    )
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.inputTokens).toBe(70)
    expect(data?.outputTokens).toBe(30)
    expect(data?.cachedInputTokens).toBe(0)
  })

  it('uses explicit metrics.total_tokens when provided', async () => {
    const hook = createOnRunCompleted(baseConfig())
    const { payload, create } = makePayload()
    await hook(
      {
        ...baseCtx,
        llmModel: 'openai/gpt-4o-mini',
        metrics: { input_tokens: 10, output_tokens: 5, total_tokens: 123 }
      },
      payload
    )
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.totalTokens).toBe(123)
  })

  it('derives total_tokens from input+output when not provided', async () => {
    const hook = createOnRunCompleted(baseConfig())
    const { payload, create } = makePayload()
    await hook({ ...baseCtx, llmModel: 'openai/gpt-4o-mini', metrics: { input_tokens: 10, output_tokens: 5 } }, payload)
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.totalTokens).toBe(15)
  })

  it('defaults every token count to 0 when metrics are empty', async () => {
    const hook = createOnRunCompleted(baseConfig())
    const { payload, create } = makePayload()
    await hook({ ...baseCtx, llmModel: 'openai/gpt-4o-mini', metrics: {} }, payload)
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.inputTokens).toBe(0)
    expect(data?.outputTokens).toBe(0)
    expect(data?.cachedInputTokens).toBe(0)
    expect(data?.totalTokens).toBe(0)
  })
})

describe('onRunCompleted — latency & cost', () => {
  it('converts metrics.duration (seconds) into latencyMs (rounded)', async () => {
    const hook = createOnRunCompleted(baseConfig())
    const { payload, create } = makePayload()
    await hook({ ...baseCtx, llmModel: 'openai/gpt-4o-mini', metrics: { duration: 1.2345 } }, payload)
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.latencyMs).toBe(1235)
  })

  it('leaves latencyMs undefined when duration is missing', async () => {
    const hook = createOnRunCompleted(baseConfig())
    const { payload, create } = makePayload()
    await hook({ ...baseCtx, llmModel: 'openai/gpt-4o-mini', metrics: {} }, payload)
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.latencyMs).toBeUndefined()
  })

  it('computes costUsd from provider/model + token counts', async () => {
    const hook = createOnRunCompleted(baseConfig())
    const { payload, create } = makePayload()
    // gpt-4o-mini: input $0.15/M, output $0.60/M — 1M+1M = 0.75
    await hook(
      {
        ...baseCtx,
        llmModel: 'openai/gpt-4o-mini',
        metrics: { input_tokens: 1_000_000, output_tokens: 1_000_000 }
      },
      payload
    )
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.costUsd).toBeCloseTo(0.75, 6)
    expect(data?.costSource).toBe('table')
  })

  it('honours extraPricing for custom models', async () => {
    const hook = createOnRunCompleted(baseConfig({ extraPricing: { 'gpt-4o-mini': { input: 1, output: 2 } } }))
    const { payload, create } = makePayload()
    await hook({ ...baseCtx, llmModel: 'openai/gpt-4o-mini', metrics: { input_tokens: 1, output_tokens: 1 } }, payload)
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.costUsd).toBe(3)
  })

  it('prefers the gateway run-level cost over the pricing table', async () => {
    const hook = createOnRunCompleted(baseConfig())
    const { payload, create } = makePayload()
    await hook(
      {
        ...baseCtx,
        llmModel: 'openai/gpt-4o-mini',
        // The table would say 0.75; the gateway's real figure wins.
        metrics: { input_tokens: 1_000_000, output_tokens: 1_000_000, cost: 0.123456 }
      },
      payload
    )
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.costUsd).toBe(0.123456)
    expect(data?.costSource).toBe('gateway')
  })

  it('sums per-model gateway costs when no run-level cost is present', async () => {
    const hook = createOnRunCompleted(baseConfig())
    const { payload, create } = makePayload()
    await hook(
      {
        ...baseCtx,
        llmModel: 'openai/gpt-4o-mini',
        metrics: {
          details: {
            model: [
              { id: 'gpt-4o-mini', provider: 'openai', input_tokens: 10, output_tokens: 5, cost: 0.002 },
              { id: 'gpt-4o-mini', provider: 'openai', input_tokens: 20, output_tokens: 8, cost: 0.003 }
            ]
          }
        }
      },
      payload
    )
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.costUsd).toBeCloseTo(0.005, 10)
    expect(data?.costSource).toBe('gateway')
  })

  it('keeps a reported gateway cost of 0 instead of falling back to the table', async () => {
    const hook = createOnRunCompleted(baseConfig())
    const { payload, create } = makePayload()
    await hook(
      {
        ...baseCtx,
        llmModel: 'openai/gpt-4o-mini',
        metrics: { input_tokens: 1_000_000, output_tokens: 1_000_000, cost: 0 }
      },
      payload
    )
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.costUsd).toBe(0)
    expect(data?.costSource).toBe('gateway')
  })

  it('falls back to the table when the gateway cost is not a finite number', async () => {
    const hook = createOnRunCompleted(baseConfig())
    const { payload, create } = makePayload()
    await hook(
      {
        ...baseCtx,
        llmModel: 'openai/gpt-4o-mini',
        metrics: { input_tokens: 1_000_000, output_tokens: 1_000_000, cost: null }
      },
      payload
    )
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.costUsd).toBeCloseTo(0.75, 6)
    expect(data?.costSource).toBe('table')
  })
})

describe('onRunCompleted — tenant resolution', () => {
  it('does not call resolveTenantId when multiTenant is false', async () => {
    const resolveTenantId = vi.fn(async () => null)
    const hook = createOnRunCompleted(baseConfig({ multiTenant: false, resolveTenantId }))
    const { payload, create } = makePayload()
    await hook({ ...baseCtx, llmModel: 'openai/gpt-4o-mini', metrics: {} }, payload)
    expect(resolveTenantId).not.toHaveBeenCalled()
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.tenant).toBeUndefined()
  })

  it('includes the resolved tenant in the persisted event when multiTenant is true', async () => {
    const hook = createOnRunCompleted(baseConfig({ multiTenant: true, resolveTenantId: async () => 7 }))
    const { payload, create } = makePayload()
    await hook({ ...baseCtx, llmModel: 'openai/gpt-4o-mini', metrics: {} }, payload)
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.tenant).toBe(7)
  })

  it('skips persistence when the tenant cannot be resolved in multi-tenant mode', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const hook = createOnRunCompleted(baseConfig({ multiTenant: true, resolveTenantId: async () => null }))
    const { payload, create } = makePayload()
    await hook({ ...baseCtx, llmModel: 'openai/gpt-4o-mini', metrics: {} }, payload)
    expect(create).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('onRunCompleted — persistence shape', () => {
  it('writes to the configured collection with overrideAccess', async () => {
    const hook = createOnRunCompleted(baseConfig({ collectionSlug: 'custom-events' }))
    const { payload, create } = makePayload()
    await hook({ ...baseCtx, llmModel: 'openai/gpt-4o-mini', metrics: {} }, payload)
    const call = create.mock.calls[0]?.[0]
    expect(call?.collection).toBe('custom-events')
    expect(call?.overrideAccess).toBe(true)
  })

  it('carries ctx fields (user, agentSlug, conversationId, runId, apiKeyFingerprint)', async () => {
    const hook = createOnRunCompleted(baseConfig())
    const { payload, create } = makePayload()
    await hook(
      {
        ...baseCtx,
        llmModel: 'openai/gpt-4o-mini',
        runId: 'run-123',
        apiKeyFingerprint: 'ABCD',
        metrics: {}
      },
      payload
    )
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.user).toBe(42)
    expect(data?.agentSlug).toBe('bastos')
    expect(data?.conversationId).toBe('session-abc')
    expect(data?.runId).toBe('run-123')
    expect(data?.apiKeyFingerprint).toBe('ABCD')
    expect(data?.status).toBe('success')
    expect(data?.apiKeySource).toBe('agent')
  })

  it('stamps completedAt as an ISO string', async () => {
    const hook = createOnRunCompleted(baseConfig())
    const { payload, create } = makePayload()
    await hook({ ...baseCtx, llmModel: 'openai/gpt-4o-mini', metrics: {} }, payload)
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})

describe('onRunCompleted — error handling', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('does not propagate when payload.create throws', async () => {
    const hook = createOnRunCompleted(baseConfig())
    const payload = {
      create: vi.fn(async () => {
        throw new Error('db down')
      })
    } as unknown as Payload
    await expect(hook({ ...baseCtx, llmModel: 'openai/gpt-4o-mini', metrics: {} }, payload)).resolves.toBeUndefined()
  })
})
