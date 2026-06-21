/**
 * Auth resolution. Given an incoming request and the configured strategy,
 * return an `McpAuthContext` (or null for no scope).
 *
 * Phase A ships a single strategy (`header`). The discriminated union is
 * already in place so new strategies (`callback`, `none`) can be added
 * additively without breaking consumers.
 */

import type { IncomingMessage } from 'node:http'
import type { McpAuthContext, McpAuthStrategy, ResolvedRetrievalScope } from '../types'

const DEFAULT_HEADER_NAME = 'x-tenant-slug'
const TAXONOMY_HEADER_NAME = 'x-taxonomy-slugs'
const FOLDER_HEADER_NAME = 'x-folder-slugs'
const RERANKER_KIND_HEADER = 'x-reranker-kind'
const RERANKER_MODEL_HEADER = 'x-reranker-model'
const INPUT_K_HEADER = 'x-input-k'
const TOP_K_HEADER = 'x-top-k'
const HYBRID_ALPHA_HEADER = 'x-hybrid-alpha'
const QUERY_REWRITE_TEMPLATE_HEADER = 'x-query-rewrite-template'
const LEARNED_HEAD_HEADER = 'x-learned-head'
const RETRIEVAL_PROFILE_HEADER = 'x-retrieval-profile'
const RETRIEVAL_PROFILES_HEADER = 'x-retrieval-profiles'
const GROUP_PROFILES_HEADER = 'x-group-profiles'

const parseSlugList = (raw: string | string[] | undefined): string[] | undefined => {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) return undefined
  const slugs = value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return slugs.length > 0 ? slugs : undefined
}

const readScalar = (raw: string | string[] | undefined): string | undefined => {
  const value = Array.isArray(raw) ? raw[0] : raw
  return value && value.length > 0 ? value : undefined
}

const parseFiniteNumber = (raw: string | string[] | undefined): number | undefined => {
  const value = readScalar(raw)
  if (value === undefined) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export function resolveAuth(req: IncomingMessage, strategy: McpAuthStrategy | undefined): McpAuthContext | null {
  // Default strategy: header with default header name.
  const effective: McpAuthStrategy = strategy ?? { type: 'header' }

  if (effective.type === 'header') {
    const headerName = (effective.headerName ?? DEFAULT_HEADER_NAME).toLowerCase()
    const tenantSlug = readScalar(req.headers[headerName])

    // Optional content-scoping headers — set when the proxy resolves the
    // owning token/agent's attached SearchProfile.
    const taxonomySlugs = parseSlugList(req.headers[TAXONOMY_HEADER_NAME])
    const folderSlugs = parseSlugList(req.headers[FOLDER_HEADER_NAME])

    // Retrieval params from the chosen SearchProfile. Empty/absent headers
    // leave the corresponding field undefined so the search tool can fall back
    // to its own defaults.
    const retrieval = readRetrievalHeaders(req.headers)

    // Catalog of profiles the agent can choose from (metadata only).
    const availableProfiles = readAvailableProfiles(req.headers[RETRIEVAL_PROFILES_HEADER])

    // Default profile slug — applied (resolved server-side) when none is chosen.
    const defaultProfileSlug = readScalar(req.headers[RETRIEVAL_PROFILE_HEADER])

    // Per-profile resolved config for multi-profile requests (compare).
    const groupProfiles = readGroupProfiles(req.headers[GROUP_PROFILES_HEADER])

    if (
      !tenantSlug &&
      !taxonomySlugs?.length &&
      !folderSlugs?.length &&
      !retrieval &&
      !availableProfiles?.length &&
      !defaultProfileSlug &&
      !groupProfiles
    ) {
      return null
    }

    return { tenantSlug, taxonomySlugs, folderSlugs, retrieval, availableProfiles, defaultProfileSlug, groupProfiles }
  }

  // Exhaustive guard. When new variants are added, TypeScript will force
  // handling them here instead of silently returning null.
  const _exhaustive: never = effective
  return _exhaustive
}

function readAvailableProfiles(
  raw: string | string[] | undefined
): Array<{ slug: string; name: string; description: string }> | undefined {
  const value = readScalar(raw)
  if (!value) return undefined
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as unknown
    if (!Array.isArray(parsed)) return undefined
    const profiles = parsed
      .filter(
        (p): p is { slug: string; name?: string; description?: string } =>
          Boolean(p) && typeof p === 'object' && typeof (p as { slug?: unknown }).slug === 'string'
      )
      .map(p => ({ slug: p.slug, name: p.name ?? p.slug, description: p.description ?? '' }))
    return profiles.length > 0 ? profiles : undefined
  } catch {
    return undefined
  }
}

