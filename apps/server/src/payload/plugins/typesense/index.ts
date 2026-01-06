// Import from payload-indexer (core plugin factory)
import {
    createIndexerPlugin,
    IndexableCollectionConfig,
} from '@nexo-labs/payload-indexer'

// Import from payload-typesense (Typesense-specific plugin)
import {
    createTypesenseAdapter,
    createTypesenseRAGPlugin,
    type TypesenseConnectionConfig,
    type TypesenseFieldMapping,
} from '@nexo-labs/payload-typesense'

import { transformTenant } from './transforms'
import { Config } from 'payload'

// ============================================================================
// CONSTANTS
// ============================================================================

export const SEARCH_COLLECTIONS = ['pages']

// ============================================================================
// CONFIGURATION
// ============================================================================

// Typesense connection
const typesenseConnection: TypesenseConnectionConfig = {
    apiKey: process.env.TYPESENSE_API_KEY || 'xyz',
    nodes: [
        {
            host: process.env.TYPESENSE_HOST || 'localhost',
            port: parseInt(process.env.TYPESENSE_PORT || '8108'),
            protocol: (process.env.TYPESENSE_PROTOCOL as 'http' | 'https') || 'http',
        },
    ],
}

// Collection configurations
const collections: IndexableCollectionConfig<TypesenseFieldMapping> = {
    pages: [
        {
            enabled: true,
            tableName: 'pages',
            displayName: 'Pages',
            fields: [
                { name: 'title', type: 'string' },
                { name: 'slug', type: 'string', index: true },
                { name: 'tenant', type: 'string', facet: true, optional: true, transform: transformTenant },
            ],
        },
    ],
}

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
