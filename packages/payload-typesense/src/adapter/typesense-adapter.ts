import type {
  AdapterSearchResult,
  IndexDocument,
  IndexerAdapter,
  VectorSearchOptions
} from '@nexo-labs/payload-indexer'
import type { Client } from 'typesense'
import type { CollectionFieldSchema } from 'typesense/lib/Typesense/Collection'
import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections'
import { logger } from '../core/logging/logger'
import type {
  TypesenseCollectionInfo,
  TypesenseCollectionSchema,
  TypesenseFieldSchema,
  TypesenseSearchResult
} from './types'

/**
 * Typesense implementation of the IndexerAdapter interface
 *
 * This adapter provides type-safe field definitions for Typesense.
 * When used with createIndexerPlugin, TypeScript will validate that
 * all field mappings in your collection config are valid TypesenseFieldMapping.
 *
 * @example
 * ```typescript
 * const adapter = createTypesenseAdapter(config);
 *
 * // TypeScript infers TFieldMapping = TypesenseFieldMapping
 * const { plugin } = createIndexerPlugin({
 *   adapter,
 *   collections: {
 *     posts: [{
 *       enabled: true,
 *       fields: [
 *         { name: 'title', type: 'string' },       // ✅ Valid
 *         { name: 'views', type: 'int64' },        // ✅ Valid
 *         { name: 'tags', type: 'string[]', facet: true }, // ✅ With faceting
 *       ]
 *     }]
 *   }
 * });
 * ```
 */
export class TypesenseAdapter implements IndexerAdapter<TypesenseCollectionSchema> {
  readonly name = 'typesense'

  constructor(private client: Client) {}

  /**
   * Test connection to Typesense
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.health.retrieve()
      return true
    } catch (error) {
      logger.error('Typesense connection test failed', error)
      return false
    }
  }

  /**
   * Create or update a collection schema
   */
  async ensureCollection(schema: TypesenseCollectionSchema): Promise<void> {
    const typesenseSchema = this.convertToTypesenseSchema(schema)

    try {
      // Check if collection exists
      const existing = (await this.client.collections(schema.name).retrieve()) as TypesenseCollectionInfo

      // Collection exists, add new fields if any
      await this.updateCollectionIfNeeded(schema.name, existing, typesenseSchema)
    } catch (error: unknown) {
      const typesenseError = error as { httpStatus?: number }
      if (typesenseError?.httpStatus === 404) {
        // Collection doesn't exist, create it
        logger.info(`Creating collection: ${schema.name}`)
        await this.client.collections().create(typesenseSchema)
      } else {
        throw error
      }
    }
  }

  /**
   * Check if a collection exists
   */
  async collectionExists(collectionName: string): Promise<boolean> {
    try {
      await this.client.collections(collectionName).retrieve()
      return true
    } catch (error: unknown) {
      const typesenseError = error as { httpStatus?: number }
      if (typesenseError?.httpStatus === 404) {
        return false
      }
      throw error
    }
  }

  /**
   * Delete a collection
   */
  async deleteCollection(collectionName: string): Promise<void> {
    try {
      await this.client.collections(collectionName).delete()
      logger.info(`Deleted collection: ${collectionName}`)
    } catch (error: unknown) {
      const typesenseError = error as { httpStatus?: number }
      if (typesenseError?.httpStatus !== 404) {
        throw error
      }
    }
  }

  /**
   * Upsert a single document
   */
  async upsertDocument(collectionName: string, document: IndexDocument): Promise<void> {
    try {
      await this.client.collections(collectionName).documents().upsert(document)
    } catch (error) {
      logger.error(`Failed to upsert document ${document.id} to ${collectionName}`, error)
      throw error
    }
  }

  /**
   * Upsert multiple documents (batch)
   */
  async upsertDocuments(collectionName: string, documents: IndexDocument[]): Promise<void> {
    if (documents.length === 0) return

    try {
      await this.client.collections(collectionName).documents().import(documents, {
        action: 'upsert'
      })
    } catch (error: unknown) {
      const importError = error as { importResults?: Array<{ success: boolean }> }
      const failedItems = importError?.importResults?.filter(r => !r.success)
      logger.error(JSON.stringify(failedItems))
      throw error
    }
  }

