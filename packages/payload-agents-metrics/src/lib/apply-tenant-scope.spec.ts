import { describe, expect, it } from 'vitest'
import type { ResolvedMetricsConfig } from '../types'
import { applyTenantScope } from './apply-tenant-scope'
import type { BaseFilters } from './build-where'

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

describe('applyTenantScope', () => {
  it('is a no-op when multiTenant is false (allTenants access)', () => {
    const filters: BaseFilters = {}
    applyTenantScope(filters, baseConfig({ multiTenant: false }), { allTenants: true }, '1')
    expect(filters).toEqual({})
  })

  it('is a no-op when multiTenant is false (tenant-scoped access)', () => {
    const filters: BaseFilters = {}
    applyTenantScope(filters, baseConfig({ multiTenant: false }), { tenantIds: [1, 2] }, '1')
    expect(filters).toEqual({})
  })

  it('keeps the requested tenantId for allTenants access', () => {
    const filters: BaseFilters = {}
    applyTenantScope(filters, baseConfig({ multiTenant: true }), { allTenants: true }, '7')
    expect(filters.tenantId).toBe('7')
    expect(filters.tenantIds).toBeUndefined()
  })

  it('omits tenant filter for allTenants access when no tenantId is requested', () => {
    const filters: BaseFilters = {}
    applyTenantScope(filters, baseConfig({ multiTenant: true }), { allTenants: true }, null)
    expect(filters.tenantId).toBeUndefined()
    expect(filters.tenantIds).toBeUndefined()
  })

  it('pins to tenantId when scoped user requests an allowed tenant', () => {
    const filters: BaseFilters = {}
    applyTenantScope(filters, baseConfig({ multiTenant: true }), { tenantIds: [1, 2, 3] }, '2')
    expect(filters.tenantId).toBe('2')
    expect(filters.tenantIds).toBeUndefined()
  })

  it('falls back to the allowed list when scoped user requests a forbidden tenant', () => {
    const filters: BaseFilters = {}
    applyTenantScope(filters, baseConfig({ multiTenant: true }), { tenantIds: [1, 2] }, '99')
    expect(filters.tenantId).toBeUndefined()
    expect(filters.tenantIds).toEqual([1, 2])
  })

  it('falls back to the allowed list when scoped user passes no tenantId', () => {
    const filters: BaseFilters = {}
    applyTenantScope(filters, baseConfig({ multiTenant: true }), { tenantIds: [4, 5] }, null)
    expect(filters.tenantIds).toEqual([4, 5])
  })
})
