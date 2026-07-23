/**
 * Tool: get_chunks_by_parent
 * Retrieve chunks belonging to a parent document, ordered by chunk_index.
 * Supports chunk_index range filtering and pagination to avoid context bloat.
 */

import { z } from 'zod'
import type { ToolContext } from '../context'
import type { McpAuthContext } from '../types'
import { scopeFilterClauses } from './scope-filters'

const MAX_PER_PAGE = 100
const DEFAULT_PER_PAGE = 50

export const getChunksByParentSchema = z.object({
  collection: z.string().describe('Chunk collection name'),
  parent_doc_id: z.string().describe('The parent document ID to retrieve all chunks for'),
  start_chunk: z.number().int().min(0).optional().describe('Inclusive start of chunk_index range.'),
  end_chunk: z.number().int().min(0).optional().describe('Exclusive end of chunk_index range.'),
  per_page: z
    .number()
    .int()
    .min(1)
    .max(MAX_PER_PAGE)
    .optional()
    .describe(`Results per page. Default: ${DEFAULT_PER_PAGE}. Max: ${MAX_PER_PAGE}.`),
  page: z.number().int().min(1).optional().describe('Page number (1-indexed). Default: 1.')
})

export type GetChunksByParentInput = z.infer<typeof getChunksByParentSchema>

interface ChunkDocument {
  id: string
  parent_doc_id: string
  title: string
  chunk_text: string
  chunk_index: number
  taxonomy_slugs: string[]
  headers: string[]
  slug: string
  tenant: string
}

export interface GetChunksByParentSuccess {
  parent_doc_id: string
  collection: string
  chunks: ChunkDocument[]
  total: number
  range_total: number
  page: number
  per_page: number
  has_more: boolean
  range?: { start_chunk: number | null; end_chunk: number | null }
}

export interface GetChunksByParentError {
  error: string
}

export type GetChunksByParentResult = GetChunksByParentSuccess | GetChunksByParentError

export async function getChunksByParent(
  input: GetChunksByParentInput,
  ctx: ToolContext,
  auth: McpAuthContext | null
): Promise<GetChunksByParentResult> {
  const def = ctx.collections.byChunkName(input.collection)
  if (!def) {
    return {
      error: `Unknown collection: ${input.collection}. Available: ${ctx.collections.chunkNames.join(', ')}`
    }
  }

  const perPage = Math.min(input.per_page ?? DEFAULT_PER_PAGE, MAX_PER_PAGE)
  const page = input.page ?? 1

  // Build filter: parent_doc_id + the caller's scope (tenant + profile
  // taxonomy/folder) + optional chunk_index range. Scoping here keeps a parent
  // read inside the same boundary search_collections enforces — a parent_doc_id
  // surfaced by one profile must not become a back door into another.
  const filterParts: string[] = [`parent_doc_id:=${input.parent_doc_id}`, ...scopeFilterClauses(auth)]
  if (input.start_chunk !== undefined) filterParts.push(`chunk_index:>=${input.start_chunk}`)
  if (input.end_chunk !== undefined) filterParts.push(`chunk_index:<${input.end_chunk}`)
  const filter_by = filterParts.join(' && ')

  const result = await ctx.typesense
    .collections(input.collection)
    .documents()
    .search({
      q: '*',
      query_by: def.chunkSearchFields[0] || 'title',
      filter_by,
      sort_by: 'chunk_index:asc',
      per_page: perPage,
      page,
      exclude_fields: 'embedding'
    })

  const chunks: ChunkDocument[] = (result.hits || []).map(hit => {
    const doc = hit.document as Record<string, unknown>
    return {
      id: String(doc.id || ''),
      parent_doc_id: String(doc.parent_doc_id || ''),
      title: String(doc.title || ''),
      chunk_text: String(doc.chunk_text || ''),
      chunk_index: Number(doc.chunk_index ?? 0),
      taxonomy_slugs: (doc.taxonomy_slugs as string[]) || [],
      headers: (doc.headers as string[]) || [],
      slug: String(doc.slug || ''),
      tenant: String(doc.tenant || '')
    }
  })

  const rangeTotal = result.found || 0
  const hasMore = page * perPage < rangeTotal

  return {
    parent_doc_id: input.parent_doc_id,
    collection: input.collection,
    chunks,
    total: chunks.length,
    range_total: rangeTotal,
    page,
    per_page: perPage,
    has_more: hasMore,
    ...(input.start_chunk !== undefined || input.end_chunk !== undefined
      ? { range: { start_chunk: input.start_chunk ?? null, end_chunk: input.end_chunk ?? null } }
      : {})
  }
}
