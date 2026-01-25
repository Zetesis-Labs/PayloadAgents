/**
 * @nexo-labs/payload-typesense
 *
 * Full-text and vector search plugin for Payload CMS using Typesense
 * with optional RAG (Retrieval Augmented Generation) support
 */

// ============================================================================
// MAIN PLUGIN EXPORTS
// ============================================================================

// Composable Typesense RAG plugin (for use with createIndexerPlugin)
export { createTypesenseRAGPlugin } from "./plugin/create-rag-plugin.js";

// Plugin types
export type { TypesenseRAGPluginConfig, TypesenseSearchConfig } from "./plugin/rag-types.js";

// ============================================================================
// ADAPTER EXPORTS
// ============================================================================

export {
  TypesenseAdapter,
  createTypesenseAdapter,
  createTypesenseAdapterFromClient,
} from "./adapter/index.js";

export type { TypesenseFieldType, TypesenseFieldMapping } from "./adapter/index.js";

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// Plugin configuration types
export type {
  TypesenseConnectionConfig,
  AgentConfig,
  AgentProvider
} from "./shared/types/plugin-types.js";

// Core library types (Typesense-specific)
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
  TypesenseDocument,
} from "./shared/types/types.js";

// RAG types
export type {
  ApiContext,
  AuthenticateMethod,
  ChatMessageWithSources,
  ChatSessionData,
  ChunkFetchConfig,
  ChunkFetchResult,
  ConversationEvent,
  RAGChatRequest,
  RAGSearchConfig,
  RAGSearchResult,
  SessionConfig,
  StreamProcessingResult,
} from "./features/rag/index.js";

// Plugin config types (internal use)
export type {
  ModularPluginConfig,
  SearchFeatureConfig,
  SyncFeatureConfig
} from "./core/config/types.js";

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

// Typesense client utilities
export { createTypesenseClient, testTypesenseConnection } from "./core/client/typesense-client.js";

// Embedding utilities (Typesense-specific wrappers)
export {
  generateEmbedding,
  generateEmbeddingWithUsage,
  generateEmbeddingsBatchWithUsage,
} from "./features/embedding/embeddings.js";

// RAG utilities
export {
  buildConversationalUrl,
  buildHybridSearchParams,
  buildMultiSearchRequestBody,
  buildMultiSearchRequests,
  buildContextText,
  createSSEForwardStream,
  extractSourcesFromResults,
  parseConversationEvent,
  processConversationStream,
  ensureConversationCollection,
  getDefaultRAGConfig,
  mergeRAGConfigWithDefaults,
  closeSession,
  executeRAGSearch,
  fetchChunkById,
  formatSSEEvent,
  getActiveSession,
  getSessionByConversationId,
  sendSSEEvent,
  saveChatSession,
  jsonResponse,
} from "./features/rag/index.js";

// Document sync utilities
export { deleteDocumentFromTypesense } from "./features/sync/services/document-delete.js";

// ============================================================================
// COMPOSABLE PLUGIN UTILITIES (for adapter pattern usage)
// ============================================================================

// Search endpoints factory
export { createSearchEndpoints } from "./features/search/endpoints.js";

// RAG endpoints factory
export { createRAGPayloadHandlers } from "./features/rag/endpoints.js";

// Schema management and RAG agent management are internal to createTypesenseRAGPlugin

// ============================================================================
// TYPESENSE-SPECIFIC CONSTANTS
// ============================================================================

export {
  DEFAULT_HYBRID_SEARCH_ALPHA,
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_RAG_MAX_TOKENS,
  DEFAULT_RAG_CONTEXT_LIMIT,
  DEFAULT_SESSION_TTL_SEC,
  DEFAULT_RAG_LLM_MODEL,
} from "./core/config/constants.js";
