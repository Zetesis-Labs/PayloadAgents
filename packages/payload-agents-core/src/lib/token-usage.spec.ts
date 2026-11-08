import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { Payload } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectiveTokensFromMetrics, getTokenUsage } from './token-usage'

const dialect = new PgDialect()
const NOW = new Date('2026-11-08T15:30:00Z')
const TODAY_EPOCH = Math.floor(Date.UTC(2026, 10, 8) / 1000)

function makePayload(execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>) {
  const fn = vi.fn(execute)
  return { payload: { db: { drizzle: { execute: fn } } } as unknown as Payload, execute: fn }
}

const limitOf = (limit: number) => async () => limit

describe('getTokenUsage — daily usage from agno_runs', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('sums run metrics from agno_runs for the sessions the user opened today', async () => {
    const { payload, execute } = makePayload(async () => ({
      rows: [
        {
          input_tokens: '340',
          output_tokens: '142',
          cache_read_tokens: '20',
          reasoning_tokens: '3',
          total_tokens: '482'
        }
      ]
    }))

    const usage = await getTokenUsage(payload, 42, limitOf(10_000))

    const { sql, params } = dialect.sqlToQuery(execute.mock.calls[0]?.[0] as SQL<unknown>)
    expect(sql).toContain('FROM agno.agno_sessions s')
    expect(sql).toContain('JOIN agno.agno_runs r ON r.session_id = s.session_id')
    expect(sql).toContain("r.run_data #>> '{metrics,input_tokens}'")
    expect(sql).not.toContain('jsonb_array_elements')
    expect(params).toEqual(['42', TODAY_EPOCH])

    const expected = effectiveTokensFromMetrics({ input_tokens: 340, output_tokens: 142, cache_read_tokens: 20 })
    expect(usage.used).toBe(expected)
    expect(usage.remaining).toBe(10_000 - expected)
    expect(usage.canUse(10_000 - expected)).toBe(true)
    expect(usage.canUse(10_000 - expected + 1)).toBe(false)
  })

  it('reports zero usage when the user has no runs today', async () => {
    const { payload } = makePayload(async () => ({ rows: [{}] }))
    const usage = await getTokenUsage(payload, 42, limitOf(1_000))
    expect(usage.used).toBe(0)
    expect(usage.canUse(1_000)).toBe(true)
  })

  it('fails closed when the usage query errors (e.g. agno_runs missing before the migration)', async () => {
    const { payload } = makePayload(async () => {
      throw new Error('relation "agno.agno_runs" does not exist')
    })
    const usage = await getTokenUsage(payload, 42, limitOf(1_000))
    expect(usage.limit).toBe(0)
    expect(usage.canUse(1)).toBe(false)
  })
})
