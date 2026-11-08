import type { BasePayload } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import type { ResolvedMetricsConfig } from '../types'
import { type BucketRow, decorateBuckets, getBuckets, getSeries, getTopBuckets, getTotals } from './aggregate-query'

function makePayload(
  options: {
    /** Rows returned by every execute() call. Ignored when `executeRowsSequence` is set. */
    executeRows?: Record<string, unknown>[]
    /** One array per successive execute() call, in order. */
    executeRowsSequence?: Array<Record<string, unknown>[]>
    findDocs?: Record<string, unknown>[]
  } = {}
) {
  const execute = vi.fn<(q: unknown) => Promise<{ rows: Record<string, unknown>[] }>>()
  if (options.executeRowsSequence) {
    for (const rows of options.executeRowsSequence) {
      execute.mockResolvedValueOnce({ rows })
    }
  } else {
    execute.mockResolvedValue({ rows: options.executeRows ?? [] })
  }
  const find = vi.fn(async () => ({ docs: options.findDocs ?? [] }))
  const payload = {
    db: { drizzle: { execute } },
    find
  } as unknown as BasePayload
  return { payload, execute, find }
}

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

describe('getTotals', () => {
  it('maps snake_case DB columns into camelCase totals', async () => {
    const { payload } = makePayload({
      executeRows: [{ total_tokens: '150', input_tokens: '100', output_tokens: '50', cost_usd: '0.42', events: '7' }]
    })
    const totals = await getTotals(payload, baseConfig(), {})
    expect(totals).toEqual({
      totalTokens: 150,
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.42,
      events: 7
    })
  })

  it('returns all-zero totals when the result is empty', async () => {
    const { payload } = makePayload({ executeRows: [] })
    const totals = await getTotals(payload, baseConfig(), {})
    expect(totals).toEqual({
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      events: 0
    })
  })
})

describe('getTopBuckets', () => {
  it('short-circuits to [] when groupBy is empty (no DB call)', async () => {
    const { payload, execute } = makePayload()
    const rows = await getTopBuckets(payload, baseConfig(), [], {})
    expect(rows).toEqual([])
    expect(execute).not.toHaveBeenCalled()
  })

  it('builds keys and label from the dim_* columns in each row', async () => {
    const { payload } = makePayload({
      executeRows: [
        {
          dim_agent: 'bastos',
          dim_model: 'gpt-4o',
          total_tokens: '10',
          input_tokens: '6',
          output_tokens: '4',
          cost_usd: '0.1',
          events: '1'
        }
      ]
    })
    const rows = await getTopBuckets(payload, baseConfig(), ['agent', 'model'], {})
    expect(rows).toHaveLength(1)
    expect(rows[0]?.keys).toEqual({ agent: 'bastos', model: 'gpt-4o' })
    expect(rows[0]?.labels).toEqual({ agent: 'bastos', model: 'gpt-4o' })
    expect(rows[0]?.key).toBe('bastos||gpt-4o')
    expect(rows[0]?.label).toBe('bastos||gpt-4o')
    expect(rows[0]?.totalTokens).toBe(10)
    expect(rows[0]?.costUsd).toBe(0.1)
  })

  it('renders null / undefined dimension values as "∅"', async () => {
    const { payload } = makePayload({
      executeRows: [
        { dim_tenant: null, total_tokens: '0', input_tokens: '0', output_tokens: '0', cost_usd: '0', events: '0' }
      ]
    })
    const rows = await getTopBuckets(payload, baseConfig(), ['tenant'], {})
    expect(rows[0]?.keys.tenant).toBe('∅')
  })
})

describe('getBuckets — pagination', () => {
  it('short-circuits to the empty-page shape when groupBy is empty', async () => {
    const { payload, execute } = makePayload()
    const page = await getBuckets(payload, baseConfig(), [], {})
    expect(page).toEqual({ rows: [], page: 1, totalPages: 1, totalBuckets: 0 })
    expect(execute).not.toHaveBeenCalled()
  })

  it('reports totalBuckets/totalPages from the count query', async () => {
    const { payload } = makePayload({
      executeRowsSequence: [[{ total: '120' }], []] // count=120, main=empty
    })
    const result = await getBuckets(payload, baseConfig(), ['agent'], {})
    expect(result.totalBuckets).toBe(120)
    expect(result.totalPages).toBe(Math.ceil(120 / 50))
  })

  it('clamps a page above totalPages to the last page', async () => {
    const { payload } = makePayload({
      executeRowsSequence: [[{ total: '25' }], []] // count=25 → 1 page
    })
    const result = await getBuckets(payload, baseConfig(), ['agent'], {}, 999)
    expect(result.page).toBe(1)
  })

  it('clamps a page below 1 to page 1', async () => {
    const { payload } = makePayload({
      executeRowsSequence: [[{ total: '25' }], []]
    })
    const result = await getBuckets(payload, baseConfig(), ['agent'], {}, 0)
    expect(result.page).toBe(1)
  })

  it('clamps NaN page to page 1 (avoids OFFSET NaN in SQL)', async () => {
    const { payload } = makePayload({
      executeRowsSequence: [[{ total: '25' }], []]
    })
    const result = await getBuckets(payload, baseConfig(), ['agent'], {}, Number.NaN)
    expect(result.page).toBe(1)
  })

  it('issues exactly two queries: count and main', async () => {
    const { payload, execute } = makePayload({
      executeRowsSequence: [[{ total: '0' }], []]
    })
    await getBuckets(payload, baseConfig(), ['agent'], {})
    expect(execute).toHaveBeenCalledTimes(2)
  })
})

