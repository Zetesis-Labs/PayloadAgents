import { createIndexerPlugin } from '@zetesis/payload-indexer'
import { createTypesenseAdapter, createTypesenseRAGPlugin } from '@zetesis/payload-typesense'
import type { Config } from 'payload'
import { collections } from './collections'
import { typesenseConnection } from './config'

export { collections, getTableConfig } from './collections'

export const SEARCH_COLLECTIONS = Object.entries(collections).flatMap(([slug, tableConfigs]) =>
  (tableConfigs || []).filter(t => t.enabled && !t.tableName?.endsWith('_chunk')).map(t => t.tableName ?? slug)
)

const adapter = createTypesenseAdapter(typesenseConnection)

const { plugin: indexerPlugin } = createIndexerPlugin({
  adapter,
  features: {
    sync: {
      enabled: true,
      defaultColumns: ['title', '_syncStatus_typesense', '_syncStatus_pgvector', 'slug']
    }
  },
  collections
})

const typesenseRAGPlugin = createTypesenseRAGPlugin({
  typesense: typesenseConnection,
  collections,
  search: {
    enabled: true,
    defaults: {
      mode: 'semantic',
      perPage: 10,
      tables: SEARCH_COLLECTIONS
    }
  },
  hybrid: {
    alpha: 0.9,
    rerankMatches: true,
    queryFields: 'chunk_text,title'
  },
  hnsw: {
    efConstruction: 200,
    M: 16,
    ef: 100,
    maxConnections: 64,
    distanceMetric: 'cosine'
  },
  advanced: {
    typoTokensThreshold: 1,
    numTypos: 2,
    prefix: true,
    dropTokensThreshold: 1,
    enableStemming: true
  }
})

export const typesensePlugin = (config: Config): Config => {
  config = indexerPlugin(config)
  config = typesenseRAGPlugin(config)
  return config
}
