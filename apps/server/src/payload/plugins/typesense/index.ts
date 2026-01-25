import type { Config } from 'payload'
import { createIndexerPlugin } from '@nexo-labs/payload-indexer'
import { createTypesenseAdapter, createTypesenseRAGPlugin } from '@nexo-labs/payload-typesense'

// Configuration modules
import { typesenseConnection, embeddingConfig, SEARCH_COLLECTIONS } from './config'
import { collections } from './collections'
import { loadAgentsFromPayload } from './agents/agent-loader'
import { importHardcodedAgents } from './agents/importer'
import { callbacks } from './callbacks'

// Re-export constants
export { SEARCH_COLLECTIONS } from './config'
export { collections, getTableConfig } from './collections'

// ============================================================================
// PLUGIN COMPOSITION
// ============================================================================

// 1. Create adapter
const adapter = createTypesenseAdapter(typesenseConnection)

// 2. Create indexer plugin (sync hooks + embedding service for document indexing)
const { plugin: indexerPlugin } = createIndexerPlugin({
  adapter,
  features: {
    embedding: embeddingConfig,
    sync: { enabled: true },
  },
  collections,
})

// 3. Create Typesense RAG plugin (search + RAG + schema sync + agent sync)
const typesenseRAGPlugin = createTypesenseRAGPlugin({
  typesense: typesenseConnection,
  embeddingConfig,
  collections,
  collectionName: 'chat-sessions',
  search: {
    enabled: true,
    defaults: {
      mode: 'semantic',
      perPage: 10,
      tables: SEARCH_COLLECTIONS,
    },
  },
  agents: loadAgentsFromPayload,
  callbacks,
  hybrid: {
    alpha: 0.9,
    rerankMatches: true,
    queryFields: 'chunk_text,title',
  },
  hnsw: {
    efConstruction: 200,
    M: 16,
    ef: 100,
    maxConnections: 64,
    distanceMetric: 'cosine',
  },
  advanced: {
    typoTokensThreshold: 1,
    numTypos: 2,
    prefix: true,
    dropTokensThreshold: 1,
    enableStemming: true,
  },
})

// ============================================================================
// EXPORT
// ============================================================================

/**
 * Composed Typesense plugin for Payload CMS
 * Includes dynamic agent loading from PayloadCMS
 */
export const typesensePlugin = (config: Config): Config => {
  config = indexerPlugin(config)
  config = typesenseRAGPlugin(config)

  // Add hook to auto-import agents on initialization if DB is empty
  const existingOnInit = config.onInit
  config.onInit = async (payload) => {
    // Call existing onInit handlers first
    if (existingOnInit) {
      await existingOnInit(payload)
    }

    // Check if we need to seed the database
    const currentAgents = await loadAgentsFromPayload(payload)
    if (currentAgents.length === 0) {
      console.log('[typesense] No agents found in PayloadCMS, auto-importing hardcoded agents...')
      await importHardcodedAgents(payload)
    }
  }

  return config
}
