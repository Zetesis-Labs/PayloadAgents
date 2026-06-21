/**
 * @zetesis/mcp-typesense
 *
 * Composable MCP (Model Context Protocol) server that exposes Typesense-backed
 * content with taxonomy enrichment, LLM sampling synthesis tools, and
 * pluggable auth.
 *
 * Semantic and hybrid search rely on Typesense's auto-embed: the package
 * sends queries as text, Typesense embeds them server-side using the model
 * declared on the chunk collection's schema, and returns vector matches.
 * The package never calls an embedding API itself — there is no embedding
 * provider config to set.
 *
 * ## Quickstart
 *
 * ```ts
 * import { createMcpServer } from '@zetesis/mcp-typesense'
 *
 * const mcp = createMcpServer({
 *   server: { name: 'my-search', version: '1.0.0' },
 *   transport: { port: 3001 },
 *   typesense: {
 *     host: '127.0.0.1',
 *     port: 8108,
 *     protocol: 'http',
 *     apiKey: 'xyz',
 *   },
 *   collections: [
 *     {
 *       key: 'posts',
 *       displayName: 'Posts',
 *       chunkCollection: 'posts_chunk',
 *       parentCollection: 'posts',
 *       chunkSearchFields: ['chunk_text', 'title'],
 *       chunkFacetFields: ['tenant', 'taxonomy_slugs'],
 *       kind: 'document',
 *     },
 *   ],
 *   taxonomy: {
 *     source: { type: 'payload-rest', baseUrl: 'http://localhost:3000' },
 *   },
 * })
 *
 * await mcp.listen()
 * console.log(`MCP server listening on :${mcp.port}`)
 * ```
 *
 * The chunk collection (`posts_chunk` here) must declare `embed.from` +
 * `embed.model_config` on its schema. Use `@zetesis/payload-typesense`'s
 * `embedding.autoEmbed` block to provision it.
 */

// Defaults — exposed so consumers can extend them
export { DEFAULT_GUIDE, DEFAULT_INSTRUCTIONS } from './defaults'
// Rerankers — closure-based two-stage retrieval primitives
export {
  type CreateRerankerInput,
  createDeepInfraReranker,
  createRerankerFactory,
  type DeepInfraRerankerConfig,
  noopReranker,
  type RankedCandidate,
  type Reranker,
  type RerankerCandidate,
  type RerankerFactoryConfig
} from './rerankers'
// Main factory
export { createMcpServer } from './server'
// Public config types
export type {
  // Collections
  ChunkCollectionConfig,
  ChunkCollectionKind,
  // Content
  ContentConfig,
  ContentSource,
  // Features
  FeaturesConfig,
  FetchBooksParams,
  // Auth
  McpAuthContext,
  McpAuthStrategy,
  // Core
  McpServerConfig,
  McpServerHandle,
  RawBookDoc,
  // Taxonomy
  RawTaxonomyDoc,
  ResolvedRetrievalScope,
  ResourcesConfig,
  // Retrieval profiles
  RetrievalProfileResolver,
  ServerInfoConfig,
  TaxonomyConfig,
  TaxonomySource,
  ToolNameOverrides,
  TransportConfig,
  TypesenseConnectionConfig
} from './types'
