/**
 * Type definitions for payload-typesense plugin configuration
 */

import type { CollectionSlug, Payload, PayloadRequest } from "payload";

/**
 * Hybrid search configuration for combining semantic and keyword search
 */
export interface HybridSearchConfig {
  /** Weight between semantic (1.0) and keyword (0.0) search. Default: 0.9 (90% semantic, 10% keyword) */
  alpha?: number
  /** Whether to rerank hybrid search results. Default: true */
  rerankMatches?: boolean
  /** Fields to use for keyword search portion. Default: 'chunk_text,title' */
  queryFields?: string
}

/**
 * HNSW (Hierarchical Navigable Small World) optimization parameters
 * These optimize vector search performance and quality
 */
export interface HNSWConfig {
  /** Higher = better quality, slower indexing. Default: 200 */
  efConstruction?: number
  /** Connections per node - balance memory/speed. Default: 16 */
  M?: number
  /** Search quality - higher = better quality, slower search. Default: 100 */
  ef?: number
  /** Maximum connections per element. Default: 64 */
  maxConnections?: number
  /** Distance metric for vector similarity. Default: 'cosine' */
  distanceMetric?: 'cosine' | 'l2' | 'ip'
}

/**
 * Advanced search parameters for better relevance
 */
export interface AdvancedSearchConfig {
  /** Minimum tokens before allowing typos. Default: 1 */
  typoTokensThreshold?: number
  /** Number of typos to allow. Default: 2 */
  numTypos?: number
  /** Enable prefix matching for partial queries. Default: true */
  prefix?: boolean
  /** Minimum tokens before dropping tokens for partial matching. Default: 1 */
  dropTokensThreshold?: number
  /** Enable stemming for better language matching. Default: true */
  enableStemming?: boolean
}


/**
 * Source chunk information for citations
 */
export interface ChunkSource {
  /** Unique chunk ID */
  id: string
  /** Parent document title */
  title: string
  /** Parent document slug for URL construction */
  slug: string
  /** Type of document */
  type: string
  /** Chunk index within the document */
  chunkIndex: number
  /** Relevance score (lower is better for vector distance) */
  relevanceScore: number
  /** Full content of the chunk (markdown) */
  content: string
  /** Optional excerpt from the chunk (first 200 chars) */
  excerpt?: string
}

/**
 * SSE event types
 */
export type SSEEventType = 'conversation_id' | 'token' | 'sources' | 'done' | 'error' | 'usage'

/**
 * Usage info structure
 */
export interface UsageInfo {
  tokens_used: number
  cost_usd: number
  daily_limit: number
  daily_used: number
  daily_remaining: number
  reset_at?: string
}

/**
 * Token usage breakdown
 */
export interface TokenUsage {
  input?: number
  output?: number
  total: number
}

/**
 * Service types for spending tracking
 */
export type ServiceType = 'openai_embedding' | 'openai_llm' | 'gemini_embedding' | 'gemini_llm'

/**
 * Spending entry for tracking AI service costs
 */
export interface SpendingEntry {
  service: ServiceType
  model: string
  tokens: TokenUsage
  cost_usd?: number
  timestamp: string
}

/**
 * SSE event structure
 */
export interface SSEEvent {
  type: SSEEventType
  data: string | ChunkSource[] | { error: string } | UsageInfo
}

/**
 * Typesense search hit document (chunk-specific)
 */
export interface TypesenseRAGChunkDocument {
  id: string
  chunk_text: string
  title?: string
  slug?: string
  parent_doc_id?: string
  chunk_index?: number
  [key: string]: unknown
}

/**
 * Typesense search hit for RAG chunks
 */
export interface TypesenseRAGSearchHit {
  document: TypesenseRAGChunkDocument
  vector_distance?: number
  text_match?: number
  [key: string]: unknown
}

/**
 * Typesense search result for RAG queries
 */
