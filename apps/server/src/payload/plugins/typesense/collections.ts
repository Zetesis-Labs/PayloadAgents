/**
 * Indexable Collections Configuration
 * Defines which Payload collections are indexed in Typesense
 */

import type { IndexableCollectionConfig } from '@nexo-labs/payload-indexer'
import { transformLexicalToMarkdown } from '@nexo-labs/payload-indexer'
import type { TypesenseFieldMapping } from '@nexo-labs/payload-typesense'
import { transformTenant } from './transforms'

// ============================================================================
// TRANSFORMS
// ============================================================================

/**
 * Transform categories relationship to taxonomy slugs array
 */
/**
 * Extrae la jerarquía de slugs de los breadcrumbs de la última categoría
 * Ejemplo: categories = [ { ..., breadcrumbs: [ { url: '/autor', label: 'Autor' }, { url: '/autor/hoppe', label: 'Hoppe' } ] } ]
 * Devuelve: ['autor', 'hoppe']
 */
const transformCategories = (categories: unknown): string[] => {
  if (!categories || !Array.isArray(categories) || categories.length === 0)
    return []
  // Buscar la última categoría que tenga breadcrumbs
  const lastWithBreadcrumbs = [...categories]
    .reverse()
    .find(
      (cat) =>
        cat &&
        typeof cat === 'object' &&
        Array.isArray((cat as any).breadcrumbs),
    )
  if (!lastWithBreadcrumbs) return []
  const breadcrumbs = (lastWithBreadcrumbs as any).breadcrumbs
  if (!Array.isArray(breadcrumbs) || breadcrumbs.length === 0) return []
  // Tomar el último breadcrumb válido con url
  const last = [...breadcrumbs]
    .reverse()
    .find(
      (b) =>
        b && typeof b === 'object' && 'url' in b && typeof b.url === 'string',
    )
  if (!last || typeof last.url !== 'string') return []
  // Extraer los slugs de la url (ignorando vacíos)
  return last.url.split('/').filter(Boolean)
}

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
