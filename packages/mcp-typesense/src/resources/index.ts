/**
 * Resource registration: `guide://search`, `taxonomy://tree`, `stats://collections`.
 *
 * Resources are static (or lazily computed) documents the client can read for
 * context. They complement tools by giving the agent "read this first"
 * material that doesn't fit into tool descriptions.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getCurrentAuth } from '../auth/context'
import type { ToolContext } from '../context'
import { DEFAULT_GUIDE } from '../defaults'
import { formatResponse } from '../format'
import { getCollectionStats } from '../tools/get-collection-stats'
import { getTaxonomyTree } from '../tools/get-taxonomy-tree'
import type { ResourcesConfig } from '../types'

export interface RegisterResourcesOptions {
  server: McpServer
  ctx: ToolContext
  resources: ResourcesConfig
}

async function resolveGuide(resources: ResourcesConfig): Promise<string> {
  if (!resources.guide) return DEFAULT_GUIDE
  if (typeof resources.guide === 'string') return resources.guide
  return resources.guide()
}

export function registerResources(opts: RegisterResourcesOptions): void {
  const { server, ctx, resources } = opts

  server.resource(
    'search_guide',
    'guide://search',
    {
      description:
        'READ THIS FIRST. Essential guide for using this search server effectively: query formulation rules, recommended workflow, data model, and taxonomy conventions.',
      mimeType: 'text/markdown'
    },
    async () => {
      const text = await resolveGuide(resources)
      return {
        contents: [
          {
            uri: 'guide://search',
            mimeType: 'text/markdown',
            text
          }
        ]
      }
    }
  )

  server.resource(
    'taxonomy_tree',
    'taxonomy://tree',
    {
      description:
        'READ THIS FIRST. Full taxonomy with parent-child relationships. Returned as a TOON-tabular flat list — reconstruct hierarchy from parent_slug if needed. Essential context for understanding search results and filtering effectively.',
      mimeType: 'text/toon'
    },
    async () => {
      // Same scope as the tool: a profile-scoped caller sees only its own
      // taxonomies here, not the full author list.
      const result = await getTaxonomyTree({}, ctx, getCurrentAuth())
      return {
        contents: [
          {
            uri: 'taxonomy://tree',
            mimeType: 'text/toon',
            text: formatResponse(result)
          }
        ]
      }
    }
  )

  server.resource(
    'collection_stats',
    'stats://collections',
    {
      description:
        'Volume overview: total documents per collection, taxonomy distribution — with resolved names, types, and breadcrumbs. Read this to understand data distribution before searching.',
      mimeType: 'text/toon'
    },
    async () => {
      const result = await getCollectionStats(ctx, getCurrentAuth())
      return {
        contents: [
          {
            uri: 'stats://collections',
            mimeType: 'text/toon',
            text: formatResponse(result)
          }
        ]
      }
    }
  )
}
