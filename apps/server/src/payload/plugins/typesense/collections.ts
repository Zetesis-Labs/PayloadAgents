/**
 * Indexable Collections Configuration
 * Defines which Payload collections are indexed in Typesense
 */

import type { IndexableCollectionConfig } from '@nexo-labs/payload-indexer'
import { transformLexicalToMarkdown } from '@nexo-labs/payload-indexer'
import type { TypesenseFieldMapping } from '@nexo-labs/payload-typesense'
import { transformTenant, transformCategories } from './transforms'


// ============================================================================
// COLLECTIONS
// ============================================================================

export const collections: IndexableCollectionConfig<TypesenseFieldMapping> = {
  pages: [
    {
      enabled: true,
      tableName: 'pages_chunk',
      displayName: 'Pages (Chunked)',
      embedding: {
        fields: [{ field: 'content', transform: transformLexicalToMarkdown }],
        chunking: { strategy: 'markdown', size: 2000, overlap: 300 },
      },
      fields: [
        { name: 'title', type: 'string' },
        { name: 'slug', type: 'string', index: true },
        { name: 'publishedAt', type: 'int64', index: true },
        {
          name: 'tenant',
          type: 'string',
          facet: true,
          optional: true,
          transform: transformTenant,
        },
        {
          name: 'taxonomy_slugs',
          type: 'string[]',
          facet: true,
          optional: true,
          transform: transformCategories,
          payloadField: 'categories',
        },
      ],
    },
    // Full document version for search
    {
      enabled: true,
      tableName: 'pages',
      displayName: 'Pages',
      fields: [
        { name: 'title', type: 'string' },
        { name: 'slug', type: 'string', index: true },
        { name: 'publishedAt', type: 'int64', index: true },
        {
          name: 'content',
          type: 'string',
          optional: true,
          transform: transformLexicalToMarkdown,
        },
        {
          name: 'tenant',
          type: 'string',
          facet: true,
          optional: true,
          transform: transformTenant,
        },
        {
          name: 'taxonomy_slugs',
          type: 'string[]',
          facet: true,
          optional: true,
          transform: transformCategories,
          payloadField: 'categories',
        },
      ],
    },
  ],
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get table config for a specific collection
 */
export const getTableConfig = (collectionSlug: string) => {
  const configs = collections[collectionSlug]
  if (!configs || configs.length === 0) return null
  return configs[0]
}
