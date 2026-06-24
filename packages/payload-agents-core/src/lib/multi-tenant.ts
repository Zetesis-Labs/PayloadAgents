/**
 * Opinionated helper for the common multi-tenant setup.
 *
 * - `buildSessionId` returns an opaque UUID. The id carries no ownership data.
 * - `validateSessionOwnership` queries `agno.agno_sessions` to verify the
 *   current user owns the session. Ownership lives in Agno's session row —
 *   `user_id` (native column) and `metadata->>'tenant_id'` (back-filled by
 *   this strategy on the first validate; see below).
 *
 * Tenant back-fill: Agno (>=2.5) only writes the agent's static `metadata`
 * to the session row, ignoring the per-run `metadata=` kwarg the runtime
 * forwards from `X-Tenant-Id`. To keep `metadata.tenant_id` accurate without
 * patching Agno, `validateSessionOwnership` updates the column the first
 * time it sees a row with `metadata.tenant_id IS NULL` and a matching
 * `user_id`. An expression index on `(metadata->>'tenant_id')` is
 * recommended for query performance.
 */

import { sql } from 'drizzle-orm'
import type { Payload, PayloadRequest, TypedUser } from 'payload'
import type { BuildSessionId, ValidateSessionOwnership } from '../types'

export interface MultiTenantSessionStrategyOptions {
  /**
   * Resolve the tenant id for the current request.
   *
   * Receives the authenticated Payload user and the current `PayloadRequest`,
   * so consumers can read the active tenant from whatever source their app
   * uses (cookie, header, subdomain…) instead of being restricted to the
   * user object.
   *
   * Return `undefined` (or a falsy value) for users without a tenant.
   */
  extractTenantId: (user: TypedUser, req: PayloadRequest) => string | number | undefined | null

  /**
   * Optional predicate: when `true`, `validateSessionOwnership` short-circuits
   * to `true` regardless of the Agno session's tenant/user. Use this for
   * superadmin roles that need to debug any conversation.
   */
  canBypass?: (user: TypedUser) => boolean
}

export interface MultiTenantSessionStrategy {
  buildSessionId: BuildSessionId
  validateSessionOwnership: ValidateSessionOwnership
  /**
   * Resolves the active tenant id for the current request. Passed through to
   * `agentPlugin` so the session-list endpoint can scope results to the tenant.
   */
  extractTenantId: (user: TypedUser, req: PayloadRequest) => string | number | null | undefined
  /**
   * Forwards the current tenant id as `X-Tenant-Id` to the agent-runtime
   * so it can persist it into the Agno session's `metadata` JSONB.
   * Pass this into `agentPlugin({ getRuntimeHeaders })`.
   */
  getRuntimeHeaders: (ctx: { user: TypedUser; payload: Payload; req: PayloadRequest }) => Record<string, string>
}

interface DrizzleLike {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>
}

function getDrizzle(payload: Payload): DrizzleLike {
  return (payload.db as unknown as { drizzle: DrizzleLike }).drizzle
}

function isBlank(v: string | number | null | undefined): v is null | undefined | '' {
  return v === undefined || v === null || v === ''
}

/**
 * Session-id strategy for tenant-scoped chats.
 *
 * Produces opaque UUID session ids and validates ownership against
 * `agno.agno_sessions` — the agent-runtime must persist `tenant_id` and
 * `user_id` into the session `metadata` JSONB when it creates the row.
 *
 * @example
 * ```ts
 * import { agentPlugin, multiTenantSessionStrategy } from '@zetesis/payload-agents-core'
 * import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'
 *
 * const { buildSessionId, validateSessionOwnership } = multiTenantSessionStrategy({
 *   extractTenantId: (user, req) =>
 *     getTenantFromCookie(req.headers, req.payload.db.defaultIDType) ??
 *     (user.tenants as Array<{ tenant: number | { id: number } }> | undefined)?.[0]?.tenant,
 *   canBypass: user => Array.isArray((user as { role?: string[] }).role)
 *     && (user as { role: string[] }).role.includes('superadmin')
 * })
 * ```
 */
export function multiTenantSessionStrategy(options: MultiTenantSessionStrategyOptions): MultiTenantSessionStrategy {
  const buildSessionId: BuildSessionId = ({ chatId }) => chatId ?? crypto.randomUUID()

  const validateSessionOwnership: ValidateSessionOwnership = async (sessionId, { user, payload, req }) => {
    if (options.canBypass?.(user)) return true

    const userId = user.id
    if (isBlank(userId)) return false

    const tenantId = options.extractTenantId(user, req)
    if (isBlank(tenantId)) return false

    const db = getDrizzle(payload)
    const { rows } = await db.execute(sql`
      SELECT user_id, metadata->>'tenant_id' AS tenant_id
      FROM agno.agno_sessions
      WHERE session_id = ${sessionId}
      LIMIT 1
    `)
    const row = rows[0]
    if (!row) {
      payload.logger.warn({ sessionId }, '[multi-tenant] session ownership denied: session not found in agno_sessions')
      return false
    }
    const storedUserId = row.user_id as string | null
    const storedTenantId = row.tenant_id as string | null

    if (storedUserId !== String(userId)) {
      payload.logger.warn(
        { sessionId, expectedUserId: String(userId), storedUserId },
        '[multi-tenant] session ownership denied: user mismatch'
      )
      return false
    }

    if (storedTenantId === null) {
      // Two pitfalls in this UPDATE:
      //   1. pg can't infer the type of jsonb_build_object's anyelement arg, so
      //      the parameter needs an explicit ::text cast (else 42P18).
      //   2. Postgres's `||` on non-object operands wraps both into an array
      //      (e.g. 'null'::jsonb || {} → [null, {}]). COALESCE only catches SQL
      //      NULL, not JSONB null/scalars/arrays — so we normalize via
      //      jsonb_typeof before merging.
      await db.execute(sql`
        UPDATE agno.agno_sessions
        SET metadata = (
          CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ELSE '{}'::jsonb END
        ) || jsonb_build_object('tenant_id', ${String(tenantId)}::text)
        WHERE session_id = ${sessionId}
      `)
      return true
    }

    if (storedTenantId !== String(tenantId)) {
      payload.logger.warn(
        { sessionId, expectedTenantId: String(tenantId), storedTenantId },
        '[multi-tenant] session ownership denied: tenant mismatch'
      )
      return false
    }

    return true
  }

  const getRuntimeHeaders = ({
    user,
    req
  }: {
    user: TypedUser
    payload: Payload
    req: PayloadRequest
  }): Record<string, string> => {
    const tenantId = options.extractTenantId(user, req)
    if (isBlank(tenantId)) return {}
    return { 'X-Tenant-Id': String(tenantId) }
  }

  return { buildSessionId, validateSessionOwnership, extractTenantId: options.extractTenantId, getRuntimeHeaders }
}
