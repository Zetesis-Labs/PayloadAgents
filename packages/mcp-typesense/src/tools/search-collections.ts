/**
 * Tool: search_collections
 * Search across chunk collections using lexical, semantic, or hybrid search.
 */

import type { DocumentSchema, SearchResponse, SearchResponseHit } from 'typesense/lib/Typesense/Documents'
import type { MultiSearchRequestSchema } from 'typesense/lib/Typesense/Types'
import { z } from 'zod'
import type { ToolContext } from '../context'
import { applyQueryRewriteTemplate } from '../query-rewrite'
import { setAttributes, withSpan } from '../tracing'
import type { ChunkCollectionConfig, McpAuthContext } from '../types'

/** Chunk document shape as returned by Typesense. Loose because the schema evolves per collection. */
type ChunkDoc = DocumentSchema

const MAX_PER_PAGE = 50
const DEFAULT_PER_PAGE = 20
const DEFAULT_SNIPPET_LENGTH = 300
const MAX_EXPAND_CONTEXT = 5
/**
 * Default number of nearest neighbors fetched by the vector search in
 * semantic/hybrid modes. Decoupled from per_page so that pagination does
 * not constrain recall. Overridden per-request when the caller's
 * SearchProfile sets `inputK`.
 */
const DEFAULT_VECTOR_K = 100
const DEFAULT_HYBRID_ALPHA = 0.7

export const searchCollectionsSchema = z.object({
  query: z.string().describe('Search query text'),
  collections: z
    .array(z.string())
    .optional()
    .describe('Chunk collection names to search. Defaults to all chunk collections.'),
  mode: z
    .enum(['lexical', 'semantic', 'hybrid'])
    .optional()
    .describe('Search mode: lexical (keyword), semantic (vector), or hybrid (both). Default: hybrid.'),
  filters: z
    .record(z.union([z.string(), z.array(z.string())]))
    .optional()
    .describe(
      'Facet filters to apply. Keys are field names (tenant, taxonomy_slugs, folder_slugs, headers), values are strings or arrays.'
    ),
  per_page: z
    .number()
    .int()
    .min(1)
    .max(MAX_PER_PAGE)
    .optional()
    .describe(`Results per page. Default: ${DEFAULT_PER_PAGE}. Max: ${MAX_PER_PAGE}.`),
  page: z.number().int().min(1).optional().describe('Page number. Default: 1.'),
  snippet_length: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      `Truncate chunk_text to N characters (with "…" suffix) to save context. Default: ${DEFAULT_SNIPPET_LENGTH}. Set to 0 for full text.`
    ),
  expand_context: z
    .number()
    .int()
    .min(0)
    .max(MAX_EXPAND_CONTEXT)
    .optional()
    .describe(
      `Inline N neighboring chunks (chunk_index ±N) for each hit, fetched in a single round trip. Default: 0 (no neighbors). Max: ${MAX_EXPAND_CONTEXT}.`
    )
})

export type SearchCollectionsInput = z.infer<typeof searchCollectionsSchema>

interface TaxonomyInfo {
  slug: string
  name: string
  type: string
  breadcrumb: string
}

interface NeighborChunk {
  chunk_index: number
  chunk_text: string
}

interface SearchHit {
  chunk_id: string
  parent_doc_id: string
  title: string
  chunk_text: string
  chunk_index: number
  taxonomy_slugs: string[]
  taxonomies: TaxonomyInfo[]
  headers: string[]
  score: number
  collection: string
  truncated?: boolean
  context?: { before: NeighborChunk[]; after: NeighborChunk[] }
}

export interface SearchResult {
  hits: SearchHit[]
  total_found: number
  page: number
  per_page: number
  search_time_ms: number
  snippet_length: number
}

function buildFilterString(filters: Record<string, string | string[]>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      parts.push(`${key}:[${value.join(',')}]`)
    } else {
      parts.push(`${key}:=${value}`)
    }
  }
  return parts.join(' && ')
}

