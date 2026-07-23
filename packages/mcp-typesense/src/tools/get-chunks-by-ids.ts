/**
 * Tool: get_chunks_by_ids
 * Retrieve specific chunks by their IDs from a collection.
 */

import { z } from 'zod'
import type { ToolContext } from '../context'
import type { McpAuthContext } from '../types'
import { scopeFilterClauses } from './scope-filters'

export const getChunksByIdsSchema = z.object({
  collection: z.string().describe('Chunk collection name'),
  ids: z.array(z.string()).min(1).describe('Array of chunk document IDs to retrieve'),
  retrieval_profile: z
    .string()
    .optional()
    .describe(
      'Profile slug whose scope governs this read. Pass the SAME profile you searched with — ids found under one profile are not readable under another. Defaults to your default profile.'
    )
})

export type GetChunksByIdsInput = z.infer<typeof getChunksByIdsSchema>

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

export async function getChunksByIds(input: GetChunksByIdsInput, ctx: ToolContext, auth: McpAuthContext | null) {
  const def = ctx.collections.byChunkName(input.collection)
  if (!def) {
    return {
      error: `Unknown collection: ${input.collection}. Available: ${ctx.collections.chunkNames.join(', ')}`
    }
  }

  // Ids alone are not an authorization: without the caller's scope an agent
  // could search inside its retrieval profile and then read outside it by id.
  const filterParts = [`id:[${input.ids.join(',')}]`, ...scopeFilterClauses(auth)]

  const result = await ctx.typesense
    .collections(input.collection)
    .documents()
    .search({
      q: '*',
      query_by: def.chunkSearchFields[0] || 'title',
      filter_by: filterParts.join(' && '),
      per_page: input.ids.length,
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

  // Tell the agent why it got fewer chunks than it asked for, so a scope drop
  // does not read as "these chunks do not exist". We cannot distinguish a
  // nonexistent id from a scope-filtered one without a second unscoped query,
  // so the notice names both and points at the usual cause (wrong profile).
  const missing = input.ids.length - chunks.length
  const scopeNotice =
    missing > 0 && scopeFilterClauses(auth).length > 0
      ? `${missing} of the ${input.ids.length} requested chunks were not returned — they do not exist or are outside ` +
        'the scope of the retrieval profile used for this read. If they came from a search under a different profile, ' +
        'retry with that `retrieval_profile`.'
      : undefined

  return { chunks, total: chunks.length, ...(scopeNotice ? { scope_notice: scopeNotice } : {}) }
}
