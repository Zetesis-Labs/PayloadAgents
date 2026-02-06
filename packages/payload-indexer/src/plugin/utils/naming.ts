/**
 * Naming utilities for index collections
 */

import type { TableConfig } from "../../document/types";

/**
 * Generates the index collection name based on the configuration.
 *
 * Priority:
 * 1. Explicit `tableName` if provided.
 * 2. `collectionSlug` (fallback).
 *
 * @param collectionSlug The slug of the Payload collection
 * @param tableConfig The configuration for the specific table
 * @returns The generated collection name
 */
export const getIndexCollectionName = (
  collectionSlug: string,
  tableConfig: TableConfig,
): string => {
  return tableConfig.tableName ?? collectionSlug;
};
