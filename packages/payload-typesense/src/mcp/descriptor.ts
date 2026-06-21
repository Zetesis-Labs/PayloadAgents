import type { McpDescriptor, McpRetrievalOption } from '@zetesis/payload-indexer'

export interface TypesenseMcpDescriptorOptions {
  /** Reachable MCP endpoint, e.g. `http://mcp:3030/mcp`. */
  url: string
  id?: string
  displayName?: string
}

/** Agent-tunable knobs the Typesense MCP honours, each mapped to a header. */
const RETRIEVAL_OPTIONS: McpRetrievalOption[] = [
  {
    key: 'hybridAlpha',
    header: 'x-hybrid-alpha',
    type: 'number',
    label: 'Hybrid alpha',
    description: '0 = pure vector, 1 = pure keyword (RRF weight).',
    defaultValue: 0.9
  },
  { key: 'rerankerKind', header: 'x-reranker-kind', type: 'text', label: 'Reranker kind', defaultValue: 'none' },
  { key: 'rerankerModel', header: 'x-reranker-model', type: 'text', label: 'Reranker model' },
  { key: 'inputK', header: 'x-input-k', type: 'number', label: 'Vector recall (k)' },
  { key: 'topK', header: 'x-top-k', type: 'number', label: 'Top K returned' },
  { key: 'queryRewriteTemplate', header: 'x-query-rewrite-template', type: 'text', label: 'Query rewrite template' }
]

/** Context headers the MCP consumes per request (not agent knobs, but must forward). */
const CONTEXT_HEADERS = [
  'x-tenant-slug',
  'x-taxonomy-slugs',
  'x-folder-slugs',
  'x-retrieval-profile',
  'x-retrieval-profiles',
  'x-group-profiles',
  'x-learned-head'
]

/**
 * MCP descriptor for the Typesense search backend. The app supplies the
 * deployment URL; the rest (tunable options + forwarded headers) is fixed by
 * what mcp-typesense honours.
 */
export const createTypesenseMcpDescriptor = (opts: TypesenseMcpDescriptorOptions): McpDescriptor => ({
  id: opts.id ?? 'typesense_search',
  displayName: opts.displayName ?? 'Typesense Search',
  url: opts.url,
  transport: 'http',
  forwardHeaders: [...CONTEXT_HEADERS, ...RETRIEVAL_OPTIONS.map(o => o.header)],
  retrievalOptions: RETRIEVAL_OPTIONS
})