function truncate(text: string, maxLength: number): { text: string; truncated: boolean } {
  if (maxLength <= 0 || text.length <= maxLength) {
    return { text, truncated: false }
  }
  return { text: `${text.slice(0, maxLength).trimEnd()}…`, truncated: true }
}

function resolveTargets(ctx: ToolContext, requested: string[] | undefined): ChunkCollectionConfig[] | null {
  if (!requested || requested.length === 0) {
    return [...ctx.collections.chunks]
  }
  const targets: ChunkCollectionConfig[] = []
  for (const name of requested) {
    const def = ctx.collections.byChunkName(name)
    if (!def) return null
    targets.push(def)
  }
  return targets
}

type SearchMode = 'lexical' | 'semantic' | 'hybrid'

/**
 * Build a Typesense multi-search request for one chunk collection.
 *
 * Semantic and hybrid rely on Typesense's auto-embed: the chunk collection
 * declares `embed.from` + `embed.model_config` on its schema, Typesense
 * embeds the `q` parameter server-side, and the `vector_query: '([], k:N)'`
 * syntax tells Typesense to use that server-side embedding as the search
 * vector. The MCP package never embeds queries client-side — there is no
 * embedding API key in the package surface.
 *
 * `prefix: false` is forced because Typesense rejects prefix search whenever
 * a remote embedder participates in `query_by` (which is always the case
 * under semantic/hybrid).
 */
function buildSearchParams(args: {
  collectionDef: ChunkCollectionConfig
  mode: SearchMode
  query: string
  filters: Record<string, string | string[]> | undefined
  perPage: number
  page: number
  vectorK: number
  hybridAlpha: number
  excludeEmbedding: boolean
}): MultiSearchRequestSchema<ChunkDoc, string> {
  const { collectionDef, mode, query, filters, perPage, page, vectorK, hybridAlpha, excludeEmbedding } = args
  const params: MultiSearchRequestSchema<ChunkDoc, string> = {
    collection: collectionDef.chunkCollection,
    per_page: perPage,
    page,
    q: '*'
  }
  if (excludeEmbedding) {
    params.exclude_fields = 'embedding'
  }

  if (filters && Object.keys(filters).length > 0) {
    params.filter_by = buildFilterString(filters)
  }

  const textFields = collectionDef.chunkSearchFields.join(',')

  if (mode === 'semantic') {
    params.q = query
    params.query_by = 'embedding'
    params.vector_query = `embedding:([], k:${vectorK})`
    params.prefix = false
    return params
  }

  if (mode === 'hybrid') {
    params.q = query
    params.query_by = `${textFields},embedding`
    params.vector_query = `embedding:([], k:${vectorK}, alpha:${hybridAlpha})`
    params.prefix = false
    return params
  }

  // Lexical only.
  params.q = query
  params.query_by = textFields
  return params
}

function extractScore(hit: SearchResponseHit<ChunkDoc>): number {
  // Typesense exposes hit.vector_distance (number, lower is better) for vector hits,
  // and hit.text_match (number, higher is better) for lexical hits. Hybrid hits get
  // both, with text_match driving the RRF rank. We do NOT use text_match_info.score:
  // it is an int64 packed value serialized as a string that exceeds MAX_SAFE_INTEGER
  // and collapses every hit to the same float after Number() conversion.
  const typed = hit as SearchResponseHit<ChunkDoc> & { vector_distance?: number; text_match?: number }
  return typed.vector_distance ?? typed.text_match ?? 0
}

function mapHit(hit: SearchResponseHit<ChunkDoc>, collectionName: string, snippetLength: number): SearchHit {
  const doc = hit.document
  const rawText = String(doc.chunk_text || '')
  const { text, truncated } = truncate(rawText, snippetLength)
  return {
    chunk_id: String(doc.id || ''),
    parent_doc_id: String(doc.parent_doc_id || ''),
    title: String(doc.title || ''),
    chunk_text: text,
    chunk_index: Number(doc.chunk_index ?? 0),
    taxonomy_slugs: (doc.taxonomy_slugs as string[]) || [],
    taxonomies: [],
    headers: (doc.headers as string[]) || [],
    score: extractScore(hit),
    collection: collectionName,
    ...(truncated ? { truncated: true } : {})
  }
}

