import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import type { ResolvedMetricsConfig } from '../types'
import { createIngestHandler } from './ingest'

function baseConfig(overrides: Partial<ResolvedMetricsConfig> = {}): ResolvedMetricsConfig {
  return {
    multiTenant: false,
    checkAccess: async () => ({ allTenants: true }),
    resolveTenantId: async () => null,
    basePath: '/metrics',
    ingestSecret: 'secret-xyz',
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

function makeReq(options: { secret?: string; body: unknown; badJson?: boolean }, payloadMock: unknown): PayloadRequest {
  const headers = new Headers()
  if (options.secret !== undefined) headers.set('x-internal-secret', options.secret)
  return {
    headers,
    json: options.badJson
      ? async () => {
          throw new SyntaxError('bad json')
        }
      : async () => options.body,
    payload: payloadMock
  } as unknown as PayloadRequest
}

function makePayload(
  createImpl: (args: {
    collection: string
    overrideAccess: boolean
    data: Record<string, unknown>
  }) => Promise<{ id: number | string }>
) {
  const create = vi.fn(createImpl)
  return { payload: { create }, create }
}

const validEvent = {
  user: 42,
  provider: 'openai' as const,
  model: 'gpt-4o-mini',
  inputTokens: 100,
  outputTokens: 50
}

describe('createIngestHandler — auth', () => {
  it('rejects with 401 when the secret header is missing', async () => {
    const handler = createIngestHandler(baseConfig())
    const { payload } = makePayload(async () => ({ id: 1 }))
    const res = await handler(makeReq({ body: validEvent }, payload))
    expect(res.status).toBe(401)
  })

  it('rejects with 401 when the secret does not match', async () => {
    const handler = createIngestHandler(baseConfig())
    const { payload } = makePayload(async () => ({ id: 1 }))
    const res = await handler(makeReq({ secret: 'wrong', body: validEvent }, payload))
    expect(res.status).toBe(401)
  })

  it('accepts the request when the secret matches', async () => {
    const handler = createIngestHandler(baseConfig())
    const { payload } = makePayload(async () => ({ id: 1 }))
    const res = await handler(makeReq({ secret: 'secret-xyz', body: validEvent }, payload))
    expect(res.status).toBe(200)
  })
})

describe('createIngestHandler — body parsing', () => {
  it('returns 400 when JSON parsing fails', async () => {
    const handler = createIngestHandler(baseConfig())
    const { payload } = makePayload(async () => ({ id: 1 }))
    const res = await handler(makeReq({ secret: 'secret-xyz', body: null, badJson: true }, payload))
    expect(res.status).toBe(400)
  })
})

describe('createIngestHandler — Zod validation', () => {
  it('returns 422 on invalid event shape', async () => {
    const handler = createIngestHandler(baseConfig())
    const { payload } = makePayload(async () => ({ id: 1 }))
    const res = await handler(
      makeReq({ secret: 'secret-xyz', body: { user: 1, provider: 'nope', model: 'x' } }, payload)
    )
    expect(res.status).toBe(422)
  })

  it('returns 422 on an empty array', async () => {
    const handler = createIngestHandler(baseConfig())
    const { payload } = makePayload(async () => ({ id: 1 }))
    const res = await handler(makeReq({ secret: 'secret-xyz', body: [] }, payload))
    expect(res.status).toBe(422)
  })

  it('returns 422 when the array exceeds 100 items', async () => {
    const handler = createIngestHandler(baseConfig())
    const { payload } = makePayload(async () => ({ id: 1 }))
    const body = Array.from({ length: 101 }, () => validEvent)
    const res = await handler(makeReq({ secret: 'secret-xyz', body }, payload))
    expect(res.status).toBe(422)
  })
})

describe('createIngestHandler — single event happy path', () => {
  it('persists the event and returns { ok: true, id }', async () => {
    const handler = createIngestHandler(baseConfig())
    const { payload, create } = makePayload(async () => ({ id: 77 }))
    const res = await handler(makeReq({ secret: 'secret-xyz', body: validEvent }, payload))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, id: 77 })
    expect(create).toHaveBeenCalledOnce()
  })

  it('derives totalTokens from input+output when not provided', async () => {
    const handler = createIngestHandler(baseConfig())
    const { payload, create } = makePayload(async () => ({ id: 1 }))
    await handler(makeReq({ secret: 'secret-xyz', body: validEvent }, payload))
    const data = create.mock.calls[0]?.[0]?.data
    expect(data?.totalTokens).toBe(150)
  })

  it('uses an explicit totalTokens when the caller provides it', async () => {
    const handler = createIngestHandler(baseConfig())
    const { payload, create } = makePayload(async () => ({ id: 1 }))
    await handler(makeReq({ secret: 'secret-xyz', body: { ...validEvent, totalTokens: 999 } }, payload))
    expect(create.mock.calls[0]?.[0]?.data?.totalTokens).toBe(999)
  })

  it('computes costUsd via the pricing table when not provided', async () => {
    const handler = createIngestHandler(baseConfig())
    const { payload, create } = makePayload(async () => ({ id: 1 }))
    // gpt-4o-mini: input $0.15/M, output $0.60/M → 100*0.15e-6 + 50*0.60e-6 = ~4.5e-5
    await handler(makeReq({ secret: 'secret-xyz', body: validEvent }, payload))
    expect(create.mock.calls[0]?.[0]?.data?.costUsd).toBeCloseTo(4.5e-5, 10)
    expect(create.mock.calls[0]?.[0]?.data?.costSource).toBe('table')
  })

  it('uses an explicit costUsd when the caller provides it (including 0)', async () => {
    const handler = createIngestHandler(baseConfig())
    const { payload, create } = makePayload(async () => ({ id: 1 }))
    await handler(makeReq({ secret: 'secret-xyz', body: { ...validEvent, costUsd: 0 } }, payload))
    expect(create.mock.calls[0]?.[0]?.data?.costUsd).toBe(0)
    // An explicit cost is the gateway's real figure.
    expect(create.mock.calls[0]?.[0]?.data?.costSource).toBe('gateway')
  })

  it('honours an explicit costSource override', async () => {
    const handler = createIngestHandler(baseConfig())
    const { payload, create } = makePayload(async () => ({ id: 1 }))
    await handler(makeReq({ secret: 'secret-xyz', body: { ...validEvent, costSource: 'gateway' } }, payload))
    expect(create.mock.calls[0]?.[0]?.data?.costSource).toBe('gateway')
  })

  it('defaults completedAt to now when not provided', async () => {
    const handler = createIngestHandler(baseConfig())
    const { payload, create } = makePayload(async () => ({ id: 1 }))
    await handler(makeReq({ secret: 'secret-xyz', body: validEvent }, payload))
    expect(create.mock.calls[0]?.[0]?.data?.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('createIngestHandler — multi-tenant', () => {
  it('calls resolveTenantId when multiTenant=true and no tenant in the event', async () => {
    const resolveTenantId = vi.fn(async () => 7)
    const handler = createIngestHandler(baseConfig({ multiTenant: true, resolveTenantId }))
    const { payload, create } = makePayload(async () => ({ id: 1 }))
    await handler(makeReq({ secret: 'secret-xyz', body: validEvent }, payload))
    expect(resolveTenantId).toHaveBeenCalledOnce()
    expect(create.mock.calls[0]?.[0]?.data?.tenant).toBe(7)
  })

  it('fails the event with 422 when multiTenant and tenant cannot be resolved', async () => {
    const handler = createIngestHandler(baseConfig({ multiTenant: true, resolveTenantId: async () => null }))
    const { payload, create } = makePayload(async () => ({ id: 1 }))
    const res = await handler(makeReq({ secret: 'secret-xyz', body: validEvent }, payload))
    expect(res.status).toBe(422)
    expect(create).not.toHaveBeenCalled()
  })

  it('prefers an explicit event.tenant over resolveTenantId', async () => {
    const resolveTenantId = vi.fn(async () => 7)
    const handler = createIngestHandler(baseConfig({ multiTenant: true, resolveTenantId }))
    const { payload, create } = makePayload(async () => ({ id: 1 }))
    await handler(makeReq({ secret: 'secret-xyz', body: { ...validEvent, tenant: 3 } }, payload))
    expect(resolveTenantId).not.toHaveBeenCalled()
    expect(create.mock.calls[0]?.[0]?.data?.tenant).toBe(3)
  })

  it('omits tenant from the persisted data when multiTenant=false', async () => {
    const handler = createIngestHandler(baseConfig({ multiTenant: false }))
    const { payload, create } = makePayload(async () => ({ id: 1 }))
    await handler(makeReq({ secret: 'secret-xyz', body: validEvent }, payload))
    expect(create.mock.calls[0]?.[0]?.data?.tenant).toBeUndefined()
  })
})

describe('createIngestHandler — batch events', () => {
  it('persists every event and returns { ok: true, ids }', async () => {
    const handler = createIngestHandler(baseConfig())
    let next = 0
    const { payload, create } = makePayload(async () => ({ id: ++next }))
    const body = [validEvent, validEvent, validEvent]
    const res = await handler(makeReq({ secret: 'secret-xyz', body }, payload))
    expect(res.status).toBe(200)
    const parsed = await res.json()
    expect(parsed.ok).toBe(true)
    expect(parsed.ids).toEqual([1, 2, 3])
    expect(create).toHaveBeenCalledTimes(3)
  })

  it('surfaces partial failures in the response without dropping successful ids', async () => {
    const handler = createIngestHandler(
      baseConfig({ multiTenant: true, resolveTenantId: async (_, uid) => (uid === 2 ? null : 1) })
    )
    let next = 0
    const { payload } = makePayload(async () => ({ id: ++next }))
    const body = [
      { ...validEvent, user: 1 },
      { ...validEvent, user: 2 }, // will fail: tenant unresolved
      { ...validEvent, user: 3 }
    ]
    const res = await handler(makeReq({ secret: 'secret-xyz', body }, payload))
    expect(res.status).toBe(200)
    const parsed = await res.json()
    expect(parsed.ok).toBe(true)
    expect(parsed.ids).toHaveLength(2)
    expect(parsed.failures).toHaveLength(1)
  })

  it('returns 422 when every event in the array fails', async () => {
    const handler = createIngestHandler(baseConfig({ multiTenant: true, resolveTenantId: async () => null }))
    const { payload } = makePayload(async () => ({ id: 1 }))
    const body = [validEvent, validEvent]
    const res = await handler(makeReq({ secret: 'secret-xyz', body }, payload))
    expect(res.status).toBe(422)
  })
})

describe('createIngestHandler — payload.create failures', () => {
  it('surfaces a DB error as a per-event failure instead of crashing the whole batch', async () => {
    const handler = createIngestHandler(baseConfig())
    let call = 0
    const { payload } = makePayload(async () => {
      call += 1
      if (call === 2) throw new Error('duplicate key value violates unique constraint')
      return { id: call }
    })
    const body = [validEvent, validEvent, validEvent]
    const res = await handler(makeReq({ secret: 'secret-xyz', body }, payload))
    // If ingest doesn't catch payload.create rejections, Promise.all rejects
    // and the handler either 500s or throws — not this structured 200 body.
    expect(res.status).toBe(200)
    const parsed = await res.json()
    expect(parsed.ok).toBe(true)
    expect(parsed.ids).toHaveLength(2)
    expect(parsed.failures).toHaveLength(1)
  })
})
