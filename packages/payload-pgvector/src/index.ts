/**
 * @zetesis/payload-pgvector
 *
 * Postgres + pgvector search backend for Payload CMS. Implements the
 * @zetesis/payload-indexer IndexerAdapter contract as a sibling of
 * @zetesis/payload-typesense, with app-side embeddings via any OpenAI-compatible
 * endpoint (OpenAI, a LiteLLM gateway, a local TEI/Ollama server, ...).
 *
 * Milestone 1: adapter + embedding provider. The features/search layer
 * (hybrid, multi-collection, RAG endpoints) is built on top of this.
 */

export type { CreatePgvectorAdapterOptions } from './adapter/create-adapter'
export { createPgvectorAdapter, createPgvectorAdapterFromPool } from './adapter/create-adapter'
export type { PgvectorAdapterOptions } from './adapter/pgvector-adapter'
// Adapter
export { PgvectorAdapter } from './adapter/pgvector-adapter'

// Schema types
export type {
  CollectionEmbedInfo,
  PgFieldSchema,
  PgFieldType,
  PgvectorCollectionSchema
} from './adapter/types'
export type {
  EmbeddingProvider,
  OpenAICompatibleEmbeddingConfig
} from './embedding/provider'
// Embedding
export { OpenAICompatibleEmbeddingProvider } from './embedding/provider'
// Plugin (schema sync)
export { createPgvectorPlugin } from './plugin/create-pgvector-plugin'
export { deriveCollectionSchemas } from './plugin/derive-schema'
export type { PgvectorMcpDescriptorOptions } from './plugin/mcp-descriptor'

// MCP descriptor
export { createPgvectorMcpDescriptor } from './plugin/mcp-descriptor'
export type { PgvectorFieldMapping, PgvectorPluginConfig } from './plugin/types'
