/**
 * Tool registration entry point.
 *
 * `registerTools` wires every tool to the provided `McpServer`. The set of
 * tools is shaped by three things:
 *
 * 1. The `collections` config (drives which content-specific tools apply).
 * 2. `features.llmSampling` (gates the synthesis tools).
 * 3. `content` presence (gates `get_book_toc`).
 *
 * All tools share the runtime context. The per-request auth context is
 * read fresh via `getCurrentAuth()` inside each handler so live changes
 * to the caller's SearchProfile apply on the next invocation.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getCurrentAuth } from '../auth/context'
import { applyProfileScope } from '../auth/profile-scope'
import type { ToolContext } from '../context'
import { type OutputFormat, toolResult } from '../format'
import type { FeaturesConfig, ToolNameOverrides } from '../types'
import { comparePerspectives, comparePerspectivesSchema } from './compare-perspectives'
import { extractClaims, extractClaimsSchema } from './extract-claims'
import { getBookToc, getBookTocSchema } from './get-book-toc'
import { getChunksByIds, getChunksByIdsSchema } from './get-chunks-by-ids'
import { getFilterCriteria, getFilterCriteriaSchema } from './get-filter-criteria'
import { getPostSummaries, getPostSummariesSchema } from './get-post-summaries'
import { getTaxonomyTree, getTaxonomyTreeSchema } from './get-taxonomy-tree'
import { listRetrievalProfiles, listRetrievalProfilesSchema } from './list-retrieval-profiles'
import { requireProfileSelection, searchCollections, searchCollectionsSchema } from './search-collections'
import { summarizeDocument, summarizeDocumentSchema } from './summarize-document'
import { synthesizeComparison, synthesizeComparisonSchema } from './synthesize-comparison'

const formatParam = z
  .enum(['toon', 'json'])
  .optional()
  .describe(
    'Response format. "toon" (default) is ~40% more compact. Use "json" if your client needs structured parsing.'
  )

export interface RegisterToolsOptions {
  server: McpServer
  ctx: ToolContext
  features: FeaturesConfig
  toolNames: ToolNameOverrides
}

/**
 * Wire every enabled tool to the given MCP server. Called once per session,
 * after `new McpServer()` and before `server.connect(transport)`.
 */
