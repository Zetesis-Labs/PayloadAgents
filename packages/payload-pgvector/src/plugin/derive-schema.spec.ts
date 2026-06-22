import { describe, expect, it } from 'vitest'
import type { PgFieldSchema } from '../adapter/types'
import { deriveCollectionSchemas } from './derive-schema'
import type { PgvectorPluginConfig } from './types'

/**
 * Pins the 3-way column contract that has no compile-time enforcement:
 *   payload-indexer buildChunkDocument (what the syncer writes)
 *     ↔ deriveCollectionSchemas (the table it builds, tested here)
 *     ↔ mcp-pgvector buildSchema/filterColumns (what the probe reads + filters on).
 * A rename in any leg silently mis-filters at runtime; this test makes the
 * derive-schema leg fail loudly instead.
 */
const chunkedCollections = {
  posts: [
    {
      enabled: true,
      tableName: 'posts_pgvector_chunk',
      syncDepth: 1,
      embedding: {
        fields: [],
        chunking: { strategy: 'markdown', size: 2000, overlap: 300 },
        autoEmbed: { from: ['chunk_text'], modelConfig: {} }
      },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'slug', type: 'text', index: true },
        { name: 'taxonomy_slugs', type: 'text[]', index: true, optional: true }
      ]
    }
  ]
}

function derive() {
  const [schema] = deriveCollectionSchemas({
    collections: chunkedCollections,
    dimensions: 1536
  } as unknown as PgvectorPluginConfig)
  const byName = new Map<string, PgFieldSchema>(schema.fields.map(f => [f.name, f]))
  return { schema, byName }
}

describe('deriveCollectionSchemas — chunk table contract', () => {
  it('names the table and embeds from chunk_text', () => {
    const { schema } = derive()
    expect(schema.name).toBe('posts_pgvector_chunk')
    expect(schema.embedFrom).toEqual(['chunk_text'])
    expect(schema.idField).toBe('id')
  })

  it('exposes the columns mcp-pgvector filters and reads on, with matching types', () => {
    const { byName } = derive()
    // Standard chunk columns the probe relies on (parent_doc_id, slug, chunk_text).
    expect(byName.get('parent_doc_id')?.type).toBe('text')
    expect(byName.get('chunk_text')?.type).toBe('text')
    expect(byName.get('chunk_index')?.type).toBe('int')
    expect(byName.get('slug')?.type).toBe('text')
    // User scoping column used as the non-overridable taxonomy filter.
    expect(byName.get('taxonomy_slugs')?.type).toBe('text[]')
  })

  it('merges the user index flag onto the standard slug column instead of dropping it', () => {
    const { byName } = derive()
    expect(byName.get('slug')?.index).toBe(true)
    // taxonomy_slugs (user field) keeps its index too.
    expect(byName.get('taxonomy_slugs')?.index).toBe(true)
  })

  it('appends the embedding vector column at the configured dimensionality', () => {
    const { byName } = derive()
    expect(byName.get('embedding')).toMatchObject({ type: 'vector', dimensions: 1536 })
  })
})
