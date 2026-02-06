/**
 * Sync hooks for Payload collections
 * Adapter-agnostic implementation
 */

import type { CollectionConfig } from 'payload'
import type { IndexerAdapter } from '../../adapter/types'
import { logger } from '../../core/logging/logger'
import type { PayloadDocument, TableConfig } from '../../document/types'
import type { EmbeddingService } from '../../embedding/types'
import type { IndexerPluginConfig } from '../types'
import { deleteDocumentFromIndex, syncDocumentToIndex } from './document-syncer'

/**
 * Processes a single table config during afterChange, handling shouldIndex and sync
 */
const processTableConfigAfterChange = async (
  tableConfig: TableConfig,
  adapter: IndexerAdapter,
  collectionSlug: string,
  doc: PayloadDocument,
  operation: 'create' | 'update',
  embeddingService?: EmbeddingService
): Promise<void> => {
  if (!tableConfig.enabled) return

  if (tableConfig.shouldIndex) {
    const shouldIndex = await tableConfig.shouldIndex(doc)
    if (!shouldIndex) {
      await deleteDocumentFromIndex(adapter, collectionSlug, doc.id, tableConfig)
      return
    }
  }

  await syncDocumentToIndex(adapter, collectionSlug, doc, operation, tableConfig, embeddingService)
}

/**
 * Creates the afterChange hook handler for a collection
 */
const createAfterChangeHook = (
  tableConfigs: TableConfig[],
  adapter: IndexerAdapter,
  collectionSlug: string,
  embeddingService?: EmbeddingService
) => {
  return async ({
    doc,
    operation,
    req
  }: {
    doc: PayloadDocument
    operation: 'create' | 'update'
    req: { context?: Record<string, unknown> }
  }) => {
    if (req.context?.skipIndexSync) return

    for (const tableConfig of tableConfigs) {
      await processTableConfigAfterChange(tableConfig, adapter, collectionSlug, doc, operation, embeddingService)
    }
  }
}

/**
 * Creates the afterDelete hook handler for a collection
 */
const createAfterDeleteHook = (tableConfigs: TableConfig[], adapter: IndexerAdapter, collectionSlug: string) => {
  return async ({ doc }: { doc: PayloadDocument; req: unknown }) => {
    await deleteDocumentFromIndex(
      adapter,
      collectionSlug,
      doc.id,
      tableConfigs.filter(tableConfig => tableConfig.enabled)
    )
  }
}

/**
 * Applies sync hooks to Payload collections
 * Uses the adapter pattern for backend-agnostic indexing
 */
export const applySyncHooks = (
  collections: CollectionConfig[],
  pluginConfig: IndexerPluginConfig,
  adapter: IndexerAdapter,
  embeddingService?: EmbeddingService
): CollectionConfig[] => {
  if (
    !pluginConfig.features.sync?.enabled ||
    pluginConfig.features.sync.autoSync === false ||
    !pluginConfig.collections
  ) {
    return collections
  }

  return (collections || []).map(collection => {
    const tableConfigs = pluginConfig.collections?.[collection.slug]

    const hasEnabledTables =
      tableConfigs && Array.isArray(tableConfigs) && tableConfigs.some(tableConfig => tableConfig.enabled)

    if (!hasEnabledTables) {
      return collection
    }

    logger.debug('Registering sync hooks for collection', {
      collection: collection.slug,
      tableCount: tableConfigs?.length || 0
    })

    return {
      ...collection,
      hooks: {
        ...collection.hooks,
        afterChange: [
          ...(collection.hooks?.afterChange || []),
          createAfterChangeHook(tableConfigs, adapter, collection.slug, embeddingService)
        ],
        afterDelete: [
          ...(collection.hooks?.afterDelete || []),
          createAfterDeleteHook(tableConfigs, adapter, collection.slug)
        ]
      }
    }
  })
}
