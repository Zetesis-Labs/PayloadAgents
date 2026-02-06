/**
 * Conversational RAG utilities for Typesense
 *
 * This module provides tools for building conversational RAG (Retrieval Augmented Generation)
 * applications with Typesense.
 *
 * @module rag
 */

// API Handlers (Core Functions)
export type { TypesenseConnectionConfig } from '../../shared/types/plugin-types'
// Re-export embedding functions from parent
export { generateEmbeddingWithUsage } from '../embedding/embeddings'
// Chat Session Repository
export type { ChatMessageWithSources } from './chat-session-repository'
export {
  markChatSessionAsExpired,
  saveChatSession
} from './chat-session-repository'
export { jsonResponse } from './endpoints/chat/validators/index'
// API Types
export type { ApiContext, AuthenticateMethod } from './endpoints/types'
export type {
  ChatSessionData,
  ChunkFetchConfig,
  ChunkFetchResult,
  RAGChatRequest,
  RAGSearchConfig,
  RAGSearchResult,
  SessionConfig
} from './handlers/index'
export {
  closeSession,
  executeRAGSearch,
  fetchChunkById,
  getActiveSession,
  getSessionByConversationId
} from './handlers/index'
// Query Builder
export {
  buildConversationalUrl,
  buildHybridSearchParams,
  buildMultiSearchRequestBody,
  buildMultiSearchRequests
} from './query-builder'
// Setup Utilities
export {
  ensureConversationCollection,
  getDefaultRAGConfig,
  mergeRAGConfigWithDefaults
} from './setup'
// Stream Handler
export type {
  ConversationEvent,
  StreamProcessingResult
} from './stream-handler'
export {
  buildContextText,
  createSSEForwardStream,
  extractSourcesFromResults,
  parseConversationEvent,
  processConversationStream
} from './stream-handler'
// SSE Utilities
export { formatSSEEvent, sendSSEEvent } from './utils/sse-utils'
