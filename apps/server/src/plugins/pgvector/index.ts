import { createIndexerPlugin } from '@zetesis/payload-indexer'
import { createPgvectorAdapter, createPgvectorPlugin } from '@zetesis/payload-pgvector'
import type { Config } from 'payload'
import { pgvectorCollections } from './collections'
import { pgvectorConnectionString, pgvectorEmbedding, pgvectorSchema } from './config'

export { pgvectorCollections } from './collections'

// Shared adapter instance: createIndexerPlugin uses it for document sync (hooks),
// createPgvectorPlugin uses it for schema sync (onInit ensureCollection).
const adapter = createPgvectorAdapter({
  connectionString: pgvectorConnectionString,
  embedding: pgvectorEmbedding,
  schema: pgvectorSchema
})

const { plugin: indexerPlugin } = createIndexerPlugin({
  adapter,
  features: {
    sync: {
      enabled: true,
      // `adapter.name` ('pgvector') namespaces the sync-status field/endpoints,
      // so it coexists with the Typesense indexer on the same `posts` collection.
      defaultColumns: ['title', '_syncStatus_pgvector', 'slug']
    }
  },
  collections: pgvectorCollections
})

const schemaPlugin = createPgvectorPlugin({
  adapter,
  collections: pgvectorCollections,
  dimensions: pgvectorEmbedding.dimensions
})

export const pgvectorPlugin = (config: Config): Config => {
  config = indexerPlugin(config)
  config = schemaPlugin(config)
  return config
}
