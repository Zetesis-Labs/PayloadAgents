/**
 * Generic types for better type safety across the plugin
 */

// Re-export base document types from payload-indexer (single source of truth)
export type { BaseDocument, PayloadDocument } from '@nexo-labs/payload-indexer'

// Typesense document type - represents the mapped document for Typesense
export interface TypesenseDocument {
  id: string
  slug?: string
  title?: string
  createdAt: number
  updatedAt: number
  embedding?: number[]
  [key: string]: unknown
}

// Typesense chunk document type
export interface TypesenseChunkDocument {
  id: string
  parent_doc_id: string
  slug: string
  title: string
  createdAt: number
  publishedAt?: number
  updatedAt: number
  chunk_index: number
  chunk_text: string
  is_chunk: boolean
  embedding: number[]
}

// Generic search result interface
export interface SearchResult<T = TypesenseDocument> {
  collection?: string
  content?: string
  displayName?: string
  document: T
  highlight?: {
    [field: string]: {
      matched_tokens: string[]
      snippet: string
      value: string
    }
  }
  highlights?: Array<{
    field: string
    matched_tokens: string[]
    snippet: string
    value: string
  }>
  icon?: string
  id: string
  text_match?: number
  text_match_info?: {
    best_field_score: string
    best_field_weight: number
    fields_matched: number
    score: string
    tokens_matched: number
  }
  vector_distance?: number
  // Additional fields for display
  title?: string
  updatedAt?: string
}

// Generic search response interface
export interface SearchResponse<T = TypesenseDocument> {
  collections?: Array<{
    collection: string
    displayName: string
    error?: string
    found: number
    icon: string
  }>
  found: number
  hits: SearchResult<T>[]
  page: number
  request_params: {
    page?: number
    per_page: number
    q: string
    sort_by?: string
  }
  search_cutoff: boolean
  search_time_ms: number
}

// Generic suggest result interface
export interface SuggestResult<T = TypesenseDocument> {
  collection?: string
  displayName?: string
  document: T
  highlight?: Record<string, string>
  icon?: string
  text_match?: number
}

// Generic suggest response interface
export interface SuggestResponse<T = TypesenseDocument> {
  found: number
  hits: SuggestResult<T>[]
  page: number
  request_params: {
    per_page: number
    q: string
  }
  search_cutoff: boolean
  search_time_ms: number
}

// Generic search parameters
export interface SearchParams {
  facets?: string[]
  filters?: Record<string, unknown>
  highlight_fields?: string[]
  num_typos?: number
  page?: number
  per_page?: number
  q: string
  snippet_threshold?: number
  sort_by?: string
  typo_tokens_threshold?: number
}

// Generic component props for search inputs
export interface BaseSearchInputProps<T = TypesenseDocument> {
  baseUrl: string
  className?: string
  collection?: string
  debounceMs?: number
  errorClassName?: string
  // Styling props
  inputClassName?: string
  inputWrapperClassName?: string
  loadingClassName?: string
  maxResults?: number
  minQueryLength?: number
  noResultsClassName?: string
  onError?: (error: string) => void
  onLoading?: (loading: boolean) => void
  onResultClick?: (result: SearchResult<T>) => void
  onResults?: (results: SearchResponse<T>) => void
  onSearch?: (query: string, results: SearchResponse<T>) => void
  placeholder?: string
  resultsHeaderClassName?: string
  resultsListClassName?: string
}

// Generic cache entry
export interface CacheEntry<T = unknown> {
  data: T
  timestamp: number
  ttl: number
}

// Generic cache options
export interface CacheOptions {
  maxSize?: number
  ttl?: number
}

// Generic health check response
export interface HealthCheckResponse {
  cache?: {
    maxSize: number
    size: number
  }
  collections?: string[]
  error?: string
  lastSync?: number
  status: 'healthy' | 'unhealthy'
  typesense?: {
    ok: boolean
    version?: string
  }
}

// Generic error response
export interface ErrorResponse {
  code?: string
  details?: string
  error: string
  timestamp?: string
}

// Generic API response wrapper
export interface ApiResponse<T = unknown> {
  data?: T
  error?: ErrorResponse
  meta?: {
    cached?: boolean
    requestId?: string
    timestamp: string
  }
  success: boolean
}
