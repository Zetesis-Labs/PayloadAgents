import type { TableConfig } from '@nexo-labs/payload-indexer'

/**
 * Generates the Typesense collection name based on the configuration.
 *
 * Priority:
 * 1. Explicit `tableName` if provided.
 * 2. `collectionSlug` (fallback).
 *
 * @param collectionSlug The slug of the Payload collection
 * @param tableConfig The configuration for the specific table
 * @returns The generated Typesense collection name
 */
export const getTypesenseCollectionName = (collectionSlug: string, tableConfig: TableConfig): string => {
  return tableConfig.tableName ?? collectionSlug
}
