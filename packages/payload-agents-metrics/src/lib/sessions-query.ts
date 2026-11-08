import { sql } from 'drizzle-orm'
import type { BasePayload } from 'payload'
import type { ResolvedMetricsConfig } from '../types'
import { type BaseFilters, buildWhere } from './build-where'
import { type DrizzleLike, getDrizzle } from './db'

const PAGE_SIZE = 50

export type SessionFilters = BaseFilters

export interface SessionRow {
  conversationId: string
  agentSlug: string
  model: string
  userId: number
  userLabel: string
  tenantId: number
  tenantLabel: string
  runs: number
  totalTokens: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  firstRunAt: string
  lastRunAt: string
  durationMs: number
  totalLatencyMs: number
  errors: number
  firstMessage: string | null
}

export interface SessionTotals {
  sessions: number
  runs: number
  costUsd: number
  totalTokens: number
}

export interface SessionsResult {
  sessions: SessionRow[]
  totals: SessionTotals
  page: number
  totalPages: number
}

function getTable(config: ResolvedMetricsConfig): string {
  return config.collectionSlug.replace(/-/g, '_')
}

function num(v: unknown): number {
  return Number(v ?? 0)
}

function str(v: unknown): string {
  return String(v ?? '')
}

function parseRunDates(r: Record<string, unknown>): { firstRunAt: string; lastRunAt: string; durationMs: number } {
  const firstRunAt = r.first_run_at ? new Date(r.first_run_at as string).toISOString() : ''
  const lastRunAt = r.last_run_at ? new Date(r.last_run_at as string).toISOString() : ''
  const durationMs = firstRunAt && lastRunAt ? new Date(lastRunAt).getTime() - new Date(firstRunAt).getTime() : 0
  return { firstRunAt, lastRunAt, durationMs }
}

function parseTenantInfo(
  r: Record<string, unknown>,
  tenantMap: Map<string, string>
): { tenantId: number; tenantLabel: string } {
  if (r.tenant_id == null) return { tenantId: 0, tenantLabel: '' }
  return {
    tenantId: Number(r.tenant_id),
    tenantLabel: tenantMap.get(String(r.tenant_id)) ?? String(r.tenant_id)
  }
}

function buildSessionRow(
  r: Record<string, unknown>,
  userMap: Map<string, string>,
  tenantMap: Map<string, string>,
  firstMessages: Map<string, string>
): SessionRow {
  const convId = str(r.conversation_id)
  const dates = parseRunDates(r)
  const tenant = parseTenantInfo(r, tenantMap)
  return {
    conversationId: convId,
    agentSlug: str(r.agent_slug),
    model: str(r.model),
    userId: num(r.user_id),
    userLabel: userMap.get(String(r.user_id)) ?? String(r.user_id),
    tenantId: tenant.tenantId,
    tenantLabel: tenant.tenantLabel,
    runs: num(r.runs),
    totalTokens: num(r.total_tokens),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    costUsd: num(r.cost_usd),
    firstRunAt: dates.firstRunAt,
    lastRunAt: dates.lastRunAt,
    durationMs: dates.durationMs,
    totalLatencyMs: num(r.total_latency_ms),
    errors: num(r.errors),
    firstMessage: firstMessages.get(convId) ?? null
  }
}

