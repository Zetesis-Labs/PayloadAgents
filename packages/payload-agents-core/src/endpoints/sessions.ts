/**
 * GET {basePath}/sessions — List chat sessions for the authenticated user.
 *
 * Proxies to Agno `GET /sessions?type=agent&user_id=…`.
 */

import { sql } from 'drizzle-orm'
import type { PayloadHandler } from 'payload'
import { runtimeFetch } from '../lib/runtime-client'
import { getUserId } from '../lib/user'
import type { ResolvedPluginConfig } from '../types'

export function createSessionsListHandler(config: ResolvedPluginConfig): PayloadHandler {
  return async req => {
    const { user } = req
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = getUserId(user)
    const url = new URL(req.url || '', 'http://localhost')
    const agentSlug = url.searchParams.get('agentSlug')

    const params = new URLSearchParams({
      type: 'agent',
      user_id: String(userId),
      sort_by: 'updated_at',
      sort_order: 'desc',
      limit: String(Math.min(Math.max(1, Number(url.searchParams.get('limit')) || 20), 100)),
      page: url.searchParams.get('page') || '1'
    })
    if (agentSlug) {
      params.set('component_id', agentSlug)
    }

    try {
      const res = await runtimeFetch(`${config.runtimeUrl}/sessions?${params}`, config.runtimeSecret, {
        signal: AbortSignal.timeout(5_000)
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        console.error(`[chat/sessions] agent-runtime returned ${res.status}: ${text}`)
        return Response.json({ sessions: [] })
      }

      const body = (await res.json()) as {
        data: Array<{
          session_id: string
          session_name: string
          agent_id?: string
          created_at?: string
          updated_at?: string
        }>
      }

      let rows = body.data || []

      // Tenant-scope the list: a multi-tenant user must not see sessions that
      // belong to their *other* tenants. The runtime stamps `metadata.tenant_id`
      // on each session at creation, so we post-filter this user's sessions to
      // those matching the active tenant. Sessions without a tenant are excluded.
      // (No tenant resolver configured = single-tenant deployment = no filter.)
      const tenantId = config.extractTenantId?.(user, req)
      if (tenantId !== undefined && tenantId !== null && tenantId !== '' && rows.length > 0) {
        const drizzle = (
          req.payload.db as unknown as {
            drizzle: { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> }
          }
        ).drizzle
        const { rows: owned } = await drizzle.execute(sql`
          SELECT session_id FROM agno.agno_sessions
          WHERE user_id = ${String(userId)} AND metadata->>'tenant_id' = ${String(tenantId)}
        `)
        const allowed = new Set(owned.map(r => r.session_id as string))
        rows = rows.filter(s => allowed.has(s.session_id))
      }

      const sessions = rows.map(s => ({
        conversation_id: s.session_id,
        title: s.session_name || undefined,
        last_activity: s.updated_at || s.created_at || '',
        status: 'active',
        agentSlug: s.agent_id
      }))

      return Response.json({ sessions })
    } catch (err) {
      console.error('[chat/sessions] fetch failed:', err)
      return Response.json({ sessions: [] })
    }
  }
}
