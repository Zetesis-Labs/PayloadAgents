/**
 * Composable Typesense RAG plugin factory for Payload CMS
 *
 * This plugin handles all Typesense-specific functionality:
 * - Search endpoints
 * - RAG endpoints
 * - Schema synchronization
 * - Agent synchronization
 *
 * It's designed to be used together with createIndexerPlugin from @nexo-labs/payload-indexer.
 *
 * @example
 * ```typescript
 * import { createIndexerPlugin } from '@nexo-labs/payload-indexer'
 * import { createTypesenseAdapter, createTypesenseRAGPlugin } from '@nexo-labs/payload-typesense'
 *
 * // 1. Create adapter
 * const adapter = createTypesenseAdapter(typesenseConnection)
 *
 * // 2. Create indexer plugin (sync hooks + embedding)
 * const { plugin: indexerPlugin, embeddingService } = createIndexerPlugin({
 *   adapter,
 *   features: { embedding: embeddingConfig, sync: { enabled: true } },
 *   collections,
 * })
 *
 * // 3. Create Typesense RAG plugin (search + RAG + schema)
 * const typesenseRAGPlugin = createTypesenseRAGPlugin({
 *   typesense: typesenseConnection,
 *   embeddingConfig,
 *   collections,
 *   search: { enabled: true, defaults: { mode: 'semantic', perPage: 10 } },
 *   agents: [...],
 *   callbacks: {...},
 * })
 *
 * // 4. Export both plugins
 * export const plugins = [indexerPlugin, typesenseRAGPlugin]
 * ```
 */

import type { CollectionSlug, Config } from "payload";
import type { TypesenseRAGPluginConfig } from "./rag-types.js";
import type { AgentConfig } from "../shared/types/plugin-types.js";
import { Logger } from "@nexo-labs/payload-indexer";
import { createTypesenseClient } from "../core/client/typesense-client.js";
import { createRAGPayloadHandlers } from "../features/rag/endpoints.js";
import { createSearchEndpoints } from "../features/search/endpoints.js";
import { SchemaManager } from "../features/sync/services/schema-manager.js";
import { AgentManager } from "../features/rag/services/agent-manager.js";

/**
 * Creates a composable Typesense RAG plugin for Payload CMS
 *
 * This plugin handles all Typesense-specific features:
 * - Search endpoints (semantic, hybrid, keyword)
 * - RAG endpoints (chat, session management)
 * - Schema synchronization
 * - Agent synchronization
 *
 * @param config - Typesense RAG plugin configuration
 * @returns Payload config modifier function
 */
export function createTypesenseRAGPlugin<TConfig extends Config, TSlug extends CollectionSlug>(config: TypesenseRAGPluginConfig<TSlug>) {
  const logger = new Logger({ enabled: true, prefix: "[payload-typesense]" });

  return (payloadConfig: TConfig): TConfig => {
    // Create Typesense client
    const typesenseClient = createTypesenseClient(config.typesense);

    // 1. Add search endpoints if enabled
    if (config.search?.enabled) {
      const searchEndpoints = createSearchEndpoints(typesenseClient, {
        typesense: config.typesense,
        features: {
          embedding: config.embeddingConfig,
          search: config.search,
        },
        collections: config.collections || {},
      });

      payloadConfig.endpoints = [
        ...(payloadConfig.endpoints || []),
        ...searchEndpoints,
      ];

      logger.debug("Search endpoints registered", {
        endpointsCount: searchEndpoints.length,
      });
    }

    // 2. Add RAG endpoints if agents and callbacks are configured
    if (config.agents && config.agents.length > 0 && config.callbacks) {
      const ragEndpoints = createRAGPayloadHandlers({
        typesense: config.typesense,
        collectionName: config.collectionName,
        embeddingConfig: config.embeddingConfig,
        agents: config.agents,
        callbacks: config.callbacks,
        hybrid: config.hybrid,
        hnsw: config.hnsw,
        advanced: config.advanced,
      });

      payloadConfig.endpoints = [
        ...(payloadConfig.endpoints || []),
        ...ragEndpoints,
      ];

      logger.debug("RAG endpoints registered", {
        endpointsCount: ragEndpoints.length,
        agentsCount: config.agents.length,
      });
    }

    // 3. Initialize on startup (schema sync + agent sync)
    const incomingOnInit = payloadConfig.onInit;
    payloadConfig.onInit = async (payload) => {
      if (incomingOnInit) {
        await incomingOnInit(payload);
      }

      try {
        // A. Sync Typesense collections schema
        if (config.collections && Object.keys(config.collections).length > 0) {
          logger.info("Syncing Typesense collections schema...");
          const schemaManager = new SchemaManager(typesenseClient, {
            typesense: config.typesense,
            features: {
              embedding: config.embeddingConfig,
            },
            collections: config.collections,
          });
          await schemaManager.syncCollections();
        }

        // B. Sync RAG agents
        let agents: AgentConfig[] = [];
        if (typeof config.agents === 'function') {
          agents = await config.agents(payload);
        } else if (Array.isArray(config.agents)) {
          agents = config.agents;
        }

        if (agents && agents.length > 0) {
          logger.info(`Initializing ${agents.length} RAG agents...`);
          const agentManager = new AgentManager(typesenseClient, {
            agents: agents,
          });
          await agentManager.syncAgents();
        }
      } catch (error) {
        // Fail soft: Log error but don't crash Payload startup
        logger.error("Error initializing Typesense resources", error as Error);
      }
    };

    return payloadConfig;
  };
}

