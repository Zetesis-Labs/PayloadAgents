/**
 * Payload CMS adapters for RAG endpoints
 *
 * These adapters convert the RAG API handlers (designed for standard Request/Response)
 * into Payload CMS handlers that work with Payload's endpoint system.
 */

import type { CollectionSlug, PayloadHandler } from "payload";
import type { TypesenseRAGPluginConfig } from "../../plugin/rag-types.js";
import { createChatPOSTHandler } from "./endpoints/chat/route.js";
import { defaultHandleNonStreamingResponse, defaultHandleStreamingResponse } from "./stream-handlers/index.js";
import { createSessionDELETEHandler, createSessionGETHandler, createSessionPATCHHandler } from "./endpoints/chat/session/route.js";
import { createSessionsListGETHandler } from "./endpoints/chat/sessions/route.js";
import { createChunksGETHandler } from "./endpoints/chunks/[id]/route.js";
import { createAgentsGETHandler } from "./endpoints/chat/agents/route.js";

/**
 * Creates Payload handlers for RAG endpoints
 *
 * @param config - RAG plugin configuration (composable, doesn't depend on ModularPluginConfig)
 */
export function createRAGPayloadHandlers<TSlug extends CollectionSlug>(
  config: TypesenseRAGPluginConfig<TSlug>,
): Array<{ path: string; method: 'connect' | 'delete' | 'get' | 'head' | 'options' | 'patch' | 'post' | 'put'; handler: PayloadHandler }> {
  const endpoints: Array<{ path: string; method: 'connect' | 'delete' | 'get' | 'head' | 'options' | 'patch' | 'post' | 'put'; handler: PayloadHandler }> = [];

  // Validate required config
  if (!config.agents || (Array.isArray(config.agents) && config.agents.length === 0) || !config.callbacks) {
    return endpoints;
  }

  const { agents, callbacks, typesense } = config;

  // Get valid collections from agents configuration
  const agentCollections = Array.isArray(agents)
    ? agents.flatMap(agent => agent.searchCollections)
    : [];
  const validCollections = Array.from(new Set(agentCollections));

  // Build RAG feature config for handlers that still need it
  const ragFeatureConfig = {
    enabled: true,
    agents,
    callbacks,
    hybrid: config.hybrid,
    hnsw: config.hnsw,
    advanced: config.advanced,
  };

  // Add endpoints
  endpoints.push({
    path: "/chat",
    method: "post" as const,
    handler: createChatPOSTHandler({
      collectionName: config.collectionName,
      checkPermissions: callbacks.checkPermissions,
      typesense,
      rag: ragFeatureConfig,
      getPayload: callbacks.getPayload,
      checkTokenLimit: callbacks.checkTokenLimit,
      getUserUsageStats: callbacks.getUserUsageStats,
      saveChatSession: callbacks.saveChatSession,
      handleStreamingResponse: defaultHandleStreamingResponse,
      handleNonStreamingResponse: defaultHandleNonStreamingResponse,
      createEmbeddingSpending: callbacks.createEmbeddingSpending,
      estimateTokensFromText: callbacks.estimateTokensFromText,
      embeddingConfig: config.embeddingConfig,
    }),
  });

  endpoints.push({
    path: "/chat/session",
    method: "get" as const,
    handler: createSessionGETHandler({
      getPayload: callbacks.getPayload,
      checkPermissions: callbacks.checkPermissions,
      sessionConfig: { collectionName: config.collectionName },
    }),
  });

  endpoints.push({
    path: "/chat/session",
    method: "delete" as const,
    handler: createSessionDELETEHandler({
      getPayload: callbacks.getPayload,
      checkPermissions: callbacks.checkPermissions,
      sessionConfig: { collectionName: config.collectionName },
    }),
  });

  endpoints.push({
    path: "/chat/session",
    method: "patch" as const,
    handler: createSessionPATCHHandler({
      getPayload: callbacks.getPayload,
      checkPermissions: callbacks.checkPermissions,
      sessionConfig: { collectionName: config.collectionName },
    }),
  });

  endpoints.push({
    path: "/chat/sessions",
    method: "get" as const,
    handler: createSessionsListGETHandler({
      getPayload: callbacks.getPayload,
      checkPermissions: callbacks.checkPermissions,
      sessionConfig: { collectionName: config.collectionName },
    }),
  });

  endpoints.push({
    path: "/chat/chunks/:id",
    method: "get" as const,
    handler: createChunksGETHandler({
      typesense,
      checkPermissions: callbacks.checkPermissions,
      validCollections,
    }),
  });

  endpoints.push({
    path: "/chat/agents",
    method: "get" as const,
    handler: createAgentsGETHandler({
      ragConfig: ragFeatureConfig,
      checkPermissions: callbacks.checkPermissions,
    }),
  });

  return endpoints;
}
