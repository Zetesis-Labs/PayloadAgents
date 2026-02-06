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
export { createTypesenseRAGPlugin } from "./plugin/create-rag-plugin";

// Plugin types
export type {
  TypesenseRAGPluginConfig,
  TypesenseSearchConfig,
} from "./plugin/rag-types";

// ============================================================================
// ADAPTER EXPORTS
// ============================================================================

export {
  TypesenseAdapter,
  createTypesenseAdapter,
  createTypesenseAdapterFromClient,
} from "./adapter";

export type { TypesenseFieldMapping, TypesenseFieldType } from "./adapter";

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// Plugin configuration types
export type {
  AgentConfig,
  AgentProvider,
  TypesenseConnectionConfig,
} from "./shared/types/plugin-types";

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
} from "./shared/types/types";

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
} from "./features/rag";

// Plugin config types (internal use)
export type {
  ModularPluginConfig,
  SearchFeatureConfig,
  SyncFeatureConfig,
} from "./core/config/types";

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

// Typesense client utilities
export {
  createTypesenseClient,
  testTypesenseConnection,
} from "./core/client/typesense-client";

// Embedding utilities (Typesense-specific wrappers)
export {
  generateEmbedding,
  generateEmbeddingWithUsage,
  generateEmbeddingsBatchWithUsage,
} from "./features/embedding/embeddings";

// RAG utilities
export {
  buildContextText,
  buildConversationalUrl,
  buildHybridSearchParams,
  buildMultiSearchRequestBody,
  buildMultiSearchRequests,
  closeSession,
  createSSEForwardStream,
  ensureConversationCollection,
  executeRAGSearch,
  extractSourcesFromResults,
  fetchChunkById,
  formatSSEEvent,
  getActiveSession,
  getDefaultRAGConfig,
  getSessionByConversationId,
  jsonResponse,
  mergeRAGConfigWithDefaults,
  parseConversationEvent,
  processConversationStream,
  saveChatSession,
  sendSSEEvent,
} from "./features/rag";

// Document sync utilities
export { deleteDocumentFromTypesense } from "./features/sync/services/document-delete";

// ============================================================================
// COMPOSABLE PLUGIN UTILITIES (for adapter pattern usage)
// ============================================================================

// Search endpoints factory
export { createSearchEndpoints } from "./features/search/endpoints";

// RAG endpoints factory
export { createRAGPayloadHandlers } from "./features/rag/endpoints";

// Schema management and RAG agent management are internal to createTypesenseRAGPlugin

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
  DEFAULT_SESSION_TTL_SEC,
} from "./core/config/constants";
