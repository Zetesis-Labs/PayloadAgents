/**
 * createPgvectorMcpServer: a deliberately thin MCP server over a pgvector index.
 *
 * Built for A/B comparison against @zetesis/mcp-typesense. It does NOT share a
 * search contract with it — semantics (score scale, total counts, no
 * hybrid/RRF, no facets) are pgvector-native on purpose. Three read tools:
 * search_collections, get_chunks_by_parent, get_chunks_by_ids.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  createPgvectorAdapter,
  type OpenAICompatibleEmbeddingConfig,
  type PgFieldSchema,
  type PgFieldType,
  type PgvectorAdapter,
  type PgvectorCollectionSchema
} from '@zetesis/payload-pgvector'
import { z } from 'zod'
import { parseScopeHeader, scopeDenied, scopeFilter } from './scope'

/** A searchable pgvector table exposed by the MCP. */
export interface PgvectorMcpCollection {
  /** Table name, e.g. `posts_pgvector_chunk`. */
  name: string
  displayName?: string
  /** Vector column. Defaults to `embedding`. */
  embeddingField?: string
  /** Distance metric (must match how the table was indexed). Defaults to `cosine`. */
  distance?: 'cosine' | 'l2' | 'ip'
  /** Primary key column. Defaults to `id`. */
  idField?: string
  /** Columns usable in `filters`, mapped to their SQL type (picks the operator). */
  filterColumns?: Record<string, PgFieldType>
}

export interface PgvectorMcpConfig {
  server: { name: string; version: string; instructions?: string }
  transport?: { port?: number; host?: string }
  /** Postgres connection string. */
  connectionString: string
  /** Required dedicated Postgres schema the tables live in (e.g. `pgvector`). Must match how they were indexed. */
  schema: string
  /** Embedding config (OpenAI-compatible, e.g. a LiteLLM gateway). */
  embedding: OpenAICompatibleEmbeddingConfig
  collections: PgvectorMcpCollection[]
  /**
   * Deny-by-default defense in depth: when true, a request that arrives WITHOUT
   * an `x-taxonomy-slugs` scope reads nothing instead of the whole corpus. The
   * Payload proxy already refuses unscoped tokens, so this guards the case where
   * the MCP is reached directly. Default false to keep the package generic (a
   * deployment where some callers are legitimately unscoped). Enable it whenever
   * every caller is expected to be tenant-scoped.
   */
  requireScope?: boolean
}

export interface PgvectorMcpHandle {
  readonly port: number
  listen(): Promise<void>
  close(): Promise<void>
}

const DEFAULT_PORT = 3041
const DEFAULT_HOST = '0.0.0.0'

const buildSchema = (c: PgvectorMcpCollection, dimensions: number): PgvectorCollectionSchema => {
  const embeddingField = c.embeddingField ?? 'embedding'
  const fields: PgFieldSchema[] = [
    { name: embeddingField, type: 'vector', dimensions },
    ...Object.entries(c.filterColumns ?? {}).map(([name, type]) => ({ name, type }))
  ]
  return {
    name: c.name,
    idField: c.idField ?? 'id',
    embeddingField,
    embedFrom: [],
    fields,
    hnsw: { distance: c.distance ?? 'cosine' }
  }
}

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] })

/**
 * Per-request taxonomy scope, read from the trusted `x-taxonomy-slugs` header
 * (injected by the Payload proxy / forwarded by LiteLLM). The MCP applies it as a
 * NON-overridable filter so a scoped caller cannot read outside it; `requireScope`
 * additionally denies unscoped requests (see scope.ts).
 */
const scopeStore = new AsyncLocalStorage<{ taxonomySlugs: string[]; requireScope: boolean }>()
const currentScope = (): { taxonomySlugs: string[]; requireScope: boolean } =>
  scopeStore.getStore() ?? { taxonomySlugs: [], requireScope: false }

/** Force the scope onto a filter object — the scope always wins over client input. */
function applyScope(filter: Record<string, unknown>): Record<string, unknown> {
  return scopeFilter(filter, currentScope().taxonomySlugs)
}

/** Deny-by-default: true when this request must read nothing (no scope, scope required). */
function denied(): boolean {
  const { taxonomySlugs, requireScope } = currentScope()
  return scopeDenied(taxonomySlugs, requireScope)
}