/**
 * Round-robin merge across collections: take rank-0 from each, then rank-1, etc.
 * Preserves Typesense's per-collection ordering while giving every collection fair
 * representation in the final page. Single-collection case degenerates to passthrough.
 */
function roundRobinMerge(hitsPerCollection: SearchHit[][]): SearchHit[] {
  const merged: SearchHit[] = []
  const maxLen = Math.max(0, ...hitsPerCollection.map(h => h.length))
  for (let i = 0; i < maxLen; i++) {
    for (const collection of hitsPerCollection) {
      const hit = collection[i]
      if (hit) merged.push(hit)
    }
  }
  return merged
}

/** A coalesced fetch unit: all hits for one (collection, parent) share one query. */
interface NeighborGroup {
  collection: string
  parent: string
  indices: number[]
  hitsRef: SearchHit[]
}

function groupHitsByParent(hits: SearchHit[]): NeighborGroup[] {
  const groups = new Map<string, NeighborGroup>()
  for (const hit of hits) {
    const key = `${hit.collection}::${hit.parent_doc_id}`
    let g = groups.get(key)
    if (!g) {
      g = { collection: hit.collection, parent: hit.parent_doc_id, indices: [], hitsRef: [] }
      groups.set(key, g)
    }
    g.indices.push(hit.chunk_index)
    g.hitsRef.push(hit)
  }
  return [...groups.values()]
}

function buildNeighborSearch(
  g: NeighborGroup,
  expand: number,
  tenantSlug: string | null
): MultiSearchRequestSchema<ChunkDoc, string> {
  const minIdx = Math.max(0, Math.min(...g.indices) - expand)
  const maxIdx = Math.max(...g.indices) + expand
  const filterParts = [`parent_doc_id:=${g.parent}`, `chunk_index:>=${minIdx}`, `chunk_index:<=${maxIdx}`]
  if (tenantSlug) filterParts.push(`tenant:=${tenantSlug}`)
  return {
    collection: g.collection,
    q: '*',
    query_by: 'chunk_text',
    filter_by: filterParts.join(' && '),
    sort_by: 'chunk_index:asc',
    per_page: Math.min(MAX_PER_PAGE, (maxIdx - minIdx + 1) * 2),
    exclude_fields: 'embedding'
  }
}

function neighborsFromHits(rawHits: SearchResponseHit<ChunkDoc>[] | undefined): NeighborChunk[] {
  return (rawHits ?? []).map(h => ({
    chunk_index: Number(h.document.chunk_index ?? 0),
    chunk_text: String(h.document.chunk_text || '')
  }))
}

function attachNeighbors(hit: SearchHit, fetched: NeighborChunk[], expand: number, snippetLength: number): void {
  const before: NeighborChunk[] = []
  const after: NeighborChunk[] = []
  for (const c of fetched) {
    if (c.chunk_index === hit.chunk_index) continue
    const delta = c.chunk_index - hit.chunk_index
    if (delta < 0 && delta >= -expand) {
      before.push({ chunk_index: c.chunk_index, chunk_text: truncate(c.chunk_text, snippetLength).text })
    } else if (delta > 0 && delta <= expand) {
      after.push({ chunk_index: c.chunk_index, chunk_text: truncate(c.chunk_text, snippetLength).text })
    }
  }
  if (before.length > 0 || after.length > 0) {
    hit.context = { before, after }
  }
}

/**
 * Inline neighboring chunks (chunk_index ±expand) for each hit. Hits sharing
 * the same parent_doc_id are coalesced into a single range query so the total
 * cost is one Typesense multi-search regardless of hit count.
 */