export function registerTools(opts: RegisterToolsOptions): void {
  const { server, ctx, features, toolNames } = opts
  const chunkNames = ctx.collections.chunkNames.join(', ')
  const hasDocuments = ctx.collections.documents.length > 0
  const hasContent = ctx.content !== null
  const llmSamplingEnabled = features.llmSampling !== false

  // -- OVERVIEW --------------------------------------------------------------

  server.registerTool(
    toolNames.getTaxonomyTree ?? 'get_taxonomy_tree',
    {
      description:
        'Taxonomy from the configured source. Default shape is "flat" — a tabular list of {id,name,slug,type,path} emitted in DFS order (parents then their children, contiguous). TOON encodes it as a single CSV-style block, ~3x more compact than the nested tree. Use shape="tree" only when you specifically want nested children[]. Filter by type or parent_slug to narrow.',
      inputSchema: {
        ...getTaxonomyTreeSchema.shape,
        format: formatParam
      }
    },
    async input => {
      const result = await getTaxonomyTree(input, ctx)
      return toolResult(result, input.format as OutputFormat)
    }
  )

  server.registerTool(
    toolNames.getFilterCriteria ?? 'get_filter_criteria',
    {
      description:
        'Raw facet counts for filtering searches: taxonomy slugs, headers, and document counts. For hierarchical taxonomy use get_taxonomy_tree instead.',
      inputSchema: {
        ...getFilterCriteriaSchema.shape,
        collection: z
          .string()
          .optional()
          .describe(
            `Specific collection name. If omitted, returns filters for all chunk collections. Available: ${chunkNames}`
          ),
        format: formatParam
      }
    },
    async input => {
      const result = await getFilterCriteria(input, ctx, getCurrentAuth())
      return toolResult(result, input.format as OutputFormat)
    }
  )

  // -- BROWSE ----------------------------------------------------------------

  if (hasDocuments) {
    server.registerTool(
      toolNames.getPostSummaries ?? 'get_post_summaries',
      {
        description:
          'Lightweight post index (id, title, resolved categories, has_topics). No content. Filter by author_slug/topic_slug (combinable for intersection). Use has_topics:false to find uncategorized posts.',
        inputSchema: {
          ...getPostSummariesSchema.shape,
          format: formatParam
        }
      },
      async input => {
        const result = await getPostSummaries(input, ctx, getCurrentAuth())
        return toolResult(result, input.format as OutputFormat)
      }
    )
  }

  if (hasContent) {
    server.registerTool(
      toolNames.getBookToc ?? 'get_book_toc',
      {
        description:
          'Hierarchical TOC for books. Unfiltered returns a lightweight index (title+slug+chapter_count per book). With filter (id/slug/author_slug) returns full chapter TOC with nested sections. No content text — only structural skeleton.',
        inputSchema: {
          ...getBookTocSchema.shape,
          format: formatParam
        }
      },
      async input => {
        const result = await getBookToc(input, ctx, getCurrentAuth())
        return toolResult(result, input.format as OutputFormat)
      }
    )
  }

  // -- SEARCH ----------------------------------------------------------------

  server.registerTool(
    toolNames.listRetrievalProfiles ?? 'list_retrieval_profiles',
    {
      description:
        'List the retrieval profiles available to you. Each profile bundles hard filters, hybrid params, an optional reranker and an optional lente (a learned re-ranker that biases results toward a register). Pick the one that best fits the query and pass its slug as `retrieval_profile` to search_collections. If you do not pass one, the first (default) profile is used.',
      inputSchema: { ...listRetrievalProfilesSchema.shape, format: formatParam }
    },
    async input => {
      const result = listRetrievalProfiles(input, getCurrentAuth())
      return toolResult(result, input.format as OutputFormat)
    }
  )

  server.registerTool(
    toolNames.searchCollections ?? 'search_collections',
    {
      description:
        'Search chunks (lexical/semantic/hybrid) across collections. Returns matching chunks with enriched taxonomy (name, type, breadcrumb). chunk_text is truncated to 300 chars by default — set snippet_length: 0 for full text. See server instructions for search rules (concept queries, lexical AND, per_page recall).',
      inputSchema: {
        ...searchCollectionsSchema.shape,
        collections: z
          .array(z.string())
          .optional()
          .describe(`Chunk collection names to search. Defaults to all chunk collections: ${chunkNames}`),
        format: formatParam
      }
    },
    async input => {
      const auth = getCurrentAuth()
      const guard = requireProfileSelection(auth, input.retrieval_profile)
      if (guard) return toolResult(guard, input.format as OutputFormat)
      // Resolve the chosen profile's lente+filters. The agent sends only the
      // slug; the resolver fetches the weights server-side (Agno route). Falls
      // back to the caller's default profile when none was chosen. No-op on the
      // token route, where the proxy already resolved `auth.retrieval`.
      const chosen = input.retrieval_profile ?? auth?.defaultProfileSlug
      const scoped = await applyProfileScope(auth, chosen, ctx.resolveProfileScope)
      const result = await searchCollections(input, ctx, scoped)
      return toolResult(result, input.format as OutputFormat)
    }
  )

  server.registerTool(
    toolNames.comparePerspectives ?? 'compare_perspectives',
    {
      description:
        'Run the SAME concept query against 2-8 taxonomy-scoped groups in parallel. Returns hits grouped by name. Use this instead of N separate search_collections calls when comparing how different authors or topics treat the same concept. Each group is a thin wrapper around search_collections with its own taxonomy_slugs filter — same query rules apply.',
      inputSchema: {
        ...comparePerspectivesSchema.shape,
        format: formatParam
      }
    },
    async input => {
      const auth = getCurrentAuth()
      // Every group must resolve to a valid profile (its own or the top-level default).
      for (const g of input.groups) {
        const guard = requireProfileSelection(auth, g.retrieval_profile ?? input.retrieval_profile)
        if (guard) return toolResult(guard, input.format as OutputFormat)
      }
      const result = await comparePerspectives(input, ctx, auth)
      return toolResult(result, input.format as OutputFormat)
    }
  )

  // -- READ ------------------------------------------------------------------

  server.registerTool(
    toolNames.getChunksByIds ?? 'get_chunks_by_ids',
    {
      description:
        'Read specific chunks by their IDs (no embeddings). Use to fetch full content of chunks found via search_collections.',
      inputSchema: {
        ...getChunksByIdsSchema.shape,
        collection: z.string().describe(`Chunk collection name: ${chunkNames}`),
        format: formatParam
      }
    },
    async input => {
      const result = await getChunksByIds(input, ctx, getCurrentAuth())
      return toolResult(result, input.format as OutputFormat)
    }
  )

  // get_chunks_by_parent is intentionally NOT registered as a public tool.
  // Agents should use search_collections with snippet_length: 0 and expand_context instead.
  // The function remains available internally (summarize_document, extract_claims).

  // -- SYNTHESIZE (LLM-powered, requires client sampling support) ------------

  if (llmSamplingEnabled) {
    server.registerTool(
      toolNames.summarizeDocument ?? 'summarize_document',
      {
        description:
          'LLM-POWERED. Read a document (or a chunk range) and return a focused summary + key claims with chunk_id citations. Use instead of reading raw chunks when you need the gist of a long doc. Slow (5-30s) and consumes client LLM tokens. Returns { error: "sampling_not_supported", fallback } if the client does not support sampling. Every citation has a `verified` flag; do not quote citations with `verified: false`.',
        inputSchema: {
          ...summarizeDocumentSchema.shape,
          collection: z.string().describe(`Chunk collection name: ${chunkNames}`),
          format: formatParam
        }
      },
      async (input, extra) => {
        const result = await summarizeDocument(input, ctx, getCurrentAuth(), server, extra.signal)
        return toolResult(result, input.format as OutputFormat)
      }
    )

    server.registerTool(
      toolNames.extractClaims ?? 'extract_claims',
      {
        description:
          'LLM-POWERED. Extract discrete typed claims from a document (factual / normative / definitional / predictive), each with a supporting chunk_id. Use to build structured extractions or knowledge bases. Slow and token-heavy. Returns { error: "sampling_not_supported" } if the client does not support sampling. Every claim has a `verified` flag against the chunks actually passed to the model.',
        inputSchema: {
          ...extractClaimsSchema.shape,
          collection: z.string().describe(`Chunk collection name: ${chunkNames}`),
          format: formatParam
        }
      },
      async (input, extra) => {
        const result = await extractClaims(input, ctx, getCurrentAuth(), server, extra.signal)
        return toolResult(result, input.format as OutputFormat)
      }
    )

    server.registerTool(
      toolNames.synthesizeComparison ?? 'synthesize_comparison',
      {
        description:
          'LLM-POWERED. Like compare_perspectives but returns a cross-group synthesis: per-group theses + agreements/disagreements/nuances. 2-5 groups. Slow (N+1 sampling calls, 10-40s). Returns { error: "sampling_not_supported" } if the client does not support sampling — the fallback is `compare_perspectives`. supporting_chunks on each group are citation-verified.',
        inputSchema: {
          ...synthesizeComparisonSchema.shape,
          format: formatParam
        }
      },
      async (input, extra) => {
        const result = await synthesizeComparison(input, ctx, getCurrentAuth(), server, extra.signal)
        return toolResult(result, input.format as OutputFormat)
      }
    )
  }
}
