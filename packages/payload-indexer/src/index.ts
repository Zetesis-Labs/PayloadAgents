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
  VectorSearchOptions
} from './adapter'

// ============================================================================
// EMBEDDING EXPORTS
// ============================================================================

// Chunking
export { chunkMarkdown } from './embedding/chunking/strategies/markdown-chunker'
export {
  chunkText,
  shouldChunk
} from './embedding/chunking/strategies/text-chunker'
export type { ChunkOptions, TextChunk } from './embedding/chunking/types'

// Providers
export { GeminiEmbeddingProvider } from './embedding/providers/gemini-provider'
export { OpenAIEmbeddingProvider } from './embedding/providers/openai-provider'
// Service
export {
  createEmbeddingService,
  EmbeddingServiceImpl
} from './embedding/service'
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
  OpenAIProviderConfig
} from './embedding/types'
export type { IndexableCollectionConfig } from './plugin/types'

// ============================================================================
// DOCUMENT EXPORTS
// ============================================================================

export { mapPayloadDocumentToIndex } from './document/field-mapper'
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
  TableConfig
} from './document/types'

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
  MIN_EMBEDDING_TEXT_LENGTH
} from './core/config/constants'
export type { LogContext, LoggerConfig, LogLevel } from './core/logging/logger'
// Logging
export {
  configureLogger,
  createLogger,
  getLogger,
  Logger,
  logger,
  setLogger
} from './core/logging/logger'
export type {
  ChunkHeaderMetadata,
  ParsedChunk
} from './core/utils/chunk-format-utils'
// Utilities
export {
  CHUNK_HEADER_SEPARATOR,
  extractContentOnly,
  extractHeaderMetadata,
  formatChunkWithHeaders,
  parseChunkText
} from './core/utils/chunk-format-utils'

export { buildHeaderHierarchy } from './core/utils/header-utils'
export type { SummarizeLexicalConfig } from './core/utils/transforms'
export {
  createSummarizeLexicalTransform,
  createSummarizeTransform,
  type SummarizeConfig,
  transformLexicalToMarkdown
} from './core/utils/transforms'

// ============================================================================
// HOOKS EXPORTS
// ============================================================================

export type { SyncHookContext } from './hooks'

// ============================================================================
// PLUGIN EXPORTS
// ============================================================================

// Plugin types
export type {
  IndexerFeatureConfig,
  IndexerPluginConfig,
  IndexerPluginResult,
  SearchFeatureConfig,
  SearchMode,
  SyncFeatureConfig
} from './plugin'
// Main factory
// Sync utilities (for custom implementations)
// Naming utilities
export {
  applySyncHooks,
  createIndexerPlugin,
  DocumentSyncer,
  deleteDocumentFromIndex,
  getIndexCollectionName,
  syncDocumentToIndex
} from './plugin'
