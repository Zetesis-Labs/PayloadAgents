import type { McpDescriptor } from '@zetesis/payload-indexer'

export interface PgvectorMcpDescriptorOptions {
  /** Reachable MCP endpoint, e.g. `http://mcp-pgvector:3041/mcp`. */
  url: string
  id?: string
  displayName?: string
}

/**
 * MCP descriptor for the pgvector search backend. mcp-pgvector is intentionally
 * thin (filters + limit are tool arguments, not headers), so it exposes no
 * header-mapped tunables yet — the descriptor still lets the app register it in
 * the gateway alongside Typesense.
 */
export const createPgvectorMcpDescriptor = (opts: PgvectorMcpDescriptorOptions): McpDescriptor => ({
  id: opts.id ?? 'pgvector_search',
  displayName: opts.displayName ?? 'pgvector Search',
  url: opts.url,
  transport: 'http',
  forwardHeaders: [],
  retrievalOptions: []
})