async function expandHitContexts(
  ctx: ToolContext,
  hits: SearchHit[],
  expand: number,
  snippetLength: number,
  tenantSlug: string | null
): Promise<void> {
  if (expand <= 0 || hits.length === 0) return

  const groupArr = groupHitsByParent(hits)
  const searches = groupArr.map(g => buildNeighborSearch(g, expand, tenantSlug))

  const result = await ctx.typesense.multiSearch.perform<[ChunkDoc]>({ searches })
  ;(result.results as SearchResponse<ChunkDoc>[]).forEach((r, i) => {
    const g = groupArr[i]
    if (!g) return
    const fetched = neighborsFromHits(r.hits as SearchResponseHit<ChunkDoc>[] | undefined)
    for (const hit of g.hitsRef) {
      attachNeighbors(hit, fetched, expand, snippetLength)
    }
  })
}

async function enrichTaxonomies(ctx: ToolContext, hits: SearchHit[]): Promise<void> {
  const allSlugs = [...new Set(hits.flatMap(h => h.taxonomy_slugs))]
  if (allSlugs.length === 0) return
  const resolved = await ctx.taxonomy.resolveSlugs(allSlugs)
  const slugMap = new Map(resolved.map(r => [r.slug, r]))
  for (const hit of hits) {
    hit.taxonomies = hit.taxonomy_slugs.map(s => slugMap.get(s)).filter((t): t is TaxonomyInfo => t !== undefined)
  }
}

function emptyResult(input: SearchCollectionsInput): SearchResult {
  return {
    hits: [],
    total_found: 0,
    page: input.page ?? 1,
    per_page: input.per_page ?? DEFAULT_PER_PAGE,
    search_time_ms: 0,
    snippet_length: input.snippet_length ?? DEFAULT_SNIPPET_LENGTH
  }
}

export async function searchCollections(
  input: SearchCollectionsInput,
  ctx: ToolContext,
  auth: McpAuthContext | null
): Promise<SearchResult> {
  return withSpan(
    'search_collections',
    {
      'retrieval.query': input.query,
      'retrieval.mode': input.mode ?? 'hybrid',
      'retrieval.requested_collections': input.collections,
      'retrieval.requested_per_page': input.per_page,
      'retrieval.requested_page': input.page,
      'mcp.tenant_slug': auth?.tenantSlug,
      'langfuse.trace.metadata.tenant_slug': auth?.tenantSlug,
      'langfuse.trace.tags': auth?.tenantSlug ? [`tenant:${auth.tenantSlug}`] : undefined,
      'retrieval.scope.taxonomy_slugs_count': auth?.taxonomySlugs?.length,
      'retrieval.scope.folder_slugs_count': auth?.folderSlugs?.length,
      'retrieval.scope.taxonomy_slugs': auth?.taxonomySlugs,
      'retrieval.scope.folder_slugs': auth?.folderSlugs,
      'retrieval.profile.reranker_kind': auth?.retrieval?.rerankerKind,
      'retrieval.profile.reranker_model': auth?.retrieval?.rerankerModel,
      'retrieval.profile.input_k': auth?.retrieval?.inputK,
      'retrieval.profile.top_k': auth?.retrieval?.topK,
      'retrieval.profile.hybrid_alpha': auth?.retrieval?.hybridAlpha
    },
    span => executeSearch(input, ctx, auth, span)
  )
}

