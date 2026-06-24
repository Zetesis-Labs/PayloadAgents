/**
 * MCP server — selects its search backend from `SEARCH_BACKEND` so it always
 * matches the indexer plugin active in `apps/server`:
 *
 *   SEARCH_BACKEND=typesense → @zetesis/mcp-typesense (default)
 *   SEARCH_BACKEND=pgvector  → @zetesis/mcp-pgvector
 *
 * Both apps read the same env var, so the read side (this MCP) and the write
 * side (the indexer plugin in apps/server) can never desync onto different
 * backends. All runtime (tools, resources, transport) lives in the packages;
 * this file is just env-var reading + collection topology.
 */

import { createPgvectorMcpServer } from '@zetesis/mcp-pgvector'
import {
  createMcpServer,
  DEFAULT_GUIDE,
  DEFAULT_INSTRUCTIONS,
} from '@zetesis/mcp-typesense'

const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL || 'http://localhost:3000'
const PORT = parseInt(process.env.MCP_PORT || '3001', 10)
const SEARCH_BACKEND =
  process.env.SEARCH_BACKEND === 'pgvector' ? 'pgvector' : 'typesense'

function createTypesenseBackend() {
  return createMcpServer({
    server: {
      name: 'mcp-typesense',
      version: '0.1.0',
      instructions: DEFAULT_INSTRUCTIONS,
    },
    transport: {
      port: PORT,
    },
    typesense: {
      host: process.env.TYPESENSE_HOST || '127.0.0.1',
      port: parseInt(process.env.TYPESENSE_PORT || '8108', 10),
      protocol: (process.env.TYPESENSE_PROTOCOL as 'http' | 'https') || 'http',
      apiKey: process.env.TYPESENSE_API_KEY || 'xyz',
    },
    embeddings: {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY || '',
      model: 'text-embedding-3-small',
      dimensions: 1536,
    },
    collections: [
      {
        key: 'posts',
        displayName: 'Posts (Chunks)',
        chunkCollection: 'posts_chunk',
        parentCollection: 'posts',
        chunkSearchFields: ['chunk_text', 'title'],
        chunkFacetFields: ['tenant', 'taxonomy_slugs', 'folder_slugs', 'parent_doc_id', 'headers'],
        kind: 'document',
      },
      {
        key: 'books',
        displayName: 'Books (Chunks)',
        chunkCollection: 'books_chunk',
        parentCollection: 'books',
        chunkSearchFields: ['chunk_text', 'title'],
        chunkFacetFields: ['tenant', 'taxonomy_slugs', 'folder_slugs', 'parent_doc_id', 'headers'],
        kind: 'book',
      },
    ],
    taxonomy: {
      source: { type: 'payload-rest', baseUrl: PAYLOAD_API_URL },
    },
    content: {
      source: { type: 'payload-rest', baseUrl: PAYLOAD_API_URL },
    },
    resources: {
      guide: DEFAULT_GUIDE,
    },
    auth: {
      type: 'header',
      headerName: 'x-tenant-slug',
    },
  })
}

function createPgvectorBackend() {
  return createPgvectorMcpServer({
    server: {
      name: 'mcp-pgvector',
      version: '0.1.0',
      instructions:
        'Thin pgvector search probe. Query by concept (no author/meta words). Scores are raw vector distances ' +
        '(lower = closer) — do not threshold. Filters map to SQL WHERE; array columns (taxonomy_slugs) use overlap.',
    },
    transport: { port: PORT },
    connectionString: process.env.DATABASE_URL || '',
    schema: process.env.MCP_PGVECTOR_SCHEMA || 'pgvector',
    embedding: {
      // MUST match the app-side indexer (same model + dimensions) or similarity
      // is garbage. The indexer routes through the LiteLLM `embeddings-dev` alias.
      baseUrl: process.env.LITELLM_PROXY_URL || 'http://litellm:4000/v1',
      apiKey: process.env.LITELLM_MASTER_KEY || '',
      model: process.env.MCP_PGVECTOR_EMBED_MODEL || 'embeddings-dev',
      dimensions: parseInt(process.env.MCP_PGVECTOR_EMBED_DIMS || '1536', 10),
      sendDimensions: process.env.MCP_PGVECTOR_SEND_DIMS !== 'false',
    },
    requireScope: process.env.MCP_PGVECTOR_REQUIRE_SCOPE === 'true',
    collections: [
      {
        name: 'posts_pgvector_chunk',
        displayName: 'Posts (pgvector)',
        distance: 'cosine',
        filterColumns: {
          parent_doc_id: 'text',
          slug: 'text',
          taxonomy_slugs: 'text[]',
        },
      },
    ],
  })
}

const mcp =
  SEARCH_BACKEND === 'pgvector' ? createPgvectorBackend() : createTypesenseBackend()

await mcp.listen()
console.error(`MCP server [${SEARCH_BACKEND}] running on http://0.0.0.0:${mcp.port}`)
