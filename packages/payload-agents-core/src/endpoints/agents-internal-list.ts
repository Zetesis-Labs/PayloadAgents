/**
 * GET /api/{collectionSlug}/internal/list — internal endpoint the agent
 * runtime calls to fetch all active agents (with decrypted apiKey,
 * litellmVirtualKey + populated tenant + populated retrieval profile at depth=2 so its
 * taxonomy/folder filters are inlined). Authenticated by `X-Internal-Secret`,
 * scoped to active agents, calls Payload's local API with `overrideAccess:
 * true` so the host's collection access can stay honestly user-scoped.
 *
 * Replaces the previous flow where the runtime hit `GET /api/agents` with
 * `X-Runtime-Secret` and the host had to bypass `read` access on both the
 * agents and tenants collections to make depth=1 populate work.
 */

import { timingSafeEqual } from 'node:crypto'
import type { PayloadHandler, PayloadRequest, Where } from 'payload'
import type { ResolvedPluginConfig } from '../types'

const INTERNAL_SECRET_HEADER = 'x-internal-secret'

/**
 * Constant-time comparison. Falls back to a dummy compare on mismatched
 * length so an attacker can't infer the secret length from the
 * early-exit timing of a length check. (Security audit: H1.)
 */
const safeCompareSecrets = (a: string, b: string): boolean => {
  const aBuf = Buffer.from(a, 'utf8')
  const bBuf = Buffer.from(b, 'utf8')
  if (aBuf.length !== bBuf.length) {
    timingSafeEqual(aBuf, Buffer.alloc(aBuf.length, 0))
    return false
  }
  return timingSafeEqual(aBuf, bBuf)
}

const requireInternalSecret = (req: PayloadRequest, internalSecret: string): Response | null => {
  if (!internalSecret) {
    return Response.json({ error: 'Internal endpoint not configured' }, { status: 503 })
  }
  const headerSecret = req.headers?.get?.(INTERNAL_SECRET_HEADER)
  if (!headerSecret || !safeCompareSecrets(headerSecret, internalSecret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export function createAgentsInternalListHandler(config: ResolvedPluginConfig): PayloadHandler {
  return async req => {
    const authError = requireInternalSecret(req, config.runtimeSecret)
    if (authError) return authError

    const where: Where = { isActive: { equals: true } }

    // `context.internalAgentRead` tells the secret-field afterRead hook to decrypt;
    // `overrideAccess: true` skips the host's collection access (and the
    // populated tenant/taxonomies relations) so we don't need bypass branches
    // in the host's collection access functions.
    // depth=2 so any consumer-injected retrieval-profile relationship is
    // populated AND its nested taxonomy/folder filters are inlined. The
    // runtime reads the slugs directly off the populated profile.
    const { docs } = await req.payload.find({
      collection: config.collectionSlug,
      where,
      depth: 2,
      limit: 1000,
      overrideAccess: true,
      req,
      context: { internalAgentRead: true }
    })

    return Response.json({ docs })
  }
}
