import type { TableConfig } from '@nexo-labs/payload-indexer'
import type { Client } from 'typesense'
import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections'
import type { TypesenseFieldMapping } from '../../../adapter/types'
import type { ModularPluginConfig } from '../../../core/config/types'
import { logger } from '../../../core/logging/logger'
import { getTypesenseCollectionName } from '../../../core/utils/naming'
import { getChunkCollectionSchema, getFullDocumentCollectionSchema } from '../../../shared/schema/collection-schemas'

export class SchemaManager {
  constructor(
    private client: Client,
    private config: ModularPluginConfig
  ) {}

  /**
   * Synchronizes all configured collections with Typesense
   */
  async syncCollections(): Promise<void> {
    if (!this.config.collections) return

    logger.info('Starting schema synchronization...')

    const embeddingDimensions = this.config?.features?.embedding?.dimensions

    for (const [collectionSlug, tableConfigs] of Object.entries(this.config.collections)) {
      if (!tableConfigs) continue

      for (const tableConfig of tableConfigs as TableConfig<TypesenseFieldMapping>[]) {
        if (!embeddingDimensions) {
          console.warn(`Embedding dimensions not configured. Skipping schema sync for collection: ${collectionSlug}`)
          continue
        }
        if (!tableConfig.enabled) continue

        await this.syncTable(collectionSlug, tableConfig, embeddingDimensions)
      }
    }

    logger.info('Schema synchronization completed.')
  }

  /**
   * Syncs a single table configuration
   */
  private async syncTable(
    collectionSlug: string,
    tableConfig: TableConfig<TypesenseFieldMapping>,
    embeddingDimensions: number
  ): Promise<void> {
    const tableName = getTypesenseCollectionName(collectionSlug, tableConfig)

    // Generate target schema
    let targetSchema: CollectionCreateSchema

    if (tableConfig.embedding?.chunking) {
      targetSchema = getChunkCollectionSchema(tableName, tableConfig, embeddingDimensions)
    } else {
      targetSchema = getFullDocumentCollectionSchema(tableName, tableConfig, embeddingDimensions)
    }

    try {
      // Check if collection exists
      const collection = await this.client.collections(tableName).retrieve()

      // Collection exists, check for updates (new fields)
      // Typesense only allows adding fields, not modifying/deleting (requires reindex)
      await this.updateCollectionSchema(tableName, collection, targetSchema)
    } catch (error: unknown) {
      const typesenseError = error as { httpStatus?: number }
      if (typesenseError?.httpStatus === 404) {
        // Collection doesn't exist, create it
        logger.info(`Creating collection: ${tableName}`)
        await this.client.collections().create(targetSchema)
      } else {
        logger.error(`Error checking collection ${tableName}`, error as Error)
        throw error
      }
    }
  }

  private async updateCollectionSchema(
    tableName: string,
    currentSchema: { fields?: Array<{ name: string }> },
    targetSchema: CollectionCreateSchema
  ): Promise<void> {
    if (!currentSchema || !currentSchema.fields) return

    const fields = currentSchema.fields
    const currentFields = new Set(fields.map(f => f.name))
    // Filter out fields that already exist OR are 'id' (which is immutable)
    const newFields = targetSchema.fields?.filter(f => !currentFields.has(f.name) && f.name !== 'id') || []

    if (newFields.length > 0) {
      logger.info(`Updating collection ${tableName} with ${newFields.length} new fields`, {
        fields: newFields.map(f => f.name)
      })

      try {
        // Update collection with new fields
        await this.client.collections(tableName).update({
          fields: newFields
        })
      } catch (error) {
        logger.error(`Failed to update collection ${tableName}`, error as Error)
      }
    }
  }
}