/**
 * Decode the per-profile config map for multi-profile requests. The proxy sends
 * a base64 JSON `{ [slug]: { taxonomySlugs, folderSlugs, retrieval } }`, where
 * `retrieval.learnedHead` is itself a base64 weights blob (same encoding as the
 * single-profile header), kept binary so it doesn't bloat the JSON.
 */
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
const strArr = (v: unknown): string[] | undefined => (Array.isArray(v) ? (v as string[]) : undefined)

function parseGroupRetrieval(retrieval: Record<string, unknown> | undefined): ResolvedRetrievalScope['retrieval'] {
  if (!retrieval) return undefined
  return {
    rerankerKind: str(retrieval.rerankerKind),
    rerankerModel: str(retrieval.rerankerModel),
    inputK: num(retrieval.inputK),
    topK: num(retrieval.topK),
    hybridAlpha: num(retrieval.hybridAlpha),
    rewriteTemplate: str(retrieval.rewriteTemplate),
    learnedHead: decodeLearnedHead(str(retrieval.learnedHead))
  }
}

function readGroupProfiles(raw: string | string[] | undefined): Record<string, ResolvedRetrievalScope> | undefined {
  const value = readScalar(raw)
  if (!value) return undefined
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    const out: Record<string, ResolvedRetrievalScope> = {}
    for (const [slug, raw0] of Object.entries(parsed as Record<string, unknown>)) {
      const entry = raw0 as { taxonomySlugs?: unknown; folderSlugs?: unknown; retrieval?: Record<string, unknown> }
      out[slug] = {
        taxonomySlugs: strArr(entry.taxonomySlugs),
        folderSlugs: strArr(entry.folderSlugs),
        retrieval: parseGroupRetrieval(entry.retrieval)
      }
    }
    return Object.keys(out).length > 0 ? out : undefined
  } catch {
    return undefined
  }
}

function decodeLearnedHead(raw: string | undefined): { w: number[]; b: number } | undefined {
  if (!raw) return undefined
  try {
    const buf = Buffer.from(raw, 'base64')
    if (buf.byteLength < 8 || buf.byteLength % 4 !== 0) return undefined
    const dims = buf.byteLength / 4 - 1
    const w: number[] = []
    for (let i = 0; i < dims; i++) w.push(buf.readFloatLE(i * 4))
    const b = buf.readFloatLE(dims * 4)
    return { w, b }
  } catch {
    return undefined
  }
}

function readRetrievalHeaders(headers: IncomingMessage['headers']): McpAuthContext['retrieval'] | undefined {
  const rerankerKind = readScalar(headers[RERANKER_KIND_HEADER])
  const rerankerModel = readScalar(headers[RERANKER_MODEL_HEADER])
  const inputK = parseFiniteNumber(headers[INPUT_K_HEADER])
  const topK = parseFiniteNumber(headers[TOP_K_HEADER])
  const hybridAlpha = parseFiniteNumber(headers[HYBRID_ALPHA_HEADER])
  const rewriteTemplate = readScalar(headers[QUERY_REWRITE_TEMPLATE_HEADER])
  const learnedHead = decodeLearnedHead(readScalar(headers[LEARNED_HEAD_HEADER]))

  if (
    rerankerKind === undefined &&
    rerankerModel === undefined &&
    inputK === undefined &&
    topK === undefined &&
    hybridAlpha === undefined &&
    rewriteTemplate === undefined &&
    learnedHead === undefined
  ) {
    return undefined
  }
  return { rerankerKind, rerankerModel, inputK, topK, hybridAlpha, rewriteTemplate, learnedHead }
}
