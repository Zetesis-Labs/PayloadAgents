/**
 * Plugin configuration types
 */

import type { CollectionSlug } from 'payload'
import type { IndexerAdapter } from '../adapter/types'
import type { FieldMapping, TableConfig } from '../document/types'
import type { EmbeddingProviderConfig } from '../embedding/types'

/**
 * Sync feature configuration
 */
export interface SyncFeatureConfig {
  enabled: boolean
  /** Whether to auto-sync on document changes (default: true) */
  autoSync?: boolean
  /** Batch size for bulk operations */
  batchSize?: number
}

/**
 * Search mode types
 */
export type SearchMode = 'semantic' | 'keyword' | 'hybrid'

/**
 * Search feature configuration
 */
export interface SearchFeatureConfig {
  enabled: boolean
  defaults?: {
    mode?: SearchMode
    perPage?: number
    tables?: string[]
  }
}

/**
 * Feature flags for the indexer plugin
 */
export interface IndexerFeatureConfig {
  /** Embedding provider configuration */
  embedding?: EmbeddingProviderConfig
  /** Sync feature configuration */
  sync?: SyncFeatureConfig
  /** Search feature configuration */
  search?: SearchFeatureConfig
}

export type IndexableCollectionConfig<TFieldMapping extends FieldMapping> = Record<
  CollectionSlug | string,
  TableConfig<TFieldMapping>[]
>

/**
 * Main plugin configuration
 *
 * @typeParam TFieldMapping - The field mapping type for collection fields
 */
export interface IndexerPluginConfig<TFieldMapping extends FieldMapping = FieldMapping> {
  /** The adapter to use for indexing operations */
  adapter: IndexerAdapter
  /** Feature configuration */
  features: IndexerFeatureConfig
  /** Collection configurations */
  collections: IndexableCollectionConfig<TFieldMapping>
}
