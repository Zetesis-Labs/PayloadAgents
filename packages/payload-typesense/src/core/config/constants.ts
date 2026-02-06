/**
 * Constants for payload-typesense plugin
 * Centralizes all magic numbers and configuration defaults
 */

// ============================================================================
// EMBEDDING CONSTANTS
// ============================================================================

// ============================================================================
// SEARCH CONSTANTS
// ============================================================================

/**
 * Default alpha value for hybrid search (0 = pure semantic, 1 = pure keyword)
 */
export const DEFAULT_HYBRID_SEARCH_ALPHA = 0.5

/**
 * Default number of search results to return
 */
export const DEFAULT_SEARCH_LIMIT = 10

// ============================================================================
// CACHE CONSTANTS
// ============================================================================

/**
 * Default TTL for cache entries (in milliseconds) - 5 minutes
 */
export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000

// ============================================================================
// RAG CONSTANTS
// ============================================================================

/**
 * Default maximum tokens for RAG responses
 */
export const DEFAULT_RAG_MAX_TOKENS = 1000

/**
 * Default number of search results to use for RAG context
 */
export const DEFAULT_RAG_CONTEXT_LIMIT = 5

/**
 * Default session TTL (in seconds) - 30 minutes
 */
export const DEFAULT_SESSION_TTL_SEC = 30 * 60

/**
 * Default OpenAI model for RAG chat
 */
export const DEFAULT_RAG_LLM_MODEL = 'gpt-4o-mini'
