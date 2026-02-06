/**
 * Factory function for creating a TypesenseAdapter
 */

import { Client } from "typesense";
import type { TypesenseConnectionConfig } from "../shared/types/plugin-types";
import { TypesenseAdapter } from "./typesense-adapter";

/**
 * Creates a TypesenseAdapter instance with the provided configuration
 *
 * @param config - Typesense connection configuration
 * @returns A configured TypesenseAdapter instance
 *
 * @example
 * ```typescript
 * import { createTypesenseAdapter } from '@nexo-labs/payload-typesense';
 *
 * const adapter = createTypesenseAdapter({
 *   apiKey: process.env.TYPESENSE_API_KEY!,
 *   nodes: [{
 *     host: 'localhost',
 *     port: 8108,
 *     protocol: 'http'
 *   }]
 * });
 * ```
 */
export function createTypesenseAdapter(
  config: TypesenseConnectionConfig,
): TypesenseAdapter {
  const client = new Client({
    apiKey: config.apiKey,
    nodes: config.nodes,
    connectionTimeoutSeconds: config.connectionTimeoutSeconds ?? 10,
    retryIntervalSeconds: config.retryIntervalSeconds,
    numRetries: config.numRetries,
  });

  return new TypesenseAdapter(client);
}

/**
 * Creates a TypesenseAdapter from an existing Typesense Client
 * Useful when you already have a configured client instance
 *
 * @param client - Existing Typesense Client instance
 * @returns A TypesenseAdapter instance wrapping the provided client
 */
export function createTypesenseAdapterFromClient(
  client: Client,
): TypesenseAdapter {
  return new TypesenseAdapter(client);
}
