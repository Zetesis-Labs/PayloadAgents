/**
 * Typesense connection configuration and hardcoded collection definitions
 */

// ============================================================================
// CONNECTION
// ============================================================================

export const typesenseConfig = {
  apiKey: process.env.TYPESENSE_API_KEY || 'xyz',
  nodes: [
    {
      host: process.env.TYPESENSE_HOST || '127.0.0.1',
      port: parseInt(process.env.TYPESENSE_PORT || '8108', 10),
      protocol: (process.env.TYPESENSE_PROTOCOL as 'http' | 'https') || 'http'
    }
  ],
  connectionTimeoutSeconds: 5
}

// ============================================================================
// EMBEDDING
// ============================================================================

export const embeddingConfig = {
  model: 'text-embedding-3-small' as const,
  dimensions: 1536,
  apiKey: process.env.OPENAI_API_KEY || ''
}

// ============================================================================
// COLLECTIONS
// ============================================================================

export interface CollectionDef {
  /** Typesense collection name */
  name: string
  /** Human-readable display name */
  displayName: string
  /** Whether this is a chunk collection */
  isChunk: boolean
  /** The corresponding chunk collection (for parent collections) */
  chunkCollection?: string
  /** The corresponding parent collection (for chunk collections) */
  parentCollection?: string
  /** Fields that support faceting/filtering */
  facetFields: string[]
  /** Fields used for text search */
  searchFields: string[]
}

export const COLLECTIONS: Record<string, CollectionDef> = {
  posts: {
    name: 'posts',
    displayName: 'Posts',
    isChunk: false,
    chunkCollection: 'posts_chunk',
    facetFields: ['tenant', 'taxonomy_slugs'],
    searchFields: ['title', 'content']
  },
  posts_chunk: {
    name: 'posts_chunk',
    displayName: 'Posts (Chunks)',
    isChunk: true,
    parentCollection: 'posts',
    facetFields: ['tenant', 'taxonomy_slugs', 'parent_doc_id', 'headers'],
    searchFields: ['chunk_text', 'title']
  },
  books: {
    name: 'books',
    displayName: 'Books',
    isChunk: false,
    chunkCollection: 'books_chunk',
    facetFields: ['tenant', 'taxonomy_slugs'],
    searchFields: ['title', 'content']
  },
  books_chunk: {
    name: 'books_chunk',
    displayName: 'Books (Chunks)',
    isChunk: true,
    parentCollection: 'books',
    facetFields: ['tenant', 'taxonomy_slugs', 'parent_doc_id', 'headers'],
    searchFields: ['chunk_text', 'title']
  }
}

/** Only chunk collections */
export const CHUNK_COLLECTIONS = Object.values(COLLECTIONS).filter(c => c.isChunk)

/** Only parent (non-chunk) collections */
export const PARENT_COLLECTIONS = Object.values(COLLECTIONS).filter(c => !c.isChunk)
