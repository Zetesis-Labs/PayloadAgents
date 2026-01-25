/**
 * Shared Typesense configuration
 * Used by both the plugin and the sync endpoint
 */

import type { TypesenseConnectionConfig } from '@nexo-labs/payload-typesense'
import type { EmbeddingProviderConfig } from '@nexo-labs/payload-indexer'

// ============================================================================
// CONSTANTS
// ============================================================================

export const SEARCH_COLLECTIONS = ['pages_chunk']

// ============================================================================
// TYPESENSE CONNECTION
// ============================================================================

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

// ============================================================================
// EMBEDDING CONFIGURATION
// ============================================================================

export const embeddingConfig: EmbeddingProviderConfig = {
    type: 'gemini',
    model: 'text-embedding-004',
    dimensions: 768,
    apiKey: (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) as string,
}
