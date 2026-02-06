/**
 * Setup utilities for Typesense Conversational RAG
 */

import type { Client } from "typesense";
import { logger } from "../../core/logging/logger";
import { RAGConfig } from "../../shared/index";
/**
 * Ensure conversation history collection exists
 *
 * @param client - Typesense client
 * @param collectionName - Name of the conversation history collection
 * @returns true if collection exists or was created successfully
 */
export async function ensureConversationCollection(
  client: Client,
  collectionName: string = "conversation_history",
): Promise<boolean> {
  try {
    // Check if collection exists
    await client.collections(collectionName).retrieve();
    logger.info("Conversation collection already exists", {
      collection: collectionName,
    });
    return true;
  } catch (error: unknown) {
    const typesenseError = error as { httpStatus?: number };
    if (typesenseError?.httpStatus === 404) {
      logger.info("Creating conversation collection", {
        collection: collectionName,
      });

      try {
        // Create conversation collection
        // Note: Typesense manages conversation schema automatically
        // We just need to ensure the collection can be created
        await client.collections().create({
          name: collectionName,
          fields: [
            { name: "conversation_id", type: "string" },
            { name: "model_id", type: "string" },
            { name: "timestamp", type: "int32" },
            { name: "role", type: "string" },
            { name: "message", type: "string" },
          ],
        });

        logger.info("Conversation collection created successfully", {
          collection: collectionName,
        });
        return true;
      } catch (createError) {
        logger.error(
          "Failed to create conversation collection",
          createError as Error,
          {
            collection: collectionName,
          },
        );
        return false;
      }
    }

    logger.error("Error checking conversation collection", error as Error, {
      collection: collectionName,
    });
    return false;
  }
}

/**
 * Get default RAG configuration values
 *
 * @returns Default RAG configuration
 */
export function getDefaultRAGConfig(): Required<Omit<RAGConfig, "agents">> {
  return {
    hybrid: {
      alpha: 0.9,
      rerankMatches: true,
      queryFields: "chunk_text,title",
    },
    hnsw: {
      efConstruction: 200,
      M: 16,
      ef: 100,
      maxConnections: 64,
      distanceMetric: "cosine",
    },
    advanced: {
      typoTokensThreshold: 1,
      numTypos: 2,
      prefix: true,
      dropTokensThreshold: 1,
      enableStemming: true,
    },
  };
}

/**
 * Merge user RAG config with defaults
 *
 * @param userConfig - User-provided RAG configuration
 * @returns Merged configuration with defaults
 */
export function mergeRAGConfigWithDefaults(userConfig?: RAGConfig): RAGConfig {
  const defaults = getDefaultRAGConfig();

  if (!userConfig) {
    return defaults;
  }

  return {
    hybrid: { ...defaults.hybrid, ...userConfig.hybrid },
    hnsw: { ...defaults.hnsw, ...userConfig.hnsw },
    advanced: { ...defaults.advanced, ...userConfig.advanced },
  };
}