  /**
   * Delete a document by ID
   */
  async deleteDocument(collectionName: string, documentId: string): Promise<void> {
    try {
      await this.client.collections(collectionName).documents(documentId).delete()
    } catch (error: unknown) {
      const typesenseError = error as { httpStatus?: number }
      // Ignore 404 errors (document already deleted)
      if (typesenseError?.httpStatus !== 404) {
        logger.error(`Failed to delete document ${documentId} from ${collectionName}`, error)
        throw error
      }
    }
  }

  /**
   * Delete documents matching a filter
   * Returns the number of deleted documents
   */
  async deleteDocumentsByFilter(collectionName: string, filter: Record<string, unknown>): Promise<number> {
    const filterStr = this.buildFilterString(filter)

    try {
      const result = await this.client.collections(collectionName).documents().delete({
        filter_by: filterStr
      })
      return result.num_deleted || 0
    } catch (error) {
      logger.error(`Failed to delete documents by filter from ${collectionName}`, error, { filter })
      throw error
    }
  }

  /**
   * Perform a vector search
   * @typeParam TDoc - The document type to return in results
   */
  async vectorSearch<TDoc = Record<string, unknown>>(
    collectionName: string,
    vector: number[],
    options: VectorSearchOptions = {}
  ): Promise<AdapterSearchResult<TDoc>[]> {
    const { limit = 10, filter, includeFields, excludeFields } = options

    try {
      const searchParams: Record<string, unknown> = {
        q: '*',
        vector_query: `embedding:([${vector.join(',')}], k:${limit})`
      }

      if (filter) {
        searchParams.filter_by = this.buildFilterString(filter)
      }

      if (includeFields) {
        searchParams.include_fields = includeFields.join(',')
      }

      if (excludeFields) {
        searchParams.exclude_fields = excludeFields.join(',')
      }

      const result = (await this.client
        .collections(collectionName)
        .documents()
        .search(searchParams)) as TypesenseSearchResult<TDoc>

      return (result.hits || []).map(hit => ({
        id: String((hit.document as Record<string, unknown>)?.id || ''),
        score: hit.vector_distance ?? 0,
        document: hit.document
      }))
    } catch (error) {
      logger.error(`Vector search failed on ${collectionName}`, error)
      throw error
    }
  }

  // === Private helper methods ===

  /**
   * Convert generic schema to Typesense-specific schema
   */
  private convertToTypesenseSchema(schema: TypesenseCollectionSchema): CollectionCreateSchema {
    return {
      name: schema.name,
      fields: schema.fields.map(field => this.convertField(field)),
      default_sorting_field: schema.defaultSortingField
    }
  }

  /**
   * Convert a single field schema to Typesense format
   */
  private convertField(field: TypesenseFieldSchema): CollectionFieldSchema {
    const typesenseField: CollectionFieldSchema = {
      name: field.name,
      type: field.type,
      facet: field.facet,
      index: field.index,
      optional: field.optional
    }

    // Add vector dimensions for float[] embedding fields
    if (field.type === 'float[]' && field.vectorDimensions) {
      typesenseField.num_dim = field.vectorDimensions
    }

    return typesenseField
  }

  /**
   * Update collection with new fields if needed
   */
  private async updateCollectionIfNeeded(
    collectionName: string,
    currentSchema: TypesenseCollectionInfo,
    targetSchema: CollectionCreateSchema
  ): Promise<void> {
    if (!currentSchema?.fields) return

    const currentFields = new Set(currentSchema.fields.map(f => f.name))
    const newFields = targetSchema.fields?.filter(f => !currentFields.has(f.name) && f.name !== 'id') || []

    if (newFields.length > 0) {
      logger.info(`Updating collection ${collectionName} with ${newFields.length} new fields`, {
        fields: newFields.map(f => f.name)
      })

      try {
        await this.client.collections(collectionName).update({
          fields: newFields
        })
      } catch (error) {
        logger.error(`Failed to update collection ${collectionName}`, error)
      }
    }
  }

  /**
   * Build a Typesense filter string from a filter object
   */
  private buildFilterString(filter: Record<string, unknown>): string {
    const parts: string[] = []

    for (const [key, value] of Object.entries(filter)) {
      if (Array.isArray(value)) {
        // Array values use 'IN' syntax
        parts.push(`${key}:[${value.map(v => String(v)).join(',')}]`)
      } else if (typeof value === 'string') {
        parts.push(`${key}:=${value}`)
      } else if (typeof value === 'number') {
        parts.push(`${key}:${value}`)
      } else if (typeof value === 'boolean') {
        parts.push(`${key}:${value}`)
      }
    }

    return parts.join(' && ')
  }
}
