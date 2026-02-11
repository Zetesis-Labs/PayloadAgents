/**
 * Tool: search_collections
 * Search across chunk collections using lexical, semantic, or hybrid search.
 */

import OpenAI from 'openai'
import { z } from 'zod'
import { getTypesenseClient } from '../client'
import { CHUNK_COLLECTIONS, COLLECTIONS, type CollectionDef, embeddingConfig } from '../config'

export const searchCollectionsSchema = z.object({
  query: z.string().describe('Search query text'),
  collections: z
    .array(z.string())
    .optional()
    .describe('Chunk collection names to search. Defaults to all chunk collections (posts_chunk, books_chunk).'),
  mode: z
    .enum(['lexical', 'semantic', 'hybrid'])
    .optional()
    .describe('Search mode: lexical (keyword), semantic (vector), or hybrid (both). Default: hybrid.'),
  filters: z
    .record(z.union([z.string(), z.array(z.string())]))
    .optional()
    .describe(
      'Facet filters to apply. Keys are field names (tenant, taxonomy_slugs, headers), values are strings or arrays.'
    ),
  per_page: z.number().optional().describe('Results per page. Default: 20.'),
  page: z.number().optional().describe('Page number. Default: 1.')
})

export type SearchCollectionsInput = z.infer<typeof searchCollectionsSchema>

interface SearchHit {
  chunk_id: string
  parent_doc_id: string
  title: string
  chunk_text: string
  chunk_index: number
  taxonomy_slugs: string[]
  headers: string[]
  score: number
  collection: string
}

interface SearchResult {
  hits: SearchHit[]
  total_found: number
  page: number
  per_page: number
  search_time_ms: number
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

async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!embeddingConfig.apiKey) return null

  try {
    const openai = new OpenAI({ apiKey: embeddingConfig.apiKey })
    const response = await openai.embeddings.create({
      model: embeddingConfig.model,
      input: text,
      dimensions: embeddingConfig.dimensions
    })
    return response.data[0]?.embedding ?? null
  } catch {
    return null
  }
}

async function searchSingleCollection(
  collectionDef: CollectionDef,
  query: string,
  mode: 'lexical' | 'semantic' | 'hybrid',
  filters?: Record<string, string | string[]>,
  embedding?: number[] | null,
  perPage = 20,
  page = 1
): Promise<{ hits: SearchHit[]; found: number; searchTimeMs: number }> {
  // Deprecated in favor of multi-search to support large vector queries (POST)
  return { hits: [], found: 0, searchTimeMs: 0 }
}

export async function searchCollections(input: SearchCollectionsInput): Promise<SearchResult> {
  const client = getTypesenseClient()

  // Resolve target collections
  const targets: CollectionDef[] = []
  if (input.collections && input.collections.length > 0) {
    for (const name of input.collections) {
      const def = COLLECTIONS[name]
      if (!def) {
        return {
          hits: [],
          total_found: 0,
          page: input.page ?? 1,
          per_page: input.per_page ?? 20,
          search_time_ms: 0
        }
      }
      targets.push(def)
    }
  } else {
    targets.push(...CHUNK_COLLECTIONS)
  }

  // Generate embedding for semantic/hybrid modes
  const mode = input.mode ?? 'hybrid'
  let embedding: number[] | null = null
  if (mode === 'semantic' || mode === 'hybrid') {
    embedding = await generateEmbedding(input.query)
  }

  // Prepare multi-search requests
  const searches = targets.map(collectionDef => {
    const searchParams: Record<string, unknown> = {
      collection: collectionDef.name,
      per_page: input.per_page ?? 20,
      page: input.page ?? 1,
      exclude_fields: 'embedding'
    }

    if (input.filters && Object.keys(input.filters).length > 0) {
      searchParams.filter_by = buildFilterString(input.filters)
    }

    if (mode === 'lexical') {
      searchParams.q = input.query
      searchParams.query_by = collectionDef.searchFields.join(',')
    } else if (mode === 'semantic' && embedding) {
      searchParams.q = '*'
      searchParams.vector_query = `embedding:([${embedding.join(',')}], k:${(input.per_page ?? 20) * 2})`
    } else if (mode === 'hybrid' && embedding) {
      searchParams.q = input.query
      searchParams.query_by = collectionDef.searchFields.join(',')
      searchParams.vector_query = `embedding:([${embedding.join(',')}], k:${(input.per_page ?? 20) * 2}, alpha:0.7)`
    } else {
      // Fallback to lexical
      searchParams.q = input.query
      searchParams.query_by = collectionDef.searchFields.join(',')
    }

    return searchParams
  })

  // Execute multi-search
  const result = await client.multiSearch.perform({ searches } as any, { queryParams: {} })

  // Process results
  const allHits: SearchHit[] = []
  let totalFound = 0
  let totalTime = 0

  result.results.forEach((r: any, index: number) => {
    const collectionDef = targets[index]
    totalFound += r.found || 0
    totalTime += r.search_time_ms || 0

    if (r.hits) {
      r.hits.forEach((hit: any) => {
        const doc = hit.document as Record<string, unknown>
        allHits.push({
          chunk_id: String(doc.id || ''),
          parent_doc_id: String(doc.parent_doc_id || ''),
          title: String(doc.title || ''),
          chunk_text: String(doc.chunk_text || ''),
          chunk_index: Number(doc.chunk_index ?? 0),
          taxonomy_slugs: (doc.taxonomy_slugs as string[]) || [],
          headers: (doc.headers as string[]) || [],
          score: (hit.vector_distance as number) ?? hit.text_match_info?.score ?? 0,
          collection: collectionDef.name
        })
      })
    }
  })

  // Sort by score
  allHits.sort((a, b) => {
    if (mode === 'lexical') return b.score - a.score
    return a.score - b.score // Lower distance is better for semantic/hybrid
  })

  return {
    hits: allHits.slice(0, input.per_page ?? 20),
    total_found: totalFound,
    page: input.page ?? 1,
    per_page: input.per_page ?? 20,
    search_time_ms: totalTime
  }
}
