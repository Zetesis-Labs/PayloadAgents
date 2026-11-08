import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import type { ResolvedMetricsConfig } from '../types'
import { createSessionDetailHandler } from './session-detail'

const dialect = new PgDialect()

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

function run(user: string, answer: string) {
  return {
    messages: [
      { role: 'system', content: 'eres un asistente' },
      { role: 'user', content: user },
      { role: 'assistant', content: answer }
    ]
  }
}

async function getDetail(rows: Record<string, unknown>[], config = baseConfig()) {
  const execute = vi.fn<(q: unknown) => Promise<{ rows: Record<string, unknown>[] }>>()
  execute.mockResolvedValue({ rows })
  const warn = vi.fn()
  const req = {
    url: 'http://x/session?conversationId=sess-1',
    user: { id: 1 },
    payload: { db: { drizzle: { execute } }, logger: { warn } },
    headers: new Headers()
  } as unknown as PayloadRequest
  const res = await createSessionDetailHandler(config)(req)
  const body = (await res.json()) as { messages: Array<{ role: string; content: string }> }
  return { body, execute, warn }
}

describe('createSessionDetailHandler — transcript from agno_runs', () => {
  it('reads the configured runs table in run order for the conversation', async () => {
    const { execute } = await getDetail([], baseConfig({ agnoRunsTable: 'custom.my_runs' }))
    const { sql, params } = dialect.sqlToQuery(execute.mock.calls[0]?.[0] as SQL<unknown>)
    expect(sql).toContain('SELECT run_data FROM custom.my_runs')
    expect(sql).toContain('ORDER BY run_index ASC NULLS LAST, created_at ASC')
    expect(sql).not.toContain('agno_sessions')
    expect(params).toEqual(['sess-1'])
  })

  it('flattens the user and assistant turns of every run, in order', async () => {
    const { body } = await getDetail([{ run_data: run('hola', 'buenas') }, { run_data: run('¿y?', 'pues eso') }])
    expect(body.messages).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'buenas' },
      { role: 'user', content: '¿y?' },
      { role: 'assistant', content: 'pues eso' }
    ])
  })

  it('accepts run_data serialised as a JSON string', async () => {
    const { body } = await getDetail([{ run_data: JSON.stringify(run('hola', 'buenas')) }])
    expect(body.messages.map(m => m.content)).toEqual(['hola', 'buenas'])
  })

  it('skips a run whose payload is not JSON, logs it and still renders the others', async () => {
    const { body, warn } = await getDetail([{ run_data: '{not json' }, { run_data: run('hola', 'buenas') }])
    expect(body.messages.map(m => m.content)).toEqual(['hola', 'buenas'])
    expect(warn).toHaveBeenCalledWith({ conversationId: 'sess-1' }, expect.stringContaining('not JSON'))
  })

  it('returns no messages when the conversation has no runs', async () => {
    const { body } = await getDetail([])
    expect(body.messages).toEqual([])
  })
})
