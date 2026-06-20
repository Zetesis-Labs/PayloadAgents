/**
 * Public configuration types for `@zetesis/mcp-typesense`.
 *
 * The package ships a single factory, `createMcpServer(config)`, whose config
 * surface is defined here. The design intentionally uses discriminated unions
 * with a single variant in places (e.g. `auth`, `taxonomy.source`) so that
 * future phases can add variants additively without breaking existing
 * consumers. See README.md "Evolution" section.
 */

import type { CreateRerankerInput, Reranker } from './rerankers'

// ============================================================================
// TYPESENSE
// ============================================================================

export interface TypesenseConnectionConfig {
  host: string
  port: number
  protocol: 'http' | 'https'
  apiKey: string
  /** Connection timeout in seconds. Default: 10. */
  connectionTimeoutSeconds?: number
}

// ============================================================================
// COLLECTIONS
// ============================================================================

/**
 * Semantic "kind" of a chunk collection. Drives which content-specific tools
 * apply to it:
 *
 * - `document`: single-doc content (posts, essays, transcripts). Targeted by
 *   `get_post_summaries`.
 * - `book`: multi-chapter works. Targeted by `get_book_toc`.
 * - `other`: generic. Only reachable via `search_collections` and the
 *   `get_chunks_*` read tools.
 */
export type ChunkCollectionKind = 'document' | 'book' | 'other'

export interface ChunkCollectionConfig {
  /** Logical key used for tool descriptions and error messages (e.g. "posts"). */
  key: string
  /** Human-readable display name (e.g. "Posts"). */
  displayName: string
  /** Typesense collection name for chunks (e.g. "posts_chunk"). */
  chunkCollection: string
  /** Typesense collection name for parent docs (e.g. "posts"), if any. */
  parentCollection?: string
  /** Fields queried by lexical search. First entry is used as `query_by` fallback. */
  chunkSearchFields: string[]
  /** Facet fields available for filtering. */
  chunkFacetFields: string[]
  /** Semantic kind — determines which content-specific tools apply. */
  kind: ChunkCollectionKind
}

// ============================================================================
// TAXONOMY
// ============================================================================

/**
 * Raw taxonomy document returned by a taxonomy source. The package normalizes
 * all sources into this shape before building the in-memory index.
 */
export interface RawTaxonomyDoc {
  id: number | string
  name: string
  slug: string
  /** Types this node belongs to (e.g. ['author'], ['topic']). Empty = unknown. */
  types?: string[]
  /** Parent slug, if this node has a parent. */
  parentSlug?: string | null
  /** Pre-computed breadcrumb string (e.g. "CPS → Personotecnia"). */
  breadcrumb?: string
}

/**
 * Pluggable taxonomy source. In Phase A we ship two variants:
 * - `payload-rest`: fetches from Payload CMS REST API.
 * - `custom`: caller provides their own async fetcher.
 */
export type TaxonomySource =
  | {
      type: 'payload-rest'
      /** Base URL to Payload, without trailing slash. */
      baseUrl: string
      /** Collection slug (default: "taxonomy"). */
      collectionSlug?: string
    }
  | {
      type: 'custom'
      fetch: () => Promise<RawTaxonomyDoc[]>
    }

export interface TaxonomyConfig {
  source: TaxonomySource
  /** Cache TTL in milliseconds. Default: 5 minutes. */
  cacheTtlMs?: number
}

// ============================================================================
// CONTENT (for tools that fetch parent docs — books with chapters, etc.)
// ============================================================================

/**
 * Raw book document returned by a content source. The `get_book_toc` tool
 * parses `chapters[].content` (markdown) to build a hierarchical TOC.
 */
export interface RawBookDoc {
  id: number | string
  title: string
  slug: string
  /** Category/taxonomy references. Can be objects with slug or bare IDs. */
  categories?: Array<{ id: number | string; slug?: string }> | Array<number | string>
  /** Chapters with markdown content used for heading extraction. */
  chapters?: Array<{ title?: string | null; content?: string }>
}

export interface FetchBooksParams {
  id?: number | string
  slug?: string
  tenantSlug?: string | null
}

/**
 * Content source for tools that fetch parent documents beyond what's indexed
 * in Typesense (e.g. book chapter content).
 */
export type ContentSource =
  | {
      type: 'payload-rest'
      /** Base URL to Payload, without trailing slash. */
      baseUrl: string
      /** Collection slugs (defaults: "books"). */
      collections?: {
        books?: string
      }
    }
  | {
      type: 'custom'
      fetchBooks?: (params: FetchBooksParams) => Promise<RawBookDoc[]>
    }

export interface ContentConfig {
  source: ContentSource
}

// ============================================================================
// AUTH
// ============================================================================

/**
 * Auth strategy. Phase A ships a single variant (`header`); the discriminated
 * union is designed so that `callback` and `none` can be added additively in
 * Phase D without breaking existing consumers.
 */
export type McpAuthStrategy = {
  type: 'header'
  /** Header name to read the tenant slug from. Default: "x-tenant-slug". */
  headerName?: string
}

/**
 * Resolved auth context passed to every tool invocation. Fields are optional
 * so consumers can enrich the context selectively.
 */
