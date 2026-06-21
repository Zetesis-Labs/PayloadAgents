/**
 * @zetesis/payload-typesense
 *
 * Full-text and vector search plugin for Payload CMS using Typesense.
 * Chat and session management have moved to @zetesis/payload-agents-core.
 */

// ============================================================================
// MAIN PLUGIN EXPORTS
// ============================================================================

export { createTypesenseRAGPlugin } from './plugin/create-rag-plugin'

export type { TypesenseRAGPluginConfig, TypesenseSearchConfig } from './plugin/rag-types'

// ============================================================================
// ADAPTER EXPORTS
// ============================================================================

export type { RetryConfig, TypesenseAdapterOptions, TypesenseFieldMapping, TypesenseFieldType } from './adapter'
export { createTypesenseAdapter, createTypesenseAdapterFromClient, TypesenseAdapter } from './adapter'

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type { ModularPluginConfig, SearchFeatureConfig, SyncFeatureConfig } from './core/config/types'

export type {
  ApiContext,
  AuthenticateMethod,
  ChunkFetchConfig,
  ChunkFetchResult,
  RAGChatRequest,
  RAGSearchConfig,
  RAGSearchResult
} from './features/rag'

export type {
  TypesenseAutoEmbedConfig,
  TypesenseConnectionConfig,
  TypesenseModelConfig
} from './shared/types/plugin-types'

export type {
  ApiResponse,
  BaseDocument,
  BaseSearchInputProps,
  CacheEntry,
  CacheOptions,
  ErrorResponse,
  HealthCheckResponse,
  PayloadDocument,
  SearchParams,
  SearchResponse,
  SearchResult,
  SuggestResponse,
  SuggestResult,
  TypesenseChunkDocument,
  TypesenseDocument
} from './shared/types/types'

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export { createTypesenseClient, testTypesenseConnection } from './core/client/typesense-client'

export {
  buildConversationalUrl,
  buildHybridSearchParams,
  buildMultiSearchRequestBody,
  buildMultiSearchRequests,
  executeRAGSearch,
  fetchChunkById,
  formatSSEEvent,
  sendSSEEvent
} from './features/rag'

export { deleteDocumentFromTypesense } from './features/sync/services/document-delete'

// ============================================================================
// COMPOSABLE PLUGIN UTILITIES
// ============================================================================

export { createRAGPayloadHandlers } from './features/rag/endpoints'
export { createSearchEndpoints } from './features/search/endpoints'

// ============================================================================
// TYPESENSE-SPECIFIC CONSTANTS
// ============================================================================

export {
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_HYBRID_SEARCH_ALPHA,
  DEFAULT_RAG_CONTEXT_LIMIT,
  DEFAULT_RAG_LLM_MODEL,
  DEFAULT_RAG_MAX_TOKENS,
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_SESSION_TTL_SEC
} from './core/config/constants'

// ============================================================================
// MCP DESCRIPTOR
// ============================================================================

export type { TypesenseMcpDescriptorOptions } from './mcp/descriptor'
export { createTypesenseMcpDescriptor } from './mcp/descriptor'
