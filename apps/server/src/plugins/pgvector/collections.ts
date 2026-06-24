import type { IndexableCollectionConfig } from '@zetesis/payload-indexer'
import type { PgvectorFieldMapping } from '@zetesis/payload-pgvector'
import { createDynamicContentTransform, transformCategories } from '../typesense/transforms'

/**
 * pgvector indexing config — mirrors the Typesense `posts_chunk` table so both
 * backends index the same content in parallel. Only the chunked table is
 * configured (it's the one that gets embedded + vector-searched). Field `type`
 * is the SQL column type; the standard chunk columns (parent_doc_id,
 * chunk_text, timestamps, ...) and the `embedding vector(N)` column are added
 * automatically by the schema derivation.
 */
export const pgvectorCollections: IndexableCollectionConfig<PgvectorFieldMapping> = {
  posts: [
    {
      enabled: true,
      tableName: 'posts_pgvector_chunk',
      displayName: 'Posts (pgvector)',
      syncDepth: 1,
      embedding: {
        fields: [{ field: 'content', transform: createDynamicContentTransform() }],
        chunking: { strategy: 'markdown', size: 2000, overlap: 300 },
        // pgvector embeds app-side via the adapter's EmbeddingProvider; this
        // autoEmbed block is unused by the backend but required by the type.
        autoEmbed: { from: ['chunk_text'], modelConfig: {} }
      },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'slug', type: 'text', index: true },
        { name: 'publishedAt', type: 'bigint', optional: true },
        {
          name: 'taxonomy_slugs',
          type: 'text[]',
          index: true,
          optional: true,
          transform: transformCategories,
          payloadField: 'categories'
        }
      ]
    }
  ]
}
