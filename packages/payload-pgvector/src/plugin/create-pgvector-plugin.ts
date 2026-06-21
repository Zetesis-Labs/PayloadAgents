import type { Config } from 'payload'
import { logger } from '../core/logging/logger'
import { deriveCollectionSchemas } from './derive-schema'
import type { PgvectorPluginConfig } from './types'

/**
 * Schema-sync plugin for pgvector. Mirrors payload-typesense's createTypesenseRAGPlugin
 * onInit step: on startup it ensures every configured table exists (CREATE
 * EXTENSION + CREATE TABLE + HNSW index) via adapter.ensureCollection.
 *
 * It does NOT register sync hooks — pair it with createIndexerPlugin (same
 * adapter) which handles document sync. The adapter generates embeddings at
 * upsert time via its EmbeddingProvider.
 *
 * @example
 * const adapter = createPgvectorAdapter({ connectionString, embedding: {...} })
 * const { plugin: indexerPlugin } = createIndexerPlugin({ adapter, features: { sync: { enabled: true } }, collections })
 * const pgvectorPlugin = createPgvectorPlugin({ adapter, collections, dimensions: 1536 })
 * // plugins: [indexerPlugin, pgvectorPlugin]
 */
export const createPgvectorPlugin = (config: PgvectorPluginConfig) => {
  return (payloadConfig: Config): Config => {
    const schemas = deriveCollectionSchemas(config)

    const incomingOnInit = payloadConfig.onInit
    payloadConfig.onInit = async payload => {
      if (incomingOnInit) {
        await incomingOnInit(payload)
      }

      try {
        logger.info(`Ensuring ${schemas.length} pgvector table(s)...`)
        for (const schema of schemas) {
          await config.adapter.ensureCollection(schema)
        }
      } catch (error) {
        logger.error('Error ensuring pgvector tables', error)
      }
    }

    return payloadConfig
  }
}
