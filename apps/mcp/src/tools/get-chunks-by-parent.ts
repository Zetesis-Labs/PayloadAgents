/**
 * Tool: get_chunks_by_parent
 * Retrieve all chunks belonging to a parent document, ordered by chunk_index.
 */

import { z } from 'zod'
import { getTypesenseClient } from '../client'
import { COLLECTIONS } from '../config'

export const getChunksByParentSchema = z.object({
  collection: z.string().describe('Chunk collection name (e.g. posts_chunk, books_chunk)'),
  parent_doc_id: z.string().describe('The parent document ID to retrieve all chunks for')
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

export async function getChunksByParent(input: GetChunksByParentInput) {
  const def = COLLECTIONS[input.collection]
  if (!def) {
    return {
      error: `Unknown collection: ${input.collection}. Available: ${Object.keys(COLLECTIONS).join(', ')}`
    }
  }

  const client = getTypesenseClient()

  const result = await client
    .collections(input.collection)
    .documents()
    .search({
      q: '*',
      query_by: def.searchFields[0] || 'title',
      filter_by: `parent_doc_id:=${input.parent_doc_id}`,
      sort_by: 'chunk_index:asc',
      per_page: 250,
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

  return {
    parent_doc_id: input.parent_doc_id,
    collection: input.collection,
    chunks,
    total: chunks.length
  }
}
