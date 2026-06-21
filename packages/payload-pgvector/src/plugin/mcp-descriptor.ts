import type { McpDescriptor } from '@zetesis/payload-indexer'

export interface PgvectorMcpDescriptorOptions {
  /** Reachable MCP endpoint, e.g. `http://mcp-pgvector:3041/mcp`. */
  url: string
  id?: string
  displayName?: string
}

/**
 * MCP descriptor for the pgvector search backend. mcp-pgvector is thin (no
 * tunable knobs), but it DOES honour the trusted `x-taxonomy-slugs` scope header
 * — so the gateway must forward it, otherwise a scoped token/agent would read
 * the whole corpus.
 */
export const createPgvectorMcpDescriptor = (opts: PgvectorMcpDescriptorOptions): McpDescriptor => ({
  id: opts.id ?? 'pgvector_search',
  displayName: opts.displayName ?? 'pgvector Search (experimental)',
  url: opts.url,
  transport: 'http',
  forwardHeaders: ['x-taxonomy-slugs'],
  retrievalOptions: []
})
