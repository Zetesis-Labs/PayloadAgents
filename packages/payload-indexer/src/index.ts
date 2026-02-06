/**
 * @nexo-labs/payload-indexer
 *
 * Generic document indexing library for Payload CMS
 * with support for multiple search backends, embedding providers, and chunking strategies.
 */

// ============================================================================
// ADAPTER EXPORTS
// ============================================================================

export type {
  AdapterSearchResult,
  // Schema types
  BaseCollectionSchema,
  DeleteResult,
  IndexDocument,
  // Core adapter interface
  IndexerAdapter,
  // Type inference helper
  InferSchema,
  // Operation result types
  SyncResult,
  VectorSearchOptions,
} from "./adapter";

// ============================================================================
// EMBEDDING EXPORTS
// ============================================================================

// Types
export type {
  BatchEmbeddingResult,
  EmbeddingProvider,
  EmbeddingProviderConfig,
  EmbeddingProviderType,
  EmbeddingResult,
  EmbeddingService,
  EmbeddingUsage,
  GeminiEmbeddingModel,
  GeminiProviderConfig,
  OpenAIEmbeddingModel,
  OpenAIProviderConfig,
} from "./embedding/types";

export type { IndexableCollectionConfig } from "./plugin/types";
// Service
export {
  EmbeddingServiceImpl,
  createEmbeddingService,
} from "./embedding/service";

// Providers
export { GeminiEmbeddingProvider } from "./embedding/providers/gemini-provider";
export { OpenAIEmbeddingProvider } from "./embedding/providers/openai-provider";

// Chunking
export { chunkMarkdown } from "./embedding/chunking/strategies/markdown-chunker";
export {
  chunkText,
  shouldChunk,
} from "./embedding/chunking/strategies/text-chunker";
export type { ChunkOptions, TextChunk } from "./embedding/chunking/types";

// ============================================================================
// DOCUMENT EXPORTS
// ============================================================================

export type {
  BaseDocument,
  ChunkDocument,
  ChunkingConfig,
  CollectionConfig,
  EmbeddingTableConfig,
  FieldMapping,
  IndexedDocument,
  PayloadDocument,
  SourceField,
  TableConfig,
} from "./document/types";

export { mapPayloadDocumentToIndex } from "./document/field-mapper";

// ============================================================================
// CORE EXPORTS
// ============================================================================

// Constants
export {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  DEFAULT_OVERLAP,
  MAX_CHUNK_SIZE,
  MIN_CHUNK_SIZE,
  MIN_EMBEDDING_TEXT_LENGTH,
} from "./core/config/constants";

// Logging
export {
  Logger,
  configureLogger,
  createLogger,
  getLogger,
  logger,
  setLogger,
} from "./core/logging/logger";
export type { LogContext, LogLevel, LoggerConfig } from "./core/logging/logger";

// Utilities
export {
  CHUNK_HEADER_SEPARATOR,
  extractContentOnly,
  extractHeaderMetadata,
  formatChunkWithHeaders,
  parseChunkText,
} from "./core/utils/chunk-format-utils";

export type {
  ChunkHeaderMetadata,
  ParsedChunk,
} from "./core/utils/chunk-format-utils";

export { buildHeaderHierarchy } from "./core/utils/header-utils";

export {
  createSummarizeLexicalTransform,
  createSummarizeTransform,
  transformLexicalToMarkdown,
  type SummarizeConfig,
} from "./core/utils/transforms";
export type { SummarizeLexicalConfig } from "./core/utils/transforms";

// ============================================================================
// HOOKS EXPORTS
// ============================================================================

export type { SyncHookContext } from "./hooks";

// ============================================================================
// PLUGIN EXPORTS
// ============================================================================

// Main factory
export { createIndexerPlugin } from "./plugin";
export type { IndexerPluginResult } from "./plugin";

// Plugin types
export type {
  IndexerFeatureConfig,
  IndexerPluginConfig,
  SearchFeatureConfig,
  SearchMode,
  SyncFeatureConfig,
} from "./plugin";

// Sync utilities (for custom implementations)
export {
  DocumentSyncer,
  applySyncHooks,
  deleteDocumentFromIndex,
  syncDocumentToIndex,
} from "./plugin";

// Naming utilities
export { getIndexCollectionName } from "./plugin";
