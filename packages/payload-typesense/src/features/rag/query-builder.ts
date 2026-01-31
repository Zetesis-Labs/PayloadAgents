/**
 * Query builder utilities for Typesense Conversational RAG
 */

import type { TypesenseConnectionConfig } from '../../index.js'
import { TypesenseQueryConfig, AdvancedSearchConfig } from '../../shared/index.js'

/**
 * Typesense search request object
 */
interface TypesenseSearchRequest {
  collection: string
  query_by: string
  vector_query: string
  exclude_fields: string
  filter_by?: string
  typo_tokens_threshold?: number
  num_typos?: number
  prefix?: boolean
  drop_tokens_threshold?: number
  enable_stemming?: boolean
}

/**
 * Advanced search parameters object
 */
interface AdvancedSearchParams {
  typo_tokens_threshold?: number
  num_typos?: number
  prefix?: boolean
  drop_tokens_threshold?: number
  enable_stemming?: boolean
}

/**
 * Build the Typesense conversational search URL with all necessary parameters
 *
 * @param config - Query configuration
 * @param config.userMessage - The user's message/query
 * @param config.chatId - Optional conversation ID for follow-up questions
 * @param conversationModelId - The conversation model ID in Typesense
 * @param typesenseConfig - Typesense connection config
 * @returns URL for the Typesense multi_search endpoint with conversation parameters
 */
export function buildConversationalUrl(
  config: { userMessage: string; chatId?: string },
  conversationModelId: string,
  typesenseConfig: TypesenseConnectionConfig
): URL {
  const protocol = typesenseConfig.nodes[0].protocol || 'http'
  const typesenseUrl = new URL(
    `${protocol}://${typesenseConfig.nodes[0].host}:${typesenseConfig.nodes[0].port}/multi_search`
  )

  // Add conversation parameters to URL
  typesenseUrl.searchParams.set('q', config.userMessage)
  typesenseUrl.searchParams.set('conversation', 'true')
  typesenseUrl.searchParams.set('conversation_model_id', conversationModelId)

  if (config.chatId) {
    typesenseUrl.searchParams.set('conversation_id', config.chatId)
  }

  typesenseUrl.searchParams.set('conversation_stream', 'true')

  return typesenseUrl
}

/**
 * Build multi-search requests for Typesense with hybrid search configuration
 *
 * @param config - Query configuration including embedding, collections, and filters
 * @returns Array of search requests for Typesense multi_search
 */
export function buildMultiSearchRequests(config: TypesenseQueryConfig) {
  const {
    searchCollections,
    queryEmbedding,
    selectedDocuments,
    kResults = 10,
    advancedConfig = {},
    taxonomySlugs,
  } = config

  return searchCollections.map((collection: string) => {
    const request: TypesenseSearchRequest = {
      collection,
      query_by: 'chunk_text,title,headers',
      vector_query: `embedding:([${queryEmbedding.join(',')}], k:${kResults})`,
      exclude_fields: 'embedding',
      ...buildAdvancedSearchParams(advancedConfig),
    }

    // Build filters array
    const filters: string[] = []

    // Add document filter if documents are selected
    if (selectedDocuments && selectedDocuments.length > 0) {
      const documentIds = selectedDocuments.map((id: string) => `"${id}"`).join(',')
      filters.push(`parent_doc_id:[${documentIds}]`)
    }

    // Add taxonomy filter - REQUIRED to prevent global searches
    if (taxonomySlugs && taxonomySlugs.length > 0) {
      const taxFilter = taxonomySlugs.map((s: string) => `"${s}"`).join(',')
      filters.push(`taxonomy_slugs:[${taxFilter}]`)
    } else {
      // No taxonomies assigned = no search results allowed (prevent global search)
      filters.push(`id:=__BLOCKED_NO_TAXONOMIES__`)
    }

    // Apply combined filters
    if (filters.length > 0) {
      request.filter_by = filters.join(' && ')
    }

    return request
  })
}

/**
 * Build advanced search parameters from config
 *
 * @param config - Advanced search configuration
 * @returns Object with advanced search parameters
 */
function buildAdvancedSearchParams(config: AdvancedSearchConfig): AdvancedSearchParams {
  const params: AdvancedSearchParams = {}

  if (config.typoTokensThreshold !== undefined) {
    params.typo_tokens_threshold = config.typoTokensThreshold
  }

  if (config.numTypos !== undefined) {
    params.num_typos = config.numTypos
  }

  if (config.prefix !== undefined) {
    params.prefix = config.prefix
  }

  if (config.dropTokensThreshold !== undefined) {
    params.drop_tokens_threshold = config.dropTokensThreshold
  }

  if (config.enableStemming !== undefined) {
    params.enable_stemming = config.enableStemming
  }

  return params
}

/**
 * Build the complete Typesense request body for multi-search
 *
 * @param config - Query configuration
 * @returns Request body for Typesense multi_search endpoint
 */
export function buildMultiSearchRequestBody(config: TypesenseQueryConfig) {
  return {
    searches: buildMultiSearchRequests(config),
  }
}

/**
 * Build hybrid search parameters for combining semantic and keyword search
 *
 * @param alpha - Weight between semantic (1.0) and keyword (0.0) search
 * @param rerankMatches - Whether to rerank hybrid search results
 * @param queryFields - Fields to use for keyword search
 * @returns Object with hybrid search parameters
 */
export function buildHybridSearchParams(
  alpha = 0.9,
  rerankMatches = true,
  queryFields = 'chunk_text,title'
) {
  return {
    alpha,
    rerank_hybrid_matches: rerankMatches,
    query_fields: queryFields,
  }
}
