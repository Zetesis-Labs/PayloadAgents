import type { TableConfig } from "@nexo-labs/payload-indexer";
import type { ModularPluginConfig } from "../../../../../core/config/types";
import { getTypesenseCollectionName } from "../../../../../core/utils/naming";

export class SearchConfigMapper {
  constructor(private pluginOptions: ModularPluginConfig) {}

  /**
   * Maps a list of table names to their full configuration objects.
   * Essential for the search service which needs config details (fields, weights, etc.)
   */
  mapTablesToConfigs(targetTableNames: string[]): Array<[string, TableConfig]> {
    const searchConfigs: Array<[string, TableConfig]> = [];

    // Iterate through all collections in global config
    for (const [slug, configs] of Object.entries(
      this.pluginOptions.collections || {},
    )) {
      if (!Array.isArray(configs)) continue;

      for (const config of configs) {
        if (!config.enabled) continue;

        const tableName = getTypesenseCollectionName(slug, config);

        // If this table is in our target list, add it to the result
        if (targetTableNames.includes(tableName)) {
          searchConfigs.push([tableName, config]);
        }
      }
    }

    return searchConfigs;
  }
}
