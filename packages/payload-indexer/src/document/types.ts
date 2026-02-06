/**
 * Document types and field mapping configuration
 */

/**
 * Base field mapping configuration
 * Defines how a Payload field maps to an index field
 *
 * This is the minimal interface that all field mappings must implement.
 * Adapters can extend this with backend-specific properties.
 *
 * @example
 * // TypesenseFieldMapping extends this with: type, facet, index, optional
 * // MeilisearchFieldMapping might extend with: searchable, filterable, sortable
 */
export interface FieldMapping {
  /**
   * Name of the field in the index
   */
  name: string

  /**
   * Path to the field in Payload (supports dot notation)
   * If not provided, defaults to 'name'
   */
  payloadField?: string

  /**
   * Custom transformation function to convert Payload value to index value
   * Useful for handling relations, rich text, or any complex data type
   *
   * @param value - The raw value from Payload
   * @returns The transformed value for the index
   *
   * @example
   * // Convert relation array to string array of names
   * transform: (value) => {
   *   if (Array.isArray(value)) {
   *     return value.map(item => item.name || item.title || String(item));
   *   }
   *   return [];
   * }
   */
  transform?(value: unknown, ...args: unknown[]): Promise<unknown> | unknown
}

/**
 * Source field configuration for embedding/chunking
 * Defines a field to extract and optionally transform
 */
export interface SourceField {
  /**
   * Name of the field in Payload
   */
  field: string

  /**
   * Optional transform function to convert the field value
   * Useful for converting RichText to plain text/markdown
   *
   * @param value - The raw value from Payload
   * @returns The transformed value
   */
  transform?(value: unknown, ...args: unknown[]): unknown | Promise<unknown>
}

/**
 * Chunking configuration
 */
export interface ChunkingConfig {
  /**
   * Chunking strategy to use
   */
  strategy: 'markdown' | 'text'

  /**
   * Maximum size of each chunk in characters
   */
  size?: number

  /**
   * Overlap between chunks in characters
   */
  overlap?: number

  /**
   * Callback to intercept and modify chunk results
   * Allows adding extra metadata or modifying the chunk text before embedding
   *
   * @param chunkResultsWithMetadata - The generated chunks with their metadata
   * @param payloadDocument - The original Payload document
   * @returns The modified chunk text or object
   */
  interceptResult?: (
    chunkResultsWithMetadata: Record<string, unknown>,
    payloadDocument: Record<string, unknown>
  ) => string
}

/**
 * Embedding configuration for a table
 */
export interface EmbeddingTableConfig {
  /**
   * Source fields to extract and transform for embedding generation
   * These will be concatenated if multiple are provided
   */
  fields: (string | SourceField)[]

  /**
   * Optional chunking configuration
   * If provided, the content will be chunked before embedding
   */
  chunking?: ChunkingConfig
}

/**
 * Base configuration for any table mapping
 *
 * @typeParam TFieldMapping - The field mapping type (adapter-specific, extends FieldMapping)
 */
interface BaseTableConfig<TFieldMapping extends FieldMapping = FieldMapping> {
  /**
   * Name of the table in the index
   * If not provided, generated from collection slug + suffix
   */
  tableName?: string

  /**
   * Display name for UI
   */
  displayName?: string

  /**
   * Whether this table sync is enabled
   */
  enabled: boolean

  /**
   * Fields to map from Payload to the index
   * The field type depends on the adapter being used
   */
  fields: TFieldMapping[]

  /**
   * Optional callback to determine if a document should be indexed
   *
   * @param doc - The document being indexed
   * @returns boolean | Promise<boolean> - true to index, false to skip
   */
  shouldIndex?: (doc: Record<string, unknown>) => boolean | Promise<boolean>
}

/**
 * Configuration for Table Mapping
 *
 * @typeParam TFieldMapping - The field mapping type (adapter-specific, extends FieldMapping)
 *
 * @example
 * // With Typesense adapter, TFieldMapping = TypesenseFieldMapping
 * // which includes: type, facet, index, optional
 */
export interface TableConfig<TFieldMapping extends FieldMapping = FieldMapping> extends BaseTableConfig<TFieldMapping> {
  /**
   * Embedding configuration
   * Defines how to generate embeddings for this table
   */
  embedding?: EmbeddingTableConfig
}

/**
 * Collection configuration
 * Maps a Payload collection to one or more index tables
 *
 * @typeParam TFieldMapping - The field mapping type (adapter-specific)
 */
export interface CollectionConfig<TFieldMapping extends FieldMapping = FieldMapping> {
  tables: TableConfig<TFieldMapping>[]
}

// === Document Types ===

/**
 * Base document interface that all collections should extend
 */
export interface BaseDocument {
  _status?: 'draft' | 'published'
  createdAt: Date | string
  publishedAt?: Date | string
  id: string
  slug?: string
  updatedAt: Date | string
}

/**
 * Generic Payload document
 */
export interface PayloadDocument extends BaseDocument {
  [key: string]: unknown
}

/**
 * Generic indexed document
 */
export interface IndexedDocument {
  id: string
  slug?: string
  createdAt: number
  updatedAt: number
  embedding?: number[]
  [key: string]: unknown
}

/**
 * Chunk document for RAG/semantic search
 */
export interface ChunkDocument {
  id: string
  parent_doc_id: string
  slug: string
  title?: string
  createdAt: number
  publishedAt?: number
  updatedAt: number
  chunk_index: number
  chunk_text: string
  is_chunk: boolean
  headers?: string[]
  embedding: number[]
  [key: string]: unknown
}
