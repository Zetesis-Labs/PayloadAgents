import { decrypt } from '@zetesis/payload-agents-core'
import { headers as nextHeaders } from 'next/headers'
import { NextResponse } from 'next/server'
import type { BasePayload } from 'payload'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { hashToken } from '@/utilities/mcp-search-tokens'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MCP_INTERNAL_URL = process.env.MCP_INTERNAL_URL || 'http://localhost:3030/mcp'
const LITELLM_GATEWAY_URL = (process.env.LITELLM_GATEWAY_URL || 'http://litellm:4000').replace(/\/$/, '')

/**
 * Resolve the upstream MCP URL + auth headers for a token. When the token has a
 * synced LiteLLM virtual key, route through the gateway at `/{alias}/mcp` with
 * that key (traceability + backend access control enforced by LiteLLM). Without
 * a key, fall back to the direct MCP URL (legacy, non-breaking).
 */
function resolveUpstream(auth: TokenAuth): { url: string; authHeaders: Record<string, string> } {
  if (auth.virtualKey && auth.mcpAlias) {
    return {
      url: `${LITELLM_GATEWAY_URL}/${auth.mcpAlias}/mcp`,
      authHeaders: {
        'x-litellm-api-key': `Bearer ${auth.virtualKey}`,
        Authorization: `Bearer ${auth.virtualKey}`,
      },
    }
  }
  return { url: MCP_INTERNAL_URL, authHeaders: {} }
}

interface TokenAuth {
  taxonomySlugs: string[]
  mcpAlias: string | null
  virtualKey: string | null
}

async function findTokenByHash(payload: BasePayload, tokenHash: string) {
  const { docs } = await payload.find({
    collection: 'mcp-search-tokens',
    where: { tokenHash: { equals: tokenHash } },
    depth: 1,
    limit: 1,
    pagination: false,
  })
  return docs[0] ?? null
}

function updateTokenLastUsed(payload: BasePayload, tokenId: number | string): void {
  payload
    .update({
      collection: 'mcp-search-tokens',
      id: tokenId,
      data: { lastUsedAt: new Date().toISOString() } as Record<string, unknown>,
    })
    .catch(() => {})
}

async function authenticateRequest(hdrs: Headers, request: Request): Promise<TokenAuth | NextResponse> {
  const authorization = hdrs.get('authorization')
  const url = new URL(request.url)
  const queryToken = url.searchParams.get('token')

  const rawToken = queryToken ?? (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null)
  if (!rawToken) {
    return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 })
  }

  const payload = await getPayload({ config })
  const tokenDoc = await findTokenByHash(payload, hashToken(rawToken))
  if (!tokenDoc) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const doc = tokenDoc as unknown as {
    taxonomies?: unknown
    mcpServer?: unknown
    litellmVirtualKey?: unknown
  }

  const rawTaxonomies = doc.taxonomies
  const taxonomySlugs: string[] = Array.isArray(rawTaxonomies)
    ? rawTaxonomies
        .map(t => (typeof t === 'object' && t !== null ? (t as { slug?: unknown }).slug : null))
        .filter((s): s is string => typeof s === 'string' && s.length > 0)
    : []

  // Decrypt the internal per-token LiteLLM key (set by the collection sync hook).
  const encKey = process.env.PAYLOAD_SECRET
  const stored = typeof doc.litellmVirtualKey === 'string' ? doc.litellmVirtualKey : null
  const virtualKey = stored && encKey ? decrypt(stored, encKey) : null
  const mcpAlias = typeof doc.mcpServer === 'string' ? doc.mcpServer : null

  updateTokenLastUsed(payload, tokenDoc.id as number | string)
  return { taxonomySlugs, mcpAlias, virtualKey }
}

async function proxyToMcp(request: Request): Promise<Response> {
  const hdrs = await nextHeaders()
  const auth = await authenticateRequest(hdrs, request)
  if (auth instanceof NextResponse) return auth

  const { url: upstreamUrl, authHeaders } = resolveUpstream(auth)

  const forwardHeaders: Record<string, string> = {
    'Content-Type': hdrs.get('content-type') || 'application/json',
    Accept: 'application/json, text/event-stream',
    ...authHeaders,
  }
  // Scope is injected here (trusted): the client cannot set it themselves.
  if (auth.taxonomySlugs.length > 0) {
    forwardHeaders['x-taxonomy-slugs'] = auth.taxonomySlugs.join(',')
  }

  const sessionId = hdrs.get('mcp-session-id')
  if (sessionId) forwardHeaders['mcp-session-id'] = sessionId

  const body = request.method !== 'GET' ? await request.text() : null

  let upstream: globalThis.Response
  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: forwardHeaders,
      body,
      signal: AbortSignal.timeout(55_000),
    })
  } catch {
    return NextResponse.json({ error: 'MCP search service is unavailable' }, { status: 502 })
  }

  const responseHeaders = new Headers()
  const contentType = upstream.headers.get('content-type')
  if (contentType) responseHeaders.set('Content-Type', contentType)

  const mcpSessionId = upstream.headers.get('mcp-session-id')
  if (mcpSessionId) responseHeaders.set('mcp-session-id', mcpSessionId)

  if (contentType?.includes('text/event-stream')) {
    responseHeaders.set('Cache-Control', 'no-cache, no-transform')
    responseHeaders.set('X-Accel-Buffering', 'no')
  }

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
}

export const POST = proxyToMcp
export const GET = proxyToMcp
export const DELETE = proxyToMcp