export async function getSessions(
  payload: BasePayload,
  config: ResolvedMetricsConfig,
  filters: SessionFilters,
  page: number
): Promise<SessionsResult> {
  const db = getDrizzle(payload)
  const where = buildWhere(filters)
  const table = getTable(config)

  const countResult = await db.execute(sql`
    SELECT COUNT(DISTINCT conversation_id)::bigint AS total
    FROM ${sql.raw(`"${table}"`)}
    WHERE ${where}
  `)
  const totalSessions = Number(countResult.rows[0]?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(totalSessions / PAGE_SIZE))
  const requestedPage = Number.isFinite(page) ? page : 1
  const safePage = Math.min(Math.max(1, requestedPage), totalPages)
  const offset = (safePage - 1) * PAGE_SIZE

  const totalsResult = await db.execute(sql`
    SELECT
      COUNT(DISTINCT conversation_id)::bigint AS sessions,
      COUNT(*)::bigint AS runs,
      COALESCE(SUM(cost_usd), 0)::numeric AS cost_usd,
      COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens
    FROM ${sql.raw(`"${table}"`)}
    WHERE ${where}
  `)
  const totalsRow = totalsResult.rows[0] || {}

  // When multiTenant is false the collection has no `tenant` field, so the
  // column does not exist in the table. Skip it in the SELECT/GROUP BY instead
  // of crashing the query.
  const tenantSelect = config.multiTenant ? sql`tenant_id,` : sql``
  const tenantGroup = config.multiTenant ? sql`, tenant_id` : sql``

  const sessionsResult = await db.execute(sql`
    SELECT
      conversation_id, agent_slug, model, user_id, ${tenantSelect}
      COUNT(*)::bigint AS runs,
      COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
      COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
      COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
      COALESCE(SUM(cost_usd), 0)::numeric AS cost_usd,
      MIN(completed_at) AS first_run_at,
      MAX(completed_at) AS last_run_at,
      COALESCE(SUM(latency_ms), 0)::bigint AS total_latency_ms,
      COUNT(*) FILTER (WHERE status = 'error')::bigint AS errors
    FROM ${sql.raw(`"${table}"`)}
    WHERE ${where}
    GROUP BY conversation_id, agent_slug, model, user_id${tenantGroup}
    ORDER BY MAX(completed_at) DESC NULLS LAST
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `)

  const rawSessions = sessionsResult.rows

  // Resolve user labels
  const userIds = [...new Set(rawSessions.map(r => Number(r.user_id)).filter(n => Number.isFinite(n)))]
  const userMap = new Map<string, string>()
  if (userIds.length > 0) {
    const { docs } = await payload.find({
      collection: config.usersSlug,
      where: { id: { in: userIds } },
      depth: 0,
      pagination: false,
      limit: userIds.length
    })
    for (const d of docs) {
      const u = d as { email?: string; name?: string | null }
      userMap.set(String(d.id), u.name || u.email || String(d.id))
    }
  }

  // Resolve tenant labels
  const tenantIds = [...new Set(rawSessions.map(r => Number(r.tenant_id)).filter(n => Number.isFinite(n)))]
  const tenantMap = new Map<string, string>()
  if (tenantIds.length > 0) {
    const { docs } = await payload.find({
      collection: config.tenantsSlug,
      where: { id: { in: tenantIds } },
      depth: 0,
      pagination: false,
      limit: tenantIds.length
    })
    for (const d of docs) {
      tenantMap.set(String(d.id), (d as { name?: string }).name || String(d.id))
    }
  }

  // First messages from Agno
  const conversationIds = rawSessions
    .filter(r => r.conversation_id != null && r.conversation_id !== '')
    .map(r => String(r.conversation_id))
  const firstMessages = await batchFetchFirstMessages(db, conversationIds, config.agnoRunsTable)

  const sessions: SessionRow[] = rawSessions.map(r => buildSessionRow(r, userMap, tenantMap, firstMessages))

  return {
    sessions,
    totals: {
      sessions: Number(totalsRow.sessions ?? 0),
      runs: Number(totalsRow.runs ?? 0),
      costUsd: Number(totalsRow.cost_usd ?? 0),
      totalTokens: Number(totalsRow.total_tokens ?? 0)
    },
    page: safePage,
    totalPages
  }
}

async function batchFetchFirstMessages(
  db: DrizzleLike,
  conversationIds: string[],
  agnoRunsTable: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (conversationIds.length === 0) return result

  // One row per session: the first user message of its earliest run. Postgres
  // picks it (DISTINCT ON + ORDER BY run position, then message position) so the
  // full run payloads never leave the database. `->>` yields the content as text:
  // a plain string stays as-is, structured content comes back as its JSON text.
  //
  // session_id IN (...) emits one parameterised placeholder per id, which
  // node-postgres binds correctly. ANY(${array}::text[]) looks cleaner but
  // drizzle's sql template hands the JS array to pg as a single string
  // ("uuid"), which Postgres can't cast to text[] (malformed array literal).
  // sql.join with comma separators expands to ($1, $2, …) and uses the
  // session_id index just as well as a chained OR list.
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (r.session_id) r.session_id, m.value ->> 'content' AS content
    FROM ${sql.raw(agnoRunsTable)} r
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(r.run_data -> 'messages') = 'array' THEN r.run_data -> 'messages' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS m(value, ord)
    WHERE r.session_id IN (${sql.join(
      conversationIds.map(id => sql`${id}`),
      sql`, `
    )})
      AND m.value ->> 'role' = 'user'
      AND m.value ->> 'content' IS NOT NULL
    ORDER BY r.session_id, r.run_index ASC NULLS LAST, r.created_at ASC, m.ord ASC
  `)

  for (const row of rows.rows) {
    if (typeof row.content !== 'string') continue
    result.set(String(row.session_id), row.content.slice(0, 200))
  }

  return result
}
