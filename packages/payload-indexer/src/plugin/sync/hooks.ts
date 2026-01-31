/**
 * Sync hooks for Payload collections
 * Adapter-agnostic implementation
 */

import type { CollectionConfig } from "payload";
import type { IndexerAdapter } from "../../adapter/types.js";
import { logger } from "../../core/logging/logger.js";
import type { EmbeddingService } from "../../embedding/types.js";
import type { IndexerPluginConfig } from "../types.js";
import {
  deleteDocumentFromIndex,
  syncDocumentToIndex,
} from "./document-syncer.js";

/**
 * Applies sync hooks to Payload collections
 * Uses the adapter pattern for backend-agnostic indexing
 */
export const applySyncHooks = (
  collections: CollectionConfig[],
  pluginConfig: IndexerPluginConfig,
  adapter: IndexerAdapter,
  embeddingService?: EmbeddingService,
): CollectionConfig[] => {
  if (
    !pluginConfig.features.sync?.enabled ||
    pluginConfig.features.sync.autoSync === false ||
    !pluginConfig.collections
  ) {
    return collections;
  }

  return (collections || []).map((collection) => {
    const tableConfigs = pluginConfig.collections?.[collection.slug];

    const hasEnabledTables =
      tableConfigs &&
      Array.isArray(tableConfigs) &&
      tableConfigs.some((tableConfig) => tableConfig.enabled);

    if (hasEnabledTables) {
      logger.debug("Registering sync hooks for collection", {
        collection: collection.slug,
        tableCount: tableConfigs?.length || 0,
      });

      return {
        ...collection,
        hooks: {
          ...collection.hooks,
          afterChange: [
            ...(collection.hooks?.afterChange || []),
            async ({ doc, operation, req: _req }) => {
              if (!tableConfigs) return;

              for (const tableConfig of tableConfigs) {
                if (!tableConfig.enabled) continue;

                // Check shouldIndex callback
                if (tableConfig.shouldIndex) {
                  const shouldIndex = await tableConfig.shouldIndex(doc);
                  if (!shouldIndex) {
                    await deleteDocumentFromIndex(
                      adapter,
                      collection.slug,
                      doc.id,
                      tableConfig,
                    );
                    continue;
                  }
                }

                await syncDocumentToIndex(
                  adapter,
                  collection.slug,
                  doc,
                  operation,
                  tableConfig,
                  embeddingService,
                );
              }
            },
          ],
          afterDelete: [
            ...(collection.hooks?.afterDelete || []),
            async ({ doc, req: _req }) => {
              if (!tableConfigs) return;

              // Borra el documento y chunks en todas las tablas asociadas
              await deleteDocumentFromIndex(
                adapter,
                collection.slug,
                doc.id,
                tableConfigs.filter((tableConfig) => tableConfig.enabled),
              );
            },
          ],
        },
      };
    }

    return collection;
  });
};
