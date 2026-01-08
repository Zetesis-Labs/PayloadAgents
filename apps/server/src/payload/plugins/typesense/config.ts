/**
 * Shared Typesense configuration
 * Used by both the plugin and the sync endpoint
 */

import type { TypesenseConnectionConfig, TypesenseFieldMapping } from '@nexo-labs/payload-typesense'
import type { IndexableCollectionConfig } from '@nexo-labs/payload-indexer'
import { transformTenant } from './transforms'

export const SEARCH_COLLECTIONS = ['pages']

// Typesense connection configuration
export const typesenseConnection: TypesenseConnectionConfig = {
    apiKey: process.env.TYPESENSE_API_KEY || 'xyz',
    nodes: [
        {
            host: process.env.TYPESENSE_HOST || 'localhost',
            port: parseInt(process.env.TYPESENSE_PORT || '8108'),
            protocol: (process.env.TYPESENSE_PROTOCOL as 'http' | 'https') || 'http',
        },
    ],
}

// Collection configurations for indexing
export const collections: IndexableCollectionConfig<TypesenseFieldMapping> = {
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

// Get table config for a specific collection
export const getTableConfig = (collectionSlug: string) => {
    const configs = collections[collectionSlug]
    if (!configs || configs.length === 0) return null
    return configs[0]
}