async function executeSearch(
  input: SearchCollectionsInput,
  ctx: ToolContext,
  auth: McpAuthContext | null,
  parentSpan: import('@opentelemetry/api').Span
): Promise<SearchResult> {
  // Auto-scope by tenant, taxonomy, and folder when auth provides them.
  let scopedFilters = input.filters
  if (auth?.tenantSlug && !scopedFilters?.tenant) {
    scopedFilters = { ...scopedFilters, tenant: auth.tenantSlug }
  }
  if (auth?.taxonomySlugs?.length && !scopedFilters?.taxonomy_slugs) {
    scopedFilters = {
      ...scopedFilters,
      taxonomy_slugs: auth.taxonomySlugs.length === 1 ? auth.taxonomySlugs[0] : auth.taxonomySlugs
    }
  }
  if (auth?.folderSlugs?.length && !scopedFilters?.folder_slugs) {
    scopedFilters = {
      ...scopedFilters,
      folder_slugs: auth.folderSlugs.length === 1 ? auth.folderSlugs[0] : auth.folderSlugs
    }
  }

  const targets = resolveTargets(ctx, input.collections)
  if (targets === null) return emptyResult(input)

  const perPage = Math.min(input.per_page ?? DEFAULT_PER_PAGE, MAX_PER_PAGE)
  const page = input.page ?? 1
  const snippetLength = input.snippet_length ?? DEFAULT_SNIPPET_LENGTH
  const mode: SearchMode = input.mode ?? 'hybrid'

  // Profile-driven query rewrite. When the SearchProfile defines a
  // `queryRewrite` Mustache template, expand it before the query reaches
  // Typesense — both lexical and vector legs see the rewritten string.
  const rewrittenQuery = auth?.retrieval?.rewriteTemplate
    ? applyQueryRewriteTemplate(auth.retrieval.rewriteTemplate, {
        query: input.query,
        tenant_slug: auth?.tenantSlug
      })
    : input.query
  const queryUsed = rewrittenQuery || input.query
  setAttributes(parentSpan, {
    'query.original': input.query,
    'query.rewritten': queryUsed,
    'query.rewrite_applied': rewrittenQuery !== input.query
  })

  // SearchProfile-driven knobs. inputK caps the per-collection recall sent
  // to the reranker (or to the caller when no reranker is configured).
  // hybridAlpha weights vector vs lexical in hybrid mode. topK caps the
  // final response — defaults to perPage so the legacy single-stage
  // behavior is preserved when no profile is attached.
  const inputK = clampPositiveInt(auth?.retrieval?.inputK, DEFAULT_VECTOR_K, 1, 1000)
  const hybridAlpha = clampNumber(auth?.retrieval?.hybridAlpha, DEFAULT_HYBRID_ALPHA, 0, 1)
  const topK = clampPositiveInt(auth?.retrieval?.topK, perPage, 1, MAX_PER_PAGE)
  const fetchPerCollection = Math.min(inputK, MAX_PER_PAGE)

  const learnedHead = auth?.retrieval?.learnedHead
  const excludeEmbedding = !learnedHead

  const searches = targets.map(collectionDef =>
    buildSearchParams({
      collectionDef,
      mode,
      query: queryUsed,
      filters: scopedFilters,
      perPage: fetchPerCollection,
      page,
      vectorK: inputK,
      hybridAlpha,
      excludeEmbedding
    })
  )

  // Execute multi-search (non-union form → `{ results: SearchResponse[] }`)
  const result = await withSpan(
    'typesense.multi_search',
    {
      'typesense.collections': targets.map(t => t.chunkCollection),
      'typesense.mode': mode,
      'typesense.vector_k': inputK,
      'typesense.hybrid_alpha': hybridAlpha,
      'typesense.per_collection_limit': fetchPerCollection
    },
    () => ctx.typesense.multiSearch.perform<[ChunkDoc]>({ searches })
  )

  // Typesense already returns each collection's hits in the correct order
  // (text_match desc for lexical, vector_distance asc for semantic, RRF for hybrid),
  // so we never re-sort within a collection — only merge across.
  const hitsPerCollection: SearchHit[][] = []
  let totalFound = 0
  let totalTime = 0

  ;(result.results as SearchResponse<ChunkDoc>[]).forEach((r, index) => {
    const collectionDef = targets[index]
    if (!collectionDef) return
    totalFound += r.found || 0
    totalTime += r.search_time_ms || 0

    const rawHits = (r.hits as SearchResponseHit<ChunkDoc>[] | undefined) ?? []
    const mappedHits = rawHits.map(raw => {
      const hit = mapHit(raw, collectionDef.chunkCollection, snippetLength)
      if (learnedHead) {
        const emb = raw.document.embedding as number[] | undefined
        if (emb && emb.length === learnedHead.w.length) {
          let s = learnedHead.b
          for (let i = 0; i < learnedHead.w.length; i++) s += (learnedHead.w[i] ?? 0) * (emb[i] ?? 0)
          hit.score = s
        }
      }
      return hit
    })
    hitsPerCollection.push(mappedHits)
  })

  const merged = roundRobinMerge(hitsPerCollection)
  const afterHead = learnedHead ? [...merged].sort((a, b) => b.score - a.score) : merged
  setAttributes(parentSpan, {
    'retrieval.merged_candidates': merged.length,
    'retrieval.typesense_total_found': totalFound,
    'retrieval.typesense_time_ms': totalTime
  })
  // Reranker scores chunks against the rewritten query — the same string
  // Typesense used — so reranker/Typesense agree on what "relevant" means.
  const reranked = await maybeRerank(ctx, auth, queryUsed, afterHead)
  const finalHits = reranked.slice(0, topK)
  setAttributes(parentSpan, {
    'retrieval.final_hits_count': finalHits.length,
    'retrieval.top_score': finalHits[0]?.score
  })
  await enrichTaxonomies(ctx, finalHits)

  if (input.expand_context && input.expand_context > 0) {
    const tenantSlug = auth?.tenantSlug ?? null
    await expandHitContexts(ctx, finalHits, input.expand_context, snippetLength, tenantSlug)
  }

  return {
    hits: finalHits,
    total_found: totalFound,
    page,
    per_page: topK,
    search_time_ms: totalTime,
    snippet_length: snippetLength
  }
}

function clampPositiveInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  const n = Math.floor(value)
  return Math.max(min, Math.min(max, n))
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

/**
 * Two-stage retrieval: when the caller's SearchProfile selects a reranker
 * provider AND the MCP runtime was configured with a reranker factory, run
 * the merged candidates through the reranker and return them sorted by
 * `rerankerScore` desc. Falls back to the original order on any failure
 * so a broken reranker degrades to single-stage retrieval instead of an
 * empty response.
 */
async function maybeRerank(
  ctx: ToolContext,
  auth: McpAuthContext | null,
  query: string,
  hits: SearchHit[]
): Promise<SearchHit[]> {
  const retrieval = auth?.retrieval
  if (!retrieval?.rerankerKind || retrieval.rerankerKind === 'none') return hits
  if (!retrieval.rerankerModel) return hits
  if (!ctx.resolveReranker) return hits
  if (hits.length === 0) return hits

  const reranker = ctx.resolveReranker({
    kind: retrieval.rerankerKind,
    model: retrieval.rerankerModel
  })

  return withSpan(
    `reranker.${retrieval.rerankerKind}`,
    {
      'reranker.kind': retrieval.rerankerKind,
      'reranker.model': retrieval.rerankerModel,
      'reranker.candidates_count': hits.length
    },
    async span => {
      try {
        const ranked = await reranker(
          query,
          hits.map(hit => ({
            id: hit.chunk_id,
            text: hit.chunk_text,
            previousScore: hit.score,
            original: hit
          }))
        )
        const reordered = ranked.map(entry => {
          const hit = entry.original as SearchHit
          hit.score = entry.rerankerScore
          return hit
        })
        setAttributes(span, {
          'reranker.top_score': reordered[0]?.score,
          'reranker.bottom_score': reordered[reordered.length - 1]?.score
        })
        return reordered
      } catch (err) {
        console.error('[mcp-typesense] reranker failed, falling back to single-stage hits:', err)
        setAttributes(span, { 'reranker.failed': true, 'reranker.fallback': 'single_stage' })
        return hits
      }
    }
  )
}
