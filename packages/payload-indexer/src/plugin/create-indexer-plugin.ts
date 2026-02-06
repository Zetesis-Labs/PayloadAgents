/**
 * Generic indexer plugin factory
 * Creates a Payload CMS plugin that handles document syncing to any search backend
 */

import type { Config } from "payload";
import type { IndexerAdapter } from "../adapter/types";
import { Logger } from "../core/logging/logger";
import type { FieldMapping } from "../document/types";
import { GeminiEmbeddingProvider } from "../embedding/providers/gemini-provider";
import { OpenAIEmbeddingProvider } from "../embedding/providers/openai-provider";
import { EmbeddingServiceImpl } from "../embedding/service";
import type { EmbeddingService } from "../embedding/types";
import { applySyncHooks } from "./sync/hooks";
import type { IndexerPluginConfig } from "./types";

/**
 * Result of plugin creation containing the plugin function and internal services
 */
export interface IndexerPluginResult<TConfig extends Config> {
  /** The Payload plugin function */
  plugin: (config: TConfig) => TConfig;
  /** The embedding service instance (if configured) */
  embeddingService?: EmbeddingService;
  /** The adapter instance */
  adapter: IndexerAdapter;
}

/**
 * Creates an indexer plugin for Payload CMS
 *
 * This is the main factory function for creating a search indexer plugin.
 * It handles:
 * - Embedding service creation (optional)
 * - Sync hooks for document create/update/delete
 *
 * Schema management and search endpoints should be handled by the adapter-specific wrapper
 * (e.g., typesenseSearch) as they have backend-specific requirements.
 *
 * @param config - Plugin configuration
 * @returns Object containing the plugin function and created services
 *
 * @example
 * ```typescript
 * import { createIndexerPlugin } from '@nexo-labs/payload-indexer';
 * import { createTypesenseAdapter } from '@nexo-labs/payload-typesense';
 *
 * const adapter = createTypesenseAdapter({ apiKey: '...', nodes: [...] });
 *
 * // TypeScript infers TFieldMapping from the adapter
 * const { plugin, embeddingService } = createIndexerPlugin({
 *   adapter,
 *   features: {
 *     embedding: { type: 'openai', apiKey: '...' },
 *     sync: { enabled: true }
 *   },
 *   collections: {
 *     posts: [{
 *       enabled: true,
 *       fields: [
 *         { name: 'title', type: 'string' },      // ✅ Valid Typesense field
 *         { name: 'views', type: 'int64' },       // ✅ Valid Typesense field
 *         { name: 'tags', type: 'string[]', facet: true }, // ✅ With faceting
 *       ]
 *     }]
 *   }
 * });
 *
 * export default buildConfig({
 *   plugins: [plugin]
 * });
 * ```
 */
export function createIndexerPlugin<
  TFieldMapping extends FieldMapping,
  TConfig extends Config,
>(config: IndexerPluginConfig<TFieldMapping>): IndexerPluginResult<TConfig> {
  const { adapter, features, collections } = config;
  const logger = new Logger({ enabled: true, prefix: "[payload-indexer]" });

  // 1. Create Embedding Service (optional)
  let embeddingService: EmbeddingService | undefined;
  const embeddingConfig = features.embedding;

  if (embeddingConfig) {
    const provider =
      embeddingConfig.type === "gemini"
        ? new GeminiEmbeddingProvider(embeddingConfig, logger)
        : new OpenAIEmbeddingProvider(embeddingConfig, logger);

    embeddingService = new EmbeddingServiceImpl(
      provider,
      logger,
      embeddingConfig,
    );

    logger.debug("Embedding service initialized", {
      provider: embeddingConfig.type,
    });
  }

  // 2. Create the plugin function
  const plugin = (payloadConfig: TConfig): TConfig => {
    // Apply sync hooks to collections
    if (payloadConfig.collections && features.sync?.enabled) {
      payloadConfig.collections = applySyncHooks(
        payloadConfig.collections,
        config,
        adapter,
        embeddingService,
      );

      logger.debug("Sync hooks applied to collections", {
        collectionsCount: Object.keys(collections).length,
      });
    }

    return payloadConfig;
  };

  return {
    plugin,
    embeddingService,
    adapter,
  };
}
