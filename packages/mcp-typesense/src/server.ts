/**
 * createMcpServer factory: the public entry point of the package.
 *
 * Given a `McpServerConfig`, returns a handle with `.listen()` and `.close()`
 * that runs an HTTP server speaking the MCP Streamable HTTP transport. Each
 * new session (a POST without `mcp-session-id`) creates a fresh `McpServer`
 * instance; auth is re-resolved from request headers on every call (not
 * frozen at session init) so live changes to the caller's SearchProfile
 * apply on the next request without rebuilding the session.
 */

import { randomUUID } from 'node:crypto'
import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { authStore } from './auth/context'
import { resolveAuth } from './auth/resolve'
import { createContentFetcher } from './content/payload-rest'
import type { CollectionRegistry, ContentFetcher, ToolContext } from './context'
import { DEFAULT_INSTRUCTIONS } from './defaults'
import { registerResources } from './resources'
import { createProfileScopeResolver } from './retrieval-profile/resolver'
import { createTaxonomyResolver } from './taxonomy/resolver'
import { registerTools } from './tools'
import type { ChunkCollectionConfig, McpServerConfig, McpServerHandle } from './types'
import { createTypesenseClient } from './typesense/client'

const DEFAULT_PORT = 3001
const DEFAULT_HOST = '0.0.0.0'

function buildCollectionRegistry(collections: ChunkCollectionConfig[]): CollectionRegistry {
  const byName = new Map<string, ChunkCollectionConfig>()
  for (const c of collections) {
    byName.set(c.chunkCollection, c)
  }
  const documents = collections.filter(c => c.kind === 'document')
  const books = collections.filter(c => c.kind === 'book')
  const chunkNames = collections.map(c => c.chunkCollection)
  return {
    all: collections,
    chunks: collections,
    chunkNames,
    documents,
    books,
    byChunkName: name => byName.get(name),
    has: name => byName.has(name)
  }
}

function buildToolContext(config: McpServerConfig): ToolContext {
  const typesense = createTypesenseClient(config.typesense)
  const collections = buildCollectionRegistry(config.collections)
  const taxonomy = createTaxonomyResolver(config.taxonomy)
  const content: ContentFetcher | null = config.content ? createContentFetcher(config.content) : null
  const resolveReranker = config.reranker?.factory ?? null
  const resolveProfileScope = config.retrievalProfiles ? createProfileScopeResolver(config.retrievalProfiles) : null
  return { typesense, collections, taxonomy, content, resolveReranker, resolveProfileScope }
}

export function createMcpServer(config: McpServerConfig): McpServerHandle {
  const ctx = buildToolContext(config)
  const sessions = new Map<string, StreamableHTTPServerTransport>()
  const transportPort = config.transport?.port ?? DEFAULT_PORT
  const transportHost = config.transport?.host ?? DEFAULT_HOST

  async function createSession(): Promise<StreamableHTTPServerTransport> {
    const server = new McpServer(
      {
        name: config.server.name,
        version: config.server.version
      },
      {
        instructions: config.server.instructions ?? DEFAULT_INSTRUCTIONS
      }
    )

    registerTools({
      server,
      ctx,
      features: config.features ?? {},
      toolNames: config.toolNames ?? {}
    })
    registerResources({
      server,
      ctx,
      resources: config.resources ?? {}
    })

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId: string) => {
        sessions.set(sessionId, transport)
      },
      onsessionclosed: (sessionId: string) => {
        sessions.delete(sessionId)
      }
    })

    await server.connect(transport)
    return transport
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://localhost:${transportPort}`)

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

    // Resolve auth on every request — never reuse the auth captured at
    // session creation. This is what lets a live SearchProfile change
    // (taxonomy filters, reranker, hybrid alpha, query rewrite, etc.)
    // take effect on the next tool call without rebuilding the session.
    const auth = resolveAuth(req, config.auth)

    // Route to existing session or create a new one
    const sessionId = req.headers['mcp-session-id'] as string | undefined

    if (sessionId) {
      const transport = sessions.get(sessionId)
      if (transport) {
        await authStore.run(auth, () => transport.handleRequest(req, res))
      } else {
        res.writeHead(404).end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32001, message: 'Session not found' },
            id: null
          })
        )
      }
      return
    }

    // No session ID → new initialize request → create session and handle
    // the initialize call inside the auth scope so any tool handler that
    // fires during init sees the same context every later request will.
    const transport = await createSession()
    await authStore.run(auth, () => transport.handleRequest(req, res))
  }

  let httpServer: HttpServer | null = null
  let resolvedPort = transportPort

  return {
    get port() {
      return resolvedPort
    },
    async listen() {
      if (httpServer) return
      const server = createServer((req, res) => {
        handleRequest(req, res).catch(err => {
          console.error('[mcp-typesense] Unhandled request error:', err)
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32603, message: 'Internal server error' },
                id: null
              })
            )
          }
        })
      })
      httpServer = server

      return new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(transportPort, transportHost, () => {
          const addr = server.address()
          if (addr && typeof addr === 'object') {
            resolvedPort = addr.port
          }
          server.removeListener('error', reject)
          resolve()
        })
      })
    },
    async close() {
      const server = httpServer
      if (!server) return
      await new Promise<void>((resolve, reject) => {
        server.close(err => {
          if (err) reject(err)
          else resolve()
        })
      })
      httpServer = null
      sessions.clear()
    }
  }
}
