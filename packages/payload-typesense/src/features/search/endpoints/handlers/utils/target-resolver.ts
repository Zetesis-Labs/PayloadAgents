import type { ModularPluginConfig } from "../../../../../core/config/types";
import { getTypesenseCollectionName } from "../../../../../core/utils/naming";

export class TargetCollectionResolver {
  private allowedTableNames: string[];

  constructor(private pluginOptions: ModularPluginConfig) {
    this.allowedTableNames = this.getAllowedTableNames(pluginOptions);
  }

  private getAllowedTableNames(pluginOptions: ModularPluginConfig): string[] {
    const configuredAllowed =
      pluginOptions.features.search?.defaults?.tables || [];
    const allowedTableNames: Set<string> = new Set();
    const allTableNames: Set<string> = new Set();

    for (const [collectionSlug, tableConfigs] of Object.entries(
      pluginOptions.collections || {},
    )) {
      if (Array.isArray(tableConfigs)) {
        for (const tableConfig of tableConfigs) {
          if (!tableConfig.enabled) continue;

          const tableName = getTypesenseCollectionName(
            collectionSlug,
            tableConfig,
          );
          allTableNames.add(tableName);

          // If no restrictions are configured, everything is allowed
          if (configuredAllowed.length === 0) {
            allowedTableNames.add(tableName);
            continue;
          }

          // STRICT MODE: Only allow if the exact table name is in the allowed list.
          // Do NOT allow by collection slug.
          if (configuredAllowed.includes(tableName)) {
            allowedTableNames.add(tableName);
          }
        }
      }
    }

    return Array.from(allowedTableNames);
  }

  /**
   * Resolves target table names based on request parameters.
   * Handles both multi-collection (array) and single-collection (slug) requests.
   * Enforces strict validation against allowed tables.
   */
  resolveTargetTables(
    collectionNameSlug: string | null,
    requestedCollections: string[] | undefined,
  ): string[] {
    // Case 1: Multi-collection search (no path param)
    if (!collectionNameSlug) {
      if (requestedCollections && requestedCollections.length > 0) {
        // Strict filtering: Only keep requested tables that are explicitly allowed
        return requestedCollections.filter((c) =>
          this.allowedTableNames.includes(c),
        );
      }
      // Default: Return all allowed tables
      return this.allowedTableNames;
    }

    const targetTables: string[] = [];
    const tableConfigs =
      this.pluginOptions.collections?.[collectionNameSlug] || [];

    if (Array.isArray(tableConfigs)) {
      for (const config of tableConfigs) {
        if (config.enabled) {
          const tableName = getTypesenseCollectionName(
            collectionNameSlug,
            config,
          );
          if (this.allowedTableNames.includes(tableName)) {
            targetTables.push(tableName);
          }
        }
      }
    }

    return targetTables;
  }
}