describe('getSeries', () => {
  it('maps day rows into SeriesRow[] with numeric aggregates', async () => {
    const { payload } = makePayload({
      executeRows: [
        { day: '2026-04-20', total_tokens: '1000', cost_usd: '2.5', events: '3' },
        { day: '2026-04-21', total_tokens: '500', cost_usd: '1.25', events: '2' }
      ]
    })
    const series = await getSeries(payload, baseConfig(), {})
    expect(series).toEqual([
      { day: '2026-04-20', totalTokens: 1000, costUsd: 2.5, events: 3 },
      { day: '2026-04-21', totalTokens: 500, costUsd: 1.25, events: 2 }
    ])
  })

  it('returns [] when no rows are produced', async () => {
    const { payload } = makePayload({ executeRows: [] })
    const series = await getSeries(payload, baseConfig(), {})
    expect(series).toEqual([])
  })
})

describe('decorateBuckets', () => {
  function bucket(overrides: Partial<BucketRow> = {}): BucketRow {
    const keys = overrides.keys ?? {}
    const labels = overrides.labels ?? { ...keys }
    return {
      key: overrides.key ?? Object.values(keys).join('||'),
      label: overrides.label ?? '',
      keys,
      labels,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      events: 0,
      ...overrides
    }
  }

  it('returns the input unchanged when buckets is empty (no find call)', async () => {
    const { payload, find } = makePayload()
    const out = await decorateBuckets(payload, baseConfig(), ['tenant'], [])
    expect(out).toEqual([])
    expect(find).not.toHaveBeenCalled()
  })

  it('replaces tenant keys with tenant.name from the tenants collection', async () => {
    const { payload, find } = makePayload({
      findDocs: [{ id: 7, name: 'Acme Corp' }]
    })
    const out = await decorateBuckets(payload, baseConfig(), ['tenant'], [bucket({ keys: { tenant: '7' } })])
    expect(out[0]?.labels.tenant).toBe('Acme Corp')
    expect(find).toHaveBeenCalledOnce()
    expect(find.mock.calls[0]?.[0]?.collection).toBe('tenants')
  })

  it('falls back to the raw tenant id when the tenant is not found', async () => {
    const { payload } = makePayload({ findDocs: [] })
    const out = await decorateBuckets(payload, baseConfig(), ['tenant'], [bucket({ keys: { tenant: '99' } })])
    expect(out[0]?.labels.tenant).toBe('99')
  })

  it('prefers user.name, then user.email, then id for user labels', async () => {
    const { payload } = makePayload({
      findDocs: [{ id: 1, name: 'Alice', email: 'a@x' }, { id: 2, email: 'b@x' }, { id: 3 }]
    })
    const out = await decorateBuckets(
      payload,
      baseConfig(),
      ['user'],
      [bucket({ keys: { user: '1' } }), bucket({ keys: { user: '2' } }), bucket({ keys: { user: '3' } })]
    )
    expect(out[0]?.labels.user).toBe('Alice')
    expect(out[1]?.labels.user).toBe('b@x')
    expect(out[2]?.labels.user).toBe('3')
  })

  it('uses the platform/BYOK phrasing for apiKeySource labels', async () => {
    const { payload } = makePayload()
    const out = await decorateBuckets(
      payload,
      baseConfig(),
      ['apiKeySource'],
      [bucket({ keys: { apiKeySource: 'agent' } }), bucket({ keys: { apiKeySource: 'user' } })]
    )
    expect(out[0]?.labels.apiKeySource).toBe('Agent (platform key)')
    expect(out[1]?.labels.apiKeySource).toBe('User (BYOK)')
  })

  it('composes the final label from the decorated labels in groupBy order', async () => {
    const { payload } = makePayload({ findDocs: [{ id: 7, name: 'Acme' }] })
    const out = await decorateBuckets(
      payload,
      baseConfig(),
      ['tenant', 'apiKeySource'],
      [bucket({ keys: { tenant: '7', apiKeySource: 'agent' } })]
    )
    expect(out[0]?.label).toBe('Acme / Agent (platform key)')
  })

  it('does not call payload.find when the groupBy has no tenant/user dimension', async () => {
    const { payload, find } = makePayload()
    await decorateBuckets(payload, baseConfig(), ['apiKeySource'], [bucket({ keys: { apiKeySource: 'agent' } })])
    expect(find).not.toHaveBeenCalled()
  })
})
