/**
 * Types for the composable Typesense RAG plugin
 */

import type { EmbeddingProviderConfig, TableConfig } from "@nexo-labs/payload-indexer";
import type {
  TypesenseConnectionConfig,
  AgentConfig,
  AgentProvider,
  RAGCallbacks,
  HybridSearchConfig,
  HNSWConfig,
  AdvancedSearchConfig,
} from "../shared/types/plugin-types.js";
import { CollectionSlug } from "payload";

/**
 * Search feature configuration for the Typesense RAG plugin
 * ...
 */
export interface TypesenseSearchConfig {
  /** Enable search endpoints */
  enabled: boolean;
  /** Default search settings */
  defaults?: {
    /** Search mode: 'semantic' | 'hybrid' | 'keyword' */
    mode?: 'semantic' | 'hybrid' | 'keyword';
    /** Results per page */
    perPage?: number;
    /** Tables to search by default */
    tables?: string[];
  };
}

/**
 * Configuration for the Typesense RAG plugin
 * ...
 */
export interface TypesenseRAGPluginConfig<TSlug extends CollectionSlug> {
  /** Typesense connection configuration */
  typesense: TypesenseConnectionConfig;

  collectionName: TSlug;

  /**
   * Embedding provider config (for RAG query embedding)
   * Note: The RAG handler creates its own provider instance to track usage/spending.
   * The EmbeddingService from createIndexerPlugin is used for document sync, not RAG queries.
   */
  embeddingConfig?: EmbeddingProviderConfig;

  /** Collection configurations (for schema sync) */
  collections?: Record<string, TableConfig[]>;

  /** Search configuration */
  search?: TypesenseSearchConfig;

  /** RAG agent configurations */
  agents?: AgentConfig[] | AgentProvider;

  /** Callback functions for permissions, session management, etc. */
  callbacks?: RAGCallbacks;

  /** Hybrid search configuration */
  hybrid?: HybridSearchConfig;

  /** HNSW optimization configuration */
  hnsw?: HNSWConfig;

  /** Advanced search configuration */
  advanced?: AdvancedSearchConfig;
}
