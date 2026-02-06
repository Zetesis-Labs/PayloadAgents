/**
 * Conversational RAG utilities for Typesense
 *
 * This module provides tools for building conversational RAG (Retrieval Augmented Generation)
 * applications with Typesense.
 *
 * @module rag
 */

// Re-export embedding functions from parent
export { generateEmbeddingWithUsage } from "../embedding/embeddings";

// Query Builder
export {
  buildConversationalUrl,
  buildHybridSearchParams,
  buildMultiSearchRequestBody,
  buildMultiSearchRequests,
} from "./query-builder";

// Stream Handler
export type {
  ConversationEvent,
  StreamProcessingResult,
} from "./stream-handler";

export {
  buildContextText,
  createSSEForwardStream,
  extractSourcesFromResults,
  parseConversationEvent,
  processConversationStream,
} from "./stream-handler";

// Setup Utilities
export {
  ensureConversationCollection,
  getDefaultRAGConfig,
  mergeRAGConfigWithDefaults,
} from "./setup";

// API Handlers (Core Functions)
export type { TypesenseConnectionConfig } from "../../shared/types/plugin-types";
export {
  closeSession,
  executeRAGSearch,
  fetchChunkById,
  getActiveSession,
  getSessionByConversationId,
} from "./handlers/index";
export type {
  ChatSessionData,
  ChunkFetchConfig,
  ChunkFetchResult,
  RAGChatRequest,
  RAGSearchConfig,
  RAGSearchResult,
  SessionConfig,
} from "./handlers/index";

// SSE Utilities
export { formatSSEEvent, sendSSEEvent } from "./utils/sse-utils";

// Chat Session Repository
export type { ChatMessageWithSources } from "./chat-session-repository";

export {
  markChatSessionAsExpired,
  saveChatSession,
} from "./chat-session-repository";

// API Types
export type { ApiContext, AuthenticateMethod } from "./endpoints/types";

export { jsonResponse } from "./endpoints/chat/validators/index";
