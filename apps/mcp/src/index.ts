/**
 * MCP Server for Typesense collections
 * Provides tools for an agent to search and retrieve data from Typesense.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { CHUNK_COLLECTIONS, COLLECTIONS } from './config'
import { getChunksByIds } from './tools/get-chunks-by-ids'
import { getChunksByParent } from './tools/get-chunks-by-parent'
import { getFilterCriteria } from './tools/get-filter-criteria'
import { searchCollections } from './tools/search-collections'

const server = new McpServer({
  name: 'typesense-search',
  version: '1.0.0'
})

// ============================================================================
// Tool 1: get_filter_criteria
// ============================================================================

server.registerTool(
  'get_filter_criteria',
  {
    description:
      'Get available taxonomies and filter criteria for Typesense collections. Returns facet fields and their available values, useful for building search filters.',
    inputSchema: {
      collection: z
        .string()
        .optional()
        .describe(
          `Specific collection name. If omitted, returns filters for all chunk collections. Available: ${Object.keys(COLLECTIONS).join(', ')}`
        )
    }
  },
  async input => {
    const result = await getFilterCriteria(input)
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
    }
  }
)

// ============================================================================
// Tool 2: search_collections
// ============================================================================

server.registerTool(
  'search_collections',
  {
    description:
      'Search across chunk collections using lexical, semantic, or hybrid search. Returns matching chunks with title, chunk ID, parent document ID, and taxonomy information. Searches on chunk collections by default.',
    inputSchema: {
      query: z.string().describe('Search query text'),
      collections: z
        .array(z.string())
        .optional()
        .describe(
          `Chunk collection names to search. Defaults to all chunk collections: ${CHUNK_COLLECTIONS.map(c => c.name).join(', ')}`
        ),
      mode: z
        .enum(['lexical', 'semantic', 'hybrid'])
        .optional()
        .describe('Search mode. lexical=keyword, semantic=vector, hybrid=both. Default: hybrid'),
      filters: z
        .record(z.union([z.string(), z.array(z.string())]))
        .optional()
        .describe('Facet filters. Keys: tenant, taxonomy_slugs, headers. Values: string or string[].'),
      per_page: z.number().optional().describe('Results per page. Default: 20'),
      page: z.number().optional().describe('Page number. Default: 1')
    }
  },
  async input => {
    const result = await searchCollections(input)
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
    }
  }
)

// ============================================================================
// Tool 3: get_chunks_by_ids
// ============================================================================

server.registerTool(
  'get_chunks_by_ids',
  {
    description:
      'Retrieve specific chunks by their IDs from a chunk collection. Returns full chunk content (without embeddings). Use this to read the content of chunks found via search.',
    inputSchema: {
      collection: z.string().describe(`Chunk collection name: ${CHUNK_COLLECTIONS.map(c => c.name).join(', ')}`),
      ids: z.array(z.string()).min(1).describe('Array of chunk document IDs to retrieve')
    }
  },
  async input => {
    const result = await getChunksByIds(input)
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
    }
  }
)

// ============================================================================
// Tool 4: get_chunks_by_parent
// ============================================================================

server.registerTool(
  'get_chunks_by_parent',
  {
    description:
      'Retrieve all chunks belonging to a parent document, ordered by chunk_index. Use this to get the full content of a document by passing its parent ID.',
    inputSchema: {
      collection: z.string().describe(`Chunk collection name: ${CHUNK_COLLECTIONS.map(c => c.name).join(', ')}`),
      parent_doc_id: z.string().describe('The parent document ID to retrieve all chunks for')
    }
  },
  async input => {
    const result = await getChunksByParent(input)
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
    }
  }
)

// ============================================================================
// START
// ============================================================================

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Typesense MCP server running on stdio')
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
