/**
 * Standalone runner — wires createPgvectorMcpServer from env vars so you can run
 * it directly for A/B comparison:
 *
 *   DATABASE_URL=... LITELLM_PROXY_URL=... LITELLM_MASTER_KEY=... \
 *   node dist/standalone.mjs
 */
import { createPgvectorMcpServer } from './server'

const PORT = Number.parseInt(process.env.MCP_PGVECTOR_PORT || '3041', 10)

const mcp = createPgvectorMcpServer({
  server: {
    name: 'mcp-pgvector',
    version: '0.0.0',
    instructions:
      'Thin pgvector search probe. Query by concept (no author/meta words). Scores are raw vector distances ' +
      '(lower = closer) — do not threshold. Filters map to SQL WHERE; array columns (taxonomy_slugs) use overlap.'
  },
  transport: { port: PORT },
  connectionString: process.env.DATABASE_URL || '',
  schema: process.env.MCP_PGVECTOR_SCHEMA || 'pgvector',
  embedding: {
    baseUrl: process.env.LITELLM_PROXY_URL || 'http://litellm:4000/v1',
    apiKey: process.env.LITELLM_MASTER_KEY || '',
    model: process.env.MCP_PGVECTOR_EMBED_MODEL || 'embeddings-dev',
    dimensions: Number.parseInt(process.env.MCP_PGVECTOR_EMBED_DIMS || '1536', 10),
    // MUST match index-time: query and index embeddings have to use the same
    // model + dimensions or similarity is garbage. Defaults ON to match the
    // app-side indexer default (text-embedding-3-*); set MCP_PGVECTOR_SEND_DIMS=false
    // for models that reject the param (e.g. BGE-M3) — and keep the indexer in sync.
    sendDimensions: process.env.MCP_PGVECTOR_SEND_DIMS !== 'false'
  },
  // Off by default: unscoped requests are allowed (a token without taxonomies is
  // a deliberately broad reader). Set MCP_PGVECTOR_REQUIRE_SCOPE=true to deny
  // unscoped requests where every caller is expected to be tenant-scoped.
  requireScope: process.env.MCP_PGVECTOR_REQUIRE_SCOPE === 'true',
  collections: [
    {
      name: 'posts_pgvector_chunk',
      displayName: 'Posts (pgvector)',
      distance: 'cosine',
      filterColumns: {
        parent_doc_id: 'text',
        slug: 'text',
        taxonomy_slugs: 'text[]'
      }
    }
  ]
})

await mcp.listen()
console.error(`[mcp-pgvector] running on http://0.0.0.0:${mcp.port}/mcp`)
