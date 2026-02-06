/**
 * Options for building vector search parameters
 */
export interface BuildVectorSearchParamsOptions {
  query?: string
  k?: number
  hybrid?: boolean
  alpha?: number
  page?: number
  per_page?: number
  filter_by?: string
  sort_by?: string
  searchFields?: string[]
}

/**
 * Options for building multi-collection vector search parameters
 */
export interface BuildMultiCollectionVectorSearchParamsOptions {
  query?: string
  k?: number
  hybrid?: boolean
  alpha?: number
  page?: number
  per_page?: number
  filter_by?: string
  sort_by?: string
}

/**
 * Options for processing vector search results
 */
export interface ProcessVectorSearchResultsOptions {
  per_page?: number
  page?: number
  k?: number
  query?: string
  vector?: number[]
}

/**
 * Search hit from Typesense
 */
export interface SearchHit {
  collection?: string
  displayName?: string
  icon?: string
  document: Record<string, unknown>
  text_match?: number
  vector_distance?: number
  [key: string]: unknown
}

/**
 * Collection search result
 */
export interface CollectionSearchResult {
  collection: string
  displayName: string
  icon: string
  error?: string
  found: number
  hits: SearchHit[]
}

/**
 * Combined search result
 */
export interface CombinedSearchResult {
  collections: Array<{
    collection: string
    displayName: string
    icon: string
    error?: string
    found: number
  }>
  found: number
  hits: SearchHit[]
  page: number
  request_params: {
    k?: number
    per_page: number
    query: string | null
    vector?: string | null
  }
  search_cutoff: boolean
  search_time_ms: number
}

/**
 * Traditional search parameters
 */
export interface TraditionalSearchParams {
  highlight_full_fields: string
  num_typos: number
  page: number
  per_page: number
  q: string
  query_by: string
  snippet_threshold: number
  typo_tokens_threshold: number
  sort_by?: string
  filter_by?: string
  exclude_fields?: string
}

/**
 * Search options for universal search
 */
export interface UniversalSearchOptions {
  filters: Record<string, unknown>
  page: number
  per_page: number
  sort_by?: string
  mode?: 'simple' | 'semantic'
  collections?: string[]
  exclude_fields?: string
  query_by?: string
  [key: string]: unknown
}