function registerTools(server: McpServer, adapter: PgvectorAdapter, collections: PgvectorMcpCollection[]): void {
  const names = collections.map(c => c.name)
  const nameList = names.join(', ')
  // Allowlist: a client may only name a configured collection. Without this the
  // SQL ident guard alone would let any table in the pgvector schema be queried.
  const known = new Set(names)

  server.registerTool(
    'search_collections',
    {
      description:
        `Semantic vector search over pgvector chunk tables (${nameList}). Embeds the query and orders by vector distance. ` +
        'Scores are raw pgvector distances (lower = closer); do NOT threshold on them. Filters map to SQL WHERE ' +
        '(array columns like taxonomy_slugs use overlap). No hybrid/lexical mode, no facets — this is a thin pgvector probe.',
      inputSchema: {
        query: z.string().describe('Concept query (will be embedded). Keep it to the concept, no author/meta words.'),
        collection: z.string().optional().describe(`Single table to search. Defaults to all: ${nameList}`),
        filters: z
          .record(z.union([z.string(), z.array(z.string())]))
          .optional()
          .describe('SQL filters, e.g. { "taxonomy_slugs": ["bastos"] } (array=overlap) or { "parent_doc_id": "1" }.'),
        limit: z.number().int().positive().max(100).optional().describe('Max hits (default 10).')
      }
    },
    async input => {
      if (denied()) return text({ hits: [], total: 0 })
      if (input.collection && !known.has(input.collection)) {
        return text({ error: `Unknown collection: ${input.collection}. Known: ${nameList}`, hits: [], total: 0 })
      }
      const targets = input.collection ? [input.collection] : names
      const limit = input.limit ?? 10
      // Scope wins over client-supplied taxonomy_slugs — cannot be widened.
      const filter = applyScope({ ...(input.filters ?? {}) })
      const hits: Array<{ collection: string; id: string; score: number; document: Record<string, unknown> }> = []
      for (const name of targets) {
        const results = await adapter.searchByText(name, input.query, { limit, filter })
        for (const r of results) hits.push({ collection: name, id: r.id, score: r.score, document: r.document })
      }
      hits.sort((a, b) => a.score - b.score)
      return text({ hits: hits.slice(0, limit), total: hits.length })
    }
  )

  server.registerTool(
    'get_chunks_by_parent',
    {
      description:
        'Fetch all chunks of a parent document, ordered by chunk_index. Use to read a full doc after search.',
      inputSchema: {
        collection: z.string().describe(`Chunk table: ${nameList}`),
        parent_doc_id: z.string().describe('Parent document id')
      }
    },
    async input => {
      if (denied()) return text({ chunks: [], total: 0 })
      if (!known.has(input.collection)) {
        return text({ error: `Unknown collection: ${input.collection}. Known: ${nameList}`, chunks: [], total: 0 })
      }
      // Order by chunk_index in SQL + a high explicit cap, so a large document
      // returns its chunks in order and we can flag truncation instead of silently
      // dropping the middle (the default 250 with no ORDER BY did exactly that).
      const CAP = 5000
      const rows = await adapter.searchDocumentsByFilter<Record<string, unknown>>(
        input.collection,
        applyScope({ parent_doc_id: input.parent_doc_id }),
        { orderBy: 'chunk_index', limit: CAP }
      )
      return text({ chunks: rows, total: rows.length, truncated: rows.length >= CAP })
    }
  )

  server.registerTool(
    'get_chunks_by_ids',
    {
      description:
        'Fetch specific chunks by their ids. Use to read full content of chunks found via search_collections.',
      inputSchema: {
        collection: z.string().describe(`Chunk table: ${nameList}`),
        ids: z.array(z.string()).min(1).describe('Chunk ids to fetch')
      }
    },
    async input => {
      if (denied()) return text({ chunks: [], total: 0 })
      if (!known.has(input.collection)) {
        return text({ error: `Unknown collection: ${input.collection}. Known: ${nameList}`, chunks: [], total: 0 })
      }
      // Cap at the number of ids requested so we never silently drop any.
      const rows = await adapter.searchDocumentsByFilter<Record<string, unknown>>(
        input.collection,
        applyScope({ id: input.ids }),
        { limit: input.ids.length }
      )
      return text({ chunks: rows, total: rows.length })
    }
  )
}

export function createPgvectorMcpServer(config: PgvectorMcpConfig): PgvectorMcpHandle {
  const adapter = createPgvectorAdapter({
    connectionString: config.connectionString,
    schema: config.schema,
    embedding: config.embedding
  })
  // Register metadata (no DDL) so filters + vectorSearch resolve correctly.
  for (const c of config.collections) {
    adapter.registerCollection(buildSchema(c, config.embedding.dimensions))
  }

  const sessions = new Map<string, StreamableHTTPServerTransport>()
  const port = config.transport?.port ?? DEFAULT_PORT
  const host = config.transport?.host ?? DEFAULT_HOST
  const requireScope = config.requireScope ?? false

  async function createSession(): Promise<StreamableHTTPServerTransport> {
    const server = new McpServer(
      { name: config.server.name, version: config.server.version },
      { instructions: config.server.instructions }
    )
    registerTools(server, adapter, config.collections)

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: id => sessions.set(id, transport),
      onsessionclosed: id => sessions.delete(id)
    })
    await server.connect(transport)
    return transport
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`)
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }
    if (url.pathname !== '/mcp') {
      res.writeHead(404)
      res.end('Not Found')
      return
    }

    // Trusted scope from the header, applied to every tool call this request makes.
    const taxonomySlugs = parseScopeHeader(req.headers['x-taxonomy-slugs'])
    const scope = { taxonomySlugs, requireScope }

    const sessionId = req.headers['mcp-session-id'] as string | undefined
    if (sessionId) {
      const transport = sessions.get(sessionId)
      if (!transport) {
        res
          .writeHead(404)
          .end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null }))
        return
      }
      await scopeStore.run(scope, () => transport.handleRequest(req, res))
      return
    }
    const transport = await createSession()
    await scopeStore.run(scope, () => transport.handleRequest(req, res))
  }

  let httpServer: HttpServer | null = null
  let resolvedPort = port

  return {
    get port() {
      return resolvedPort
    },
    async listen() {
      if (httpServer) return
      const server = createServer((req, res) => {
        handleRequest(req, res).catch(err => {
          console.error('[mcp-pgvector] Unhandled request error:', err)
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null }))
          }
        })
      })
      httpServer = server
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, host, () => {
          const addr = server.address()
          if (addr && typeof addr === 'object') resolvedPort = addr.port
          server.removeListener('error', reject)
          resolve()
        })
      })
    },
    async close() {
      const server = httpServer
      if (!server) return
      await new Promise<void>((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()))
      })
      httpServer = null
      sessions.clear()
      await adapter.close()
    }
  }
}