export interface TypesenseRAGSearchResult {
  hits?: TypesenseRAGSearchHit[]
  request_params?: {
    collection_name?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Configuration for building Typesense queries
 */
export interface TypesenseQueryConfig {
  /** User's message/query */
  userMessage: string
  /** Query embedding vector */
  queryEmbedding: number[]
  /** Optional: Filter by selected document IDs */
  selectedDocuments?: string[]
  /** Optional: Conversation ID for follow-up */
  chatId?: string
  /** Collections to search */
  searchCollections: string[]
  /** Number of results to retrieve */
  kResults?: number
  /** Advanced search config */
  advancedConfig?: AdvancedSearchConfig
  /** Taxonomy slugs to filter RAG content */
  taxonomySlugs?: string[]
}

/**
 * Embedding result with usage tracking
 */
export interface EmbeddingWithUsage {
  /** The embedding vector */
  embedding: number[]
  /** Usage information */
  usage: {
    /** Number of tokens used */
    promptTokens: number
    /** Total tokens (same as prompt_tokens for embeddings) */
    totalTokens: number
  }
}

/**
 * Batch embedding result with usage tracking
 */
export interface BatchEmbeddingWithUsage {
  /** Array of embedding vectors */
  embeddings: number[][]
  /** Total usage information */
  usage: {
    /** Number of tokens used */
    promptTokens: number
    /** Total tokens (same as prompt_tokens for embeddings) */
    totalTokens: number
  }
}

// --- RAG Feature Config ---

export interface RAGCallbacks {
  /** Get Payload instance (required) */
  getPayload: () => Promise<Payload>;
  /** Check permissions function (required) */
  checkPermissions: (request: PayloadRequest) => Promise<boolean>;
  /** Check token limit function (optional) */
  checkTokenLimit?: (
    payload: Payload,
    userId: string | number,
    tokens: number,
  ) => Promise<{
    allowed: boolean;
    limit: number;
    used: number;
    remaining: number;
    reset_at?: string;
  }>;
  /** Get user usage stats function (optional) */
  getUserUsageStats?: (payload: Payload, userId: string | number) => Promise<{
    limit: number;
    used: number;
    remaining: number;
    reset_at?: string;
  }>;
  /** Save chat session function (optional) */
  saveChatSession?: (
    payload: Payload,
    userId: string | number,
    conversationId: string,
    userMessage: string,
    assistantMessage: string,
    sources: ChunkSource[],
    spending: SpendingEntry[],
    collectionName: CollectionSlug,
    agentSlug?: string,
  ) => Promise<void>;
  /** Create embedding spending function (optional) */
  createEmbeddingSpending?: (model: string, tokens: number) => SpendingEntry;
  /** Estimate tokens from text function (optional) */
  estimateTokensFromText?: (text: string) => number;
}
/**
 * Complete RAG configuration
 */
export interface RAGConfig {
  /** Hybrid search settings */
  hybrid?: HybridSearchConfig
  /** HNSW optimization settings */
  hnsw?: HNSWConfig
  /** Advanced search settings */
  advanced?: AdvancedSearchConfig
}

/**
 * Function that retrieves agents dynamically (e.g. from DB)
 */
export type AgentProvider = (payload: Payload) => Promise<AgentConfig[]>;

export interface RAGFeatureConfig extends RAGConfig {
  enabled: boolean;
  callbacks?: RAGCallbacks;
  agents: AgentConfig[] | AgentProvider;
}




// Re-export embedding types from payload-indexer (single source of truth)
export type { EmbeddingProviderConfig } from "@nexo-labs/payload-indexer";

type TypesenseProtocol = "http" | "https";

type TypesenseNode = {
  host: string;
  port: number;
  protocol: TypesenseProtocol;
  path?: string;
};

/**
 * Configuration for Typesense connection
 */
export type TypesenseConnectionConfig = {
  apiKey: string;
  connectionTimeoutSeconds?: number;
  retryIntervalSeconds?: number;
  numRetries?: number;
  nodes: [TypesenseNode, ...Array<TypesenseNode>];
};

/**
 * Main plugin configuration
 */
/**
 * Configuration for a single conversational agent
 */
export interface AgentConfig<SearchCollections extends string = string> {
  /**
   * Unique identifier for the agent (used in API requests)
   */
  slug: string;
  /**
   * Display name for the agent (shown in UI)
   * If not provided, slug will be used.
   */
  name: string;
  /**
   * Optional API Key for the LLM provider.
   * If provided, this overrides the global embedding provider API key for this agent.
   */
  apiKey?: string;
  /**
   * System prompt that defines the agent's personality and constraints
   */
  systemPrompt: string;
  /**
   * LLM model to use (e.g., 'openai/gpt-4o-mini')
   */
  llmModel: string;
  /**
   * Collections this agent is allowed to search in
   */
  searchCollections: SearchCollections[];
  /**
   * Maximum context size in bytes. Default: 65536 (64KB)
   */
  maxContextBytes?: number;
  /**
   * TTL for conversation history in seconds. Default: 86400 (24h)
   */
  ttl?: number;
  /**
   * Number of chunks to retrieve for RAG context. Default: 10
   */
  kResults?: number;
  /**
   * Welcome message title displayed when starting a new chat
   */
  welcomeTitle?: string;
  /**
   * Welcome message subtitle displayed when starting a new chat
   */
  welcomeSubtitle?: string;
  /**
   * Suggested questions displayed to help users get started
   */
  suggestedQuestions?: Array<{
    /**
     * The full prompt text to send when clicked
     */
    prompt: string;
    /**
     * Short title for the suggestion
     */
    title: string;
    /**
     * Brief description of what the question is about
     */
    description: string;
  }>;
  /**
   * Avatar URL for the agent (displayed in chat header and floating button)
   * If not provided, a default avatar will be used
   */
  avatar?: string;
  /**
   * Taxonomy slugs to filter RAG content.
   * If empty/undefined, searches all content.
   */
  taxonomySlugs?: string[];
}