export interface McpAuthContext {
  /** Tenant slug — if present, searches are auto-scoped by `tenant`. */
  tenantSlug?: string
  /** Taxonomy slugs — if present, searches are auto-scoped by `taxonomy_slugs`. */
  taxonomySlugs?: string[]
  /**
   * Folder slugs — if present, searches are auto-scoped by `folder_slugs`.
   * The slug chain mirrors the folder breadcrumb (root → leaf), so
   * filtering by any ancestor's slug selects everything below it.
   */
  folderSlugs?: string[]
  /**
   * Retrieval params from the caller's attached Search Profile. When any
   * field is present the search tool routes through two-stage retrieval:
   * Typesense fetches `inputK` candidates with `hybridAlpha`, then the
   * reranker reorders to `topK`. Missing fields fall back to tool defaults.
   */
  retrieval?: {
    rerankerKind?: string
    rerankerModel?: string
    inputK?: number
    topK?: number
    hybridAlpha?: number
    /**
     * Mustache template applied to the query before embedding. Variables:
     * `{{query}}`, `{{tenant_slug}}`. Unknown variables expand to empty
     * string. When unset, the raw user query is passed through unchanged.
     */
    rewriteTemplate?: string
    /**
     * Learned head weights for dot-product re-ranking. When present the
     * search tool fetches embeddings from Typesense (skips exclude_fields)
     * and applies `score = w·e + b` to each candidate before the reranker.
     * w has the same dimensionality as the chunk embedding (BGE-M3 → 1024).
     */
    learnedHead?: { w: number[]; b: number }
  }
  /**
   * Retrieval profiles available to the caller's token. The agent selects one
   * per query via the search tool's `retrieval_profile` argument; the proxy
   * resolves the chosen one into the `retrieval` fields above. This catalog is
   * metadata only (no weights) and powers the `list_retrieval_profiles` tool so
   * the agent can discover and reason about its options.
   */
  availableProfiles?: Array<{ slug: string; name: string; description: string }>
  /**
   * Fully-resolved scope+retrieval config (filters + lente weights) for every
   * profile referenced in THIS request, keyed by slug. Sent by the proxy only
   * when a request uses more than one profile (e.g. `compare_perspectives` with
   * a profile per group), so the tool can apply each group's own lente/filters.
   * Scoped to the request's used profiles to keep the header small.
   */
  groupProfiles?: Record<string, ResolvedRetrievalScope>
  /** User identifier, for logging/auditing. */
  userId?: string
  /** Arbitrary metadata the auth strategy wants to propagate. */
  metadata?: Record<string, unknown>
}

/** The retrieval-affecting slice of an auth context: scope filters + retrieval params. */
export interface ResolvedRetrievalScope {
  taxonomySlugs?: string[]
  folderSlugs?: string[]
  retrieval?: McpAuthContext['retrieval']
}

// ============================================================================
// SERVER / TRANSPORT / RESOURCES
// ============================================================================

export interface ServerInfoConfig {
  /** MCP server name (shown in `tools/list` and initialization). */
  name: string
  /** Server version. */
  version: string
  /**
   * Instructions injected into the client's system prompt via `initialize`.
   * Keep tight — these are paid on every turn. Tool-specific guidance belongs
   * in tool descriptions. If omitted, a generic default is used.
   */
  instructions?: string
}

export interface TransportConfig {
  /** HTTP port to listen on. Default: 3001. */
  port?: number
  /** Host to bind to. Default: "0.0.0.0". */
  host?: string
}

export interface ResourcesConfig {
  /**
   * Markdown content for `guide://search`. If a string, served as-is; if a
   * function, called lazily. If omitted, a generic default is used.
   */
  guide?: string | (() => Promise<string>)
}

export interface FeaturesConfig {
  /**
   * Register LLM-sampling synthesis tools (`summarize_document`,
   * `extract_claims`, `synthesize_comparison`). Default: true.
   */
  llmSampling?: boolean
}

/**
 * Tool name overrides. Keys are the package's logical tool IDs; values are
 * the public names registered with the MCP server. Useful when embedding
 * this package in a consumer that needs different naming (e.g. rename
 * `get_post_summaries` to `get_content_summaries`).
 */
export interface ToolNameOverrides {
  getTaxonomyTree?: string
  getFilterCriteria?: string
  listRetrievalProfiles?: string
  getPostSummaries?: string
  getBookToc?: string
  searchCollections?: string
  comparePerspectives?: string
  getChunksByIds?: string
  getChunksByParent?: string
  summarizeDocument?: string
  extractClaims?: string
  synthesizeComparison?: string
}

// ============================================================================
// FULL CONFIG
// ============================================================================

export interface McpServerConfig {
  server: ServerInfoConfig
  transport?: TransportConfig
  typesense: TypesenseConnectionConfig
  collections: ChunkCollectionConfig[]
  taxonomy: TaxonomyConfig
  /** Required to enable `get_book_toc`. If absent, that tool is skipped. */
  content?: ContentConfig
  auth?: McpAuthStrategy
  /**
   * Optional reranker factory. When provided, search results are reordered
   * by the closure the factory returns for the per-request (kind, model)
   * pair. Without this config, search ignores `retrieval.rerankerKind`.
   * Typically built via `createRerankerFactory({ deepInfra: { apiKey } })`.
   */
  reranker?: {
    factory: (input: CreateRerankerInput) => Reranker
  }
  resources?: ResourcesConfig
  features?: FeaturesConfig
  toolNames?: ToolNameOverrides
}

// ============================================================================
// SERVER HANDLE
// ============================================================================

export interface McpServerHandle {
  /** Start listening for HTTP requests. Resolves once the socket is bound. */
  listen: () => Promise<void>
  /** Stop the HTTP server gracefully. */
  close: () => Promise<void>
  /** Resolved listen port (useful when port was 0). */
  readonly port: number
}
