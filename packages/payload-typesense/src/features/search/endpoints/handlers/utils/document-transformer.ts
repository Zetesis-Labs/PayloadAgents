import type { CombinedSearchResult, SearchHit } from '../../../types'

/**
 * Helper to resolve document type from collection name
 */
function resolveDocumentType(collectionName: string): string {
  if (collectionName.includes('article')) return 'article'
  if (collectionName.includes('book')) return 'book'
  return 'document'
}

/**
 * Simplified document format for API responses
 */
type SimplifiedDocument = {
  id: string
  title: string
  slug: string
  type: string
  collection: string
}

/**
 * Transform search response to simplified format
 */
export function transformToSimpleFormat(data: CombinedSearchResult): {
  documents: SimplifiedDocument[]
} {
  if (!data.hits) {
    return { documents: [] }
  }

  const documents = data.hits.map((hit: SearchHit) => {
    const doc = hit.document || {}
    const collectionValue = hit.collection || doc.collection
    const collection = typeof collectionValue === 'string' ? collectionValue : ''

    return {
      id: String(doc.id || ''),
      title: String(doc.title || 'Sin título'),
      slug: String(doc.slug || ''),
      type: resolveDocumentType(collection),
      collection: collection
    }
  })

  return { documents }
}
