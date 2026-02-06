import type { TableConfig } from '@nexo-labs/payload-indexer'
import { DEFAULT_PAGE, DEFAULT_PER_PAGE } from '../constants'
import type { CombinedSearchResult, ProcessVectorSearchResultsOptions, SearchHit } from '../types'

/**
 * Typesense search result from a single collection
 */
interface TypesenseCollectionResult {
  found?: number
  error?: string
  hits?: Array<{
    document?: Record<string, unknown>
    vector_distance?: number
    text_match?: number
    [key: string]: unknown
  }>
}

/**
 * Typesense multi-search response
 */
interface TypesenseMultiSearchResponse {
  results?: TypesenseCollectionResult[]
}

/**
 * Internal result type with collection metadata
 */
interface CollectionResult {
  collection: string
  displayName: string
  icon: string
  found: number
  error: string | undefined
  hits: SearchHit[]
}

/**
 * Processes and combines vector search results from multiple collections
 */
export const processVectorSearchResults = (
  multiSearchResults: TypesenseMultiSearchResponse,
  enabledCollections: Array<[string, TableConfig]>,
  options: ProcessVectorSearchResultsOptions
): CombinedSearchResult => {
  const { per_page = DEFAULT_PER_PAGE, page = DEFAULT_PAGE, k, query, vector } = options

  const rawResults =
    multiSearchResults.results?.map((result: TypesenseCollectionResult, index: number): CollectionResult | null => {
      if (!enabledCollections[index]) {
        return null
      }
      const [collectionName, config] = enabledCollections[index]

      return {
        collection: collectionName,
        displayName: config?.displayName || collectionName,
        icon: '📄',
        found: result.found || 0,
        error: result.error || undefined,
        hits:
          result.hits?.map((hit): SearchHit => {
            const doc = hit.document || {}
            const hint = doc.chunk_text
              ? `${String(doc.chunk_text).substring(0, 300)}...`
              : doc.description
                ? `${String(doc.description).substring(0, 300)}...`
                : doc.hint

            return {
              ...hit,
              collection: collectionName,
              displayName: config?.displayName || collectionName,
              icon: '📄',
              document: {
                ...doc,
                hint,
                // Keep chunk_text as a separate field for chunks
                ...(doc.chunk_text ? { chunk_text: doc.chunk_text } : {})
              },
              vector_distance: hit.vector_distance,
              text_match: hit.text_match
            }
          }) || []
      }
    }) || []

  const results: CollectionResult[] = rawResults.filter(
    (r: CollectionResult | null): r is CollectionResult => r !== null
  )

  // Combine results
  const combinedHits = results.flatMap(result => result.hits)
  const totalFound = results.reduce((sum, result) => sum + result.found, 0)

  // Sort by vector distance (if available) or relevance
  combinedHits.sort((a, b) => {
    const aDistance = a.vector_distance ?? Infinity
    const bDistance = b.vector_distance ?? Infinity
    return aDistance - bDistance
  })

  const searchResult: CombinedSearchResult = {
    collections: results.map((r: CollectionResult) => ({
      collection: r.collection,
      displayName: r.displayName,
      error: r.error,
      found: r.found || 0,
      icon: r.icon
    })),
    found: totalFound,
    hits: combinedHits.slice(0, per_page),
    page,
    request_params: {
      k: k,
      per_page,
      query: query || null,
      vector: vector ? 'provided' : null
    },
    search_cutoff: false,
    search_time_ms: 0
  }

  return searchResult
}
