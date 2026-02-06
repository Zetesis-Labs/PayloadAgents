/**
 * Abstract interfaces for indexer adapters
 * Implementations (Typesense, Meilisearch, etc.) must implement IndexerAdapter
 */

/**
 * Helper type to extract the schema type from an adapter
 * @example type MySchema = InferSchema<TypesenseAdapter> // TypesenseCollectionSchema
 */
export type InferSchema<A> = A extends IndexerAdapter<infer S> ? S : BaseCollectionSchema

/**
 * Result of a document sync operation
 */
export interface SyncResult {
  success: boolean
  documentId: string
  collectionName: string
  chunksCreated?: number
  error?: Error
}

/**
 * Result of a document delete operation
 */
export interface DeleteResult {
  success: boolean
  documentId: string
  collectionName: string
  chunksDeleted?: number
  error?: Error
}

/**
 * Base collection schema definition
 * Each adapter can extend this with backend-specific fields
 */
export interface BaseCollectionSchema {
  name: string
  fields: Array<{ name: string; [key: string]: unknown }>
}

/**
 * Document ready for indexing (transformed)
 */
export interface IndexDocument {
  id: string
  [key: string]: unknown
}

/**
 * Options for vector search
 */
export interface VectorSearchOptions {
  limit?: number
  filter?: Record<string, unknown>
  includeFields?: string[]
  excludeFields?: string[]
}

/**
 * Generic search result from adapter
 * @typeParam TDoc - The document type returned in search results
 */
export interface AdapterSearchResult<TDoc = Record<string, unknown>> {
  id: string
  score: number
  document: TDoc
}

/**
 * Abstract interface that all indexer adapters must implement
 * This is the core contract between payload-indexer and specific backends (Typesense, Meilisearch, etc.)
 *
 * @typeParam TSchema - The collection schema type used by this adapter (extends BaseCollectionSchema)
 *
 * @example
 * class TypesenseAdapter implements IndexerAdapter<TypesenseCollectionSchema> { ... }
 */
export interface IndexerAdapter<TSchema extends BaseCollectionSchema = BaseCollectionSchema> {
  /**
   * Unique identifier for this adapter (e.g., 'typesense', 'meilisearch')
   */
  readonly name: string

  // === Connection Management ===

  /**
   * Test connection to the search backend
   */
  testConnection(): Promise<boolean>

  // === Schema Management ===

  /**
   * Create or update a collection/index schema
   * The schema type is adapter-specific
   */
  ensureCollection(schema: TSchema): Promise<void>

  /**
   * Check if a collection exists
   */
  collectionExists(collectionName: string): Promise<boolean>

  /**
   * Delete a collection
   */
  deleteCollection(collectionName: string): Promise<void>

  // === Document Operations ===

  /**
   * Upsert a single document
   */
  upsertDocument(collectionName: string, document: IndexDocument): Promise<void>

  /**
   * Upsert multiple documents (batch)
   */
  upsertDocuments(collectionName: string, documents: IndexDocument[]): Promise<void>

  /**
   * Delete a document by ID
   */
  deleteDocument(collectionName: string, documentId: string): Promise<void>

  /**
   * Delete documents matching a filter
   * Returns the number of deleted documents
   */
  deleteDocumentsByFilter(collectionName: string, filter: Record<string, unknown>): Promise<number>

  // === Optional: Vector Search ===

  /**
   * Perform a vector search (optional - not all adapters need this)
   * @typeParam TDoc - The document type to return in results
   */
  vectorSearch?<TDoc = Record<string, unknown>>(
    collectionName: string,
    vector: number[],
    options?: VectorSearchOptions
  ): Promise<AdapterSearchResult<TDoc>[]>
}
