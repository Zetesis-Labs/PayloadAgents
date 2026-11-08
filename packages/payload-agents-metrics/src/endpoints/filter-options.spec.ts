import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import type { ResolvedMetricsConfig } from '../types'
import { createFilterOptionsHandler } from './filter-options'

const dialect = new PgDialect()

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
    agnoRunsTable: 'agno.agno_runs',
    ...overrides
  }
}

function makeReq(
  url: string,
  user: { id: number } | null,
  findMock: ReturnType<typeof vi.fn>,
  executeMock?: ReturnType<typeof vi.fn>
): PayloadRequest {
  const execute = executeMock ?? vi.fn(async () => ({ rows: [] }))
  return {
    url,
    user,
    payload: {
      find: findMock,
      db: { drizzle: { execute } }
    },
    headers: new Headers()
  } as unknown as PayloadRequest
}

describe('createFilterOptionsHandler', () => {
  it('returns 401 when unauthenticated', async () => {
    const handler = createFilterOptionsHandler(baseConfig())
    const find = vi.fn()
    const res = await handler(makeReq('http://x/filter-options?field=agent', null, find))
    expect(res.status).toBe(401)
    expect(find).not.toHaveBeenCalled()
  })

  it('returns 403 when checkAccess returns falsy', async () => {
    const handler = createFilterOptionsHandler(
      baseConfig({ checkAccess: async () => null as unknown as { allTenants: true } })
    )
    const find = vi.fn()
    const res = await handler(makeReq('http://x/filter-options?field=agent', { id: 1 }, find))
    expect(res.status).toBe(403)
    expect(find).not.toHaveBeenCalled()
  })

  it('returns 400 for unknown field', async () => {
    const handler = createFilterOptionsHandler(baseConfig())
    const find = vi.fn()
    const res = await handler(makeReq('http://x/filter-options?field=unknown', { id: 1 }, find))
    expect(res.status).toBe(400)
  })

  it('returns 400 when field is missing', async () => {
    const handler = createFilterOptionsHandler(baseConfig())
    const find = vi.fn()
    const res = await handler(makeReq('http://x/filter-options', { id: 1 }, find))
    expect(res.status).toBe(400)
  })

  it('returns 200 with options on happy path', async () => {
    const handler = createFilterOptionsHandler(baseConfig())
    const find = vi.fn(async () => ({ docs: [{ slug: 'a', name: 'A' }] }))
    const res = await handler(makeReq('http://x/filter-options?field=agent&q=a', { id: 1 }, find))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { options: Array<{ label: string; value: string }>; hasMore: boolean }
    expect(body).toEqual({ options: [{ label: 'A (a)', value: 'a' }], hasMore: false })
  })

  it('forwards tenantId query param to scoped SQL for field=model', async () => {
    const handler = createFilterOptionsHandler(
      baseConfig({ multiTenant: true, checkAccess: async () => ({ allTenants: true }) })
    )
    const find = vi.fn()
    const execute = vi.fn(async () => ({ rows: [] }))
    const res = await handler(makeReq('http://x/filter-options?field=model&tenantId=7', { id: 1 }, find, execute))
    expect(res.status).toBe(200)
    const { sql } = dialect.sqlToQuery(execute.mock.calls[0]?.[0] as SQL<unknown>)
    expect(sql).toContain('SELECT DISTINCT model')
    expect(sql).toContain('"llm_usage_events"')
    expect(sql).toContain('tenant_id =')
  })
})
