import type { CombinedSearchResult, SearchHit } from '../../../types'

/** Default: strip _chunk suffix from collection name */
const defaultDocumentTypeResolver = (collectionName: string): string =>
  collectionName.replace(/_chunk$/, '') || 'document'

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
export function transformToSimpleFormat(
  data: CombinedSearchResult,
  documentTypeResolver?: (collectionName: string) => string
): {
  documents: SimplifiedDocument[]
} {
  if (!data.hits) {
    return { documents: [] }
  }

  const resolver = documentTypeResolver ?? defaultDocumentTypeResolver

  const documents = data.hits.map((hit: SearchHit) => {
    const doc = hit.document || {}
    const collectionValue = hit.collection || doc.collection
    const collection = typeof collectionValue === 'string' ? collectionValue : ''

    return {
      id: String(doc.id || ''),
      title: String(doc.title || 'Sin título'),
      slug: String(doc.slug || ''),
      type: resolver(collection),
      collection: collection
    }
  })

  return { documents }
}
