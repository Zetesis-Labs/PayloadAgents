/**
 * Hooks that fan out an Agent change to every agent-runtime replica.
 *
 * Uses Postgres `NOTIFY agent_reload` instead of an HTTP call so the message
 * reaches every pod listening on the channel — the previous HTTP approach hit
 * a single replica via the K8s Service round-robin and left other replicas
 * with stale config.
 *
 * Best-effort: failures are logged but not thrown — the runtime self-heals
 * on next restart via its FastAPI lifespan hook.
 */

import { sql } from 'drizzle-orm'
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, Payload } from 'payload'
import type { ResolvedPluginConfig } from '../../types'
import { shouldSkipAgentRuntimeReload } from './sync-litellm-virtual-key'

const RELOAD_CHANNEL = 'agent_reload'

type Drizzle = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }

function getDrizzle(payload: Payload): Drizzle {
  return (payload.db as unknown as { drizzle: Drizzle }).drizzle
}

export async function notifyReload(payload: Payload, slug: string): Promise<void> {
  try {
    const drizzle = getDrizzle(payload)
    await drizzle.execute(sql`SELECT pg_notify(${RELOAD_CHANNEL}, ${slug})`)
  } catch (err) {
    console.warn('[Agents] NOTIFY agent_reload failed:', err)
  }
}

/** Read the `slug` field from a hook doc, returning null if absent or non-string. */
function docSlug(doc: unknown): string | null {
  if (!doc || typeof doc !== 'object' || !('slug' in doc)) return null
  const slug = (doc as { slug: unknown }).slug
  return typeof slug === 'string' ? slug : null
}

export function createAfterChangeHook(_config: ResolvedPluginConfig): CollectionAfterChangeHook {
  return async ({ context, doc, operation, req }) => {
    if (shouldSkipAgentRuntimeReload(context)) return doc
    const slug = docSlug(doc)
    if (!slug) return doc
    console.log(`[Agents] ${operation} → notifying agent-runtime to reload "${slug}"`)
    await notifyReload(req.payload, slug)
    return doc
  }
}

export function createAfterDeleteHook(_config: ResolvedPluginConfig): CollectionAfterDeleteHook {
  return async ({ context, doc, req }) => {
    if (shouldSkipAgentRuntimeReload(context)) return doc
    const slug = docSlug(doc)
    if (!slug) return doc
    console.log(`[Agents] delete → notifying agent-runtime to reload (removed "${slug}")`)
    await notifyReload(req.payload, slug)
    return doc
  }
}
