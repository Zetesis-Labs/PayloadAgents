// Import from payload-indexer (core plugin factory)
import { createIndexerPlugin } from '@nexo-labs/payload-indexer'

// Import from payload-typesense (Typesense-specific plugin)
import {
    createTypesenseAdapter,
    createTypesenseRAGPlugin,
} from '@nexo-labs/payload-typesense'

import { Config } from 'payload'

// Import shared configuration
import { typesenseConnection, collections, SEARCH_COLLECTIONS } from './config'

// Re-export for external use
export { SEARCH_COLLECTIONS, typesenseConnection, collections, getTableConfig } from './config'

// ============================================================================
// PLUGIN COMPOSITION
// ============================================================================

// 1. Create adapter
const adapter = createTypesenseAdapter(typesenseConnection)

// 2. Create indexer plugin (sync hooks for document indexing)
const { plugin: indexerPlugin } = createIndexerPlugin({
    adapter,
    features: {
        sync: { enabled: true },
    },
    collections,
})

// 3. Create Typesense RAG plugin (search endpoints + schema sync)
const typesenseRAGPlugin = createTypesenseRAGPlugin({
    typesense: typesenseConnection,
    collectionName: 'chat-sessions',
    collections,
    search: {
        enabled: true,
        defaults: {
            mode: 'keyword',
            perPage: 10,
            tables: SEARCH_COLLECTIONS,
        },
    },
    // No RAG agents for now - just search
    agents: [],
})

// 4. Export composed plugin
// Using generic to avoid version conflicts between workspace packages
export const typesensePlugin = (config: Config): Config => {
  config = indexerPlugin(config)
  config = typesenseRAGPlugin(config)
  return config
}
