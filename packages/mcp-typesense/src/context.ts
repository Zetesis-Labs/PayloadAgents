/**
 * Internal runtime context passed to every tool invocation.
 *
 * Tools never read from process.env or module-level singletons. They receive
 * everything they need as a `ToolContext` argument — this is what makes the
 * package testable and reusable across multiple concurrent consumers.
 */

import type { Client as TypesenseClient } from 'typesense'
import type { CreateRerankerInput, Reranker } from './rerankers'
import type { ChunkCollectionConfig, FetchBooksParams, RawBookDoc, ResolvedRetrievalScope } from './types'

// ============================================================================
// TAXONOMY
// ============================================================================

export interface ResolvedTaxonomy {
  id: number | string
  name: string
  slug: string
  /** Normalized types array (may be empty). First entry is treated as primary. */
  types: string[]
  /** Breadcrumb string (e.g. "CPS → Personotecnia"). Falls back to name. */
  breadcrumb: string
  parentSlug: string | null
}

export interface TaxonomyEnriched {
  slug: string
  name: string
  type: string
  breadcrumb: string
}

export interface TaxonomyResolver {
  /** Resolve a list of slugs to enriched info, used for search hit enrichment. */
  resolveSlugs: (slugs: string[]) => Promise<TaxonomyEnriched[]>
  /** Get the full taxonomy map (slug → resolved). May return cached results. */
  getTaxonomyMap: () => Promise<Map<string, ResolvedTaxonomy>>
  /** Get all docs as an array, used by the `get_taxonomy_tree` tool. */
  getAll: () => Promise<ResolvedTaxonomy[]>
}

// ============================================================================
// COLLECTIONS REGISTRY
// ============================================================================

export interface CollectionRegistry {
  /** All configured collections. */
  all: ReadonlyArray<ChunkCollectionConfig>
  /** All chunk collections (currently == all; kept for forward-compat). */
  chunks: ReadonlyArray<ChunkCollectionConfig>
  /** Chunk collection names — useful for tool descriptions. */
  chunkNames: ReadonlyArray<string>
  /** Collections of kind "document". */
  documents: ReadonlyArray<ChunkCollectionConfig>
  /** Collections of kind "book". */
  books: ReadonlyArray<ChunkCollectionConfig>
  /** Resolve by chunk collection name. Returns undefined if unknown. */
  byChunkName: (name: string) => ChunkCollectionConfig | undefined
  /** Whether a given chunk collection name is known. */
  has: (name: string) => boolean
}

// ============================================================================
// CONTENT SOURCE
// ============================================================================

/**
 * Runtime interface for fetching parent documents beyond what's indexed in
 * Typesense. Currently only books are fetched this way (for chapter TOC).
 */
export interface ContentFetcher {
  fetchBooks: (params: FetchBooksParams) => Promise<RawBookDoc[]>
}

// ============================================================================
// TOOL CONTEXT (passed to every tool function)
// ============================================================================

export interface ToolContext {
  typesense: TypesenseClient
  collections: CollectionRegistry
  taxonomy: TaxonomyResolver
  /** Present only when ContentConfig was provided in the server config. */
  content: ContentFetcher | null
  /**
   * Resolve a reranker closure for a given (kind, model) pair. Null when
   * the consumer did not provide a reranker integration — tools should
   * treat null as "reranking disabled".
   */
  resolveReranker: ((input: CreateRerankerInput) => Reranker) | null
  /**
   * Resolve a profile's scope (filters + lente) by slug on demand, fetching it
   * server-side. Null when the consumer configured no resolver — handlers then
   * rely on header-provided `groupProfiles` (token route) alone.
   */
  resolveProfileScope: ((tenantSlug: string, profileSlug: string) => Promise<ResolvedRetrievalScope | null>) | null
}
