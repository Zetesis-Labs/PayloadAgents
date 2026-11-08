import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { BasePayload, TypedUser } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import type { AccessResult, ResolvedMetricsConfig } from '../types'
import { getFilterOptions } from './filter-options-query'

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

function makePayload(options: { findMock?: ReturnType<typeof vi.fn>; executeRows?: Record<string, unknown>[] } = {}) {
  const find = options.findMock ?? vi.fn()
  const execute = vi.fn(async () => ({ rows: options.executeRows ?? [] }))
  const payload = {
    find,
    db: { drizzle: { execute } }
  } as unknown as BasePayload
  return { payload, find, execute }
}

const USER = { id: 1 } as unknown as TypedUser
const ALL_TENANTS: Exclude<AccessResult, null> = { allTenants: true }

function call(
  payload: BasePayload,
  config: ResolvedMetricsConfig,
  field: string | null,
  q: string,
  access: Exclude<AccessResult, null> = ALL_TENANTS,
  tenantIdParam: string | null = null,
  user: TypedUser = USER
) {
  return getFilterOptions(payload, config, user, access, tenantIdParam, field, q)
}

function inspectSql(call: unknown): string {
  return dialect.sqlToQuery(call as SQL<unknown>).sql
}

describe('getFilterOptions', () => {
  it('returns null for unknown field', async () => {
    const { payload, find, execute } = makePayload()
    const result = await call(payload, baseConfig(), 'tenant', 'x')
    expect(result).toBeNull()
    expect(find).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('returns null when field is null', async () => {
    const { payload } = makePayload()
    const result = await call(payload, baseConfig(), null, '')
    expect(result).toBeNull()
  })

  it('field=agent maps slug+name and queries agentsSlug', async () => {
    const { payload, find } = makePayload({
      findMock: vi.fn(async () => ({
        docs: [
          { slug: 'support-bot', name: 'Support Bot' },
          { slug: 'sales-agent', name: 'Sales Agent' }
        ]
      }))
    })
    const result = await call(payload, baseConfig(), 'agent', 'sup')
    expect(result?.options).toEqual([
      { label: 'Support Bot (support-bot)', value: 'support-bot' },
      { label: 'Sales Agent (sales-agent)', value: 'sales-agent' }
    ])
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'agents', overrideAccess: false, user: USER })
    )
  })

  it('field=agent uses slug as label when name is absent', async () => {
    const { payload } = makePayload({
      findMock: vi.fn(async () => ({ docs: [{ slug: 'my-agent' }] }))
    })
    const result = await call(payload, baseConfig(), 'agent', '')
    expect(result?.options[0]).toEqual({ label: 'my-agent', value: 'my-agent' })
  })

  it('field=user maps email→id and queries usersSlug', async () => {
    const { payload, find } = makePayload({
      findMock: vi.fn(async () => ({
        docs: [
          { id: 1, email: 'admin@irontec.com' },
          { id: 2, email: 'maria@irontec.com' }
        ]
      }))
    })
    const result = await call(payload, baseConfig(), 'user', 'irontec')
    expect(result?.options).toEqual([
      { label: 'admin@irontec.com', value: '1' },
      { label: 'maria@irontec.com', value: '2' }
    ])
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'users', overrideAccess: false, user: USER })
    )
  })

  it('returns empty options when collection returns no docs', async () => {
    const { payload } = makePayload({ findMock: vi.fn(async () => ({ docs: [] })) })
    const result = await call(payload, baseConfig(), 'agent', 'nada')
    expect(result?.options).toEqual([])
    expect(result?.hasMore).toBe(false)
  })

  it('hasMore is true when results exceed PAGE_SIZE', async () => {
    const docs = Array.from({ length: 11 }, (_, i) => ({ slug: `agent-${i}`, name: `Agent ${i}` }))
    const { payload } = makePayload({ findMock: vi.fn(async () => ({ docs })) })
    const result = await call(payload, baseConfig(), 'agent', '')
    expect(result?.options).toHaveLength(10)
    expect(result?.hasMore).toBe(true)
  })

  it('hasMore is false when results are exactly PAGE_SIZE', async () => {
    const docs = Array.from({ length: 10 }, (_, i) => ({ slug: `agent-${i}` }))
    const { payload } = makePayload({ findMock: vi.fn(async () => ({ docs })) })
    const result = await call(payload, baseConfig(), 'agent', '')
    expect(result?.options).toHaveLength(10)
    expect(result?.hasMore).toBe(false)
  })

  describe('field=model', () => {
    it('uses SELECT DISTINCT against the events table and maps rows', async () => {
      const { payload, execute } = makePayload({
        executeRows: [{ model: 'claude-sonnet-4-6' }, { model: 'gpt-4o-mini' }, { model: 'o4-mini' }]
      })
      const result = await call(payload, baseConfig(), 'model', '')
      expect(result?.options).toEqual([
        { label: 'claude-sonnet-4-6', value: 'claude-sonnet-4-6' },
        { label: 'gpt-4o-mini', value: 'gpt-4o-mini' },
        { label: 'o4-mini', value: 'o4-mini' }
      ])
      const sql = inspectSql(execute.mock.calls[0]?.[0])
      expect(sql).toContain('SELECT DISTINCT model')
      expect(sql).toContain('"llm_usage_events"')
    })

    it('hasMore is true when DB returns more than PAGE_SIZE rows', async () => {
      const rows = Array.from({ length: 11 }, (_, i) => ({ model: `model-${i}` }))
      const { payload } = makePayload({ executeRows: rows })
      const result = await call(payload, baseConfig(), 'model', '')
      expect(result?.options).toHaveLength(10)
      expect(result?.hasMore).toBe(true)
    })

    it('adds ILIKE filter when q is provided', async () => {
      const { payload, execute } = makePayload({ executeRows: [] })
      await call(payload, baseConfig(), 'model', 'gpt')
      const sql = inspectSql(execute.mock.calls[0]?.[0])
      expect(sql).toContain('model ILIKE')
    })

    it('does not add ILIKE filter when q is empty', async () => {
      const { payload, execute } = makePayload({ executeRows: [] })
      await call(payload, baseConfig(), 'model', '')
      const sql = inspectSql(execute.mock.calls[0]?.[0])
      expect(sql).not.toContain('ILIKE')
    })

    it('scopes to access.tenantIds when access is restricted', async () => {
      const { payload, execute } = makePayload({ executeRows: [] })
      await call(payload, baseConfig({ multiTenant: true }), 'model', '', { tenantIds: [1, 2] })
      const sql = inspectSql(execute.mock.calls[0]?.[0])
      expect(sql).toContain('tenant_id IN')
    })

    it('narrows to single tenant when allTenants and tenantId param is given', async () => {
      const { payload, execute } = makePayload({ executeRows: [] })
      await call(payload, baseConfig({ multiTenant: true }), 'model', '', { allTenants: true }, '5')
      const sql = inspectSql(execute.mock.calls[0]?.[0])
      expect(sql).toContain('tenant_id =')
    })

    it('does not add tenant filter when multiTenant is false', async () => {
      const { payload, execute } = makePayload({ executeRows: [] })
      await call(payload, baseConfig({ multiTenant: false }), 'model', '', { tenantIds: [1] })
      const sql = inspectSql(execute.mock.calls[0]?.[0])
      expect(sql).not.toContain('tenant_id')
    })

    it('ignores tenantId param when not in user’s allowed tenants', async () => {
      const { payload, execute } = makePayload({ executeRows: [] })
      await call(payload, baseConfig({ multiTenant: true }), 'model', '', { tenantIds: [1, 2] }, '99')
      const sql = inspectSql(execute.mock.calls[0]?.[0])
      expect(sql).toContain('tenant_id IN')
      expect(sql).not.toContain('tenant_id =')
    })

    it('narrows to tenantId param when it is in allowed tenants', async () => {
      const { payload, execute } = makePayload({ executeRows: [] })
      await call(payload, baseConfig({ multiTenant: true }), 'model', '', { tenantIds: [1, 2] }, '2')
      const sql = inspectSql(execute.mock.calls[0]?.[0])
      expect(sql).toContain('tenant_id =')
    })
  })
})
