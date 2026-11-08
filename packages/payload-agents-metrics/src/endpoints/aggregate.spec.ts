import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import type { ResolvedMetricsConfig } from '../types'
import { createAggregateHandler } from './aggregate'

function baseConfig(overrides: Partial<ResolvedMetricsConfig> = {}): ResolvedMetricsConfig {
  return {
    multiTenant: true,
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
    agnoRunsTable: 'agno.agno_runs',
    ...overrides
  }
}

function makePayload() {
  const execute = vi.fn<(q: unknown) => Promise<{ rows: Record<string, unknown>[] }>>()
  execute.mockResolvedValue({ rows: [] })
  const find = vi.fn(async () => ({ docs: [] }))
  return {
    payload: { db: { drizzle: { execute } }, find },
    execute,
    find
  }
}

function makeReq(url: string, user: { id: number } | null, payloadMock: unknown): PayloadRequest {
  return {
    url,
    user,
    payload: payloadMock,
    headers: new Headers()
  } as unknown as PayloadRequest
}

async function runAndGetGroupBy(config: ResolvedMetricsConfig, url: string): Promise<string[]> {
  const handler = createAggregateHandler(config)
  const { payload } = makePayload()
  const res = await handler(makeReq(url, { id: 1 }, payload))
  const body = await res.json()
  return body.groupBy as string[]
}

describe('createAggregateHandler — groupBy resolution', () => {
  it('defaults to ["tenant"] when multiTenant is true', async () => {
    const groupBy = await runAndGetGroupBy(baseConfig({ multiTenant: true }), 'http://x/aggregate')
    expect(groupBy).toEqual(['tenant'])
  })

  it('defaults to ["agent"] when multiTenant is false (tenant column does not exist)', async () => {
    const groupBy = await runAndGetGroupBy(baseConfig({ multiTenant: false }), 'http://x/aggregate')
    expect(groupBy).toEqual(['agent'])
  })

  it('filters out tenant from the requested groupBy when multiTenant is false', async () => {
    const groupBy = await runAndGetGroupBy(
      baseConfig({ multiTenant: false }),
      'http://x/aggregate?groupBy=tenant,agent,model'
    )
    expect(groupBy).toEqual(['agent', 'model'])
  })

  it('falls back to the default when every requested dimension is stripped', async () => {
    const groupBy = await runAndGetGroupBy(baseConfig({ multiTenant: false }), 'http://x/aggregate?groupBy=tenant')
    expect(groupBy).toEqual(['agent'])
  })

  it('respects the full requested groupBy when multiTenant is true', async () => {
    const groupBy = await runAndGetGroupBy(baseConfig({ multiTenant: true }), 'http://x/aggregate?groupBy=tenant,model')
    expect(groupBy).toEqual(['tenant', 'model'])
  })
})
