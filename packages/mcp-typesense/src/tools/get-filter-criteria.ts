/**
 * Tool: get_filter_criteria
 * Returns available taxonomies and filterable facet values for collections.
 */

import { z } from 'zod'
import type { ToolContext } from '../context'
import type { ChunkCollectionConfig, McpAuthContext } from '../types'
import { scopeFilterClauses } from './scope-filters'

export const getFilterCriteriaSchema = z.object({
  collection: z
    .string()
    .optional()
    .describe('Specific collection name to get filters for. If omitted, returns filters for all chunk collections.')
})

export type GetFilterCriteriaInput = z.infer<typeof getFilterCriteriaSchema>

interface FacetValues {
  field: string
  values: Array<{ value: string; count: number }>
}

interface CollectionFilters {
  collection: string
  displayName: string
  facets: FacetValues[]
}

async function getFacetsForCollection(
  ctx: ToolContext,
  collectionDef: ChunkCollectionConfig,
  auth: McpAuthContext | null
): Promise<CollectionFilters> {
  const facets: FacetValues[] = []
  const tenantSlug = auth?.tenantSlug ?? null
  // Facet counts computed within the caller's scope, so the returned filter
  // options never advertise taxonomies/folders it cannot actually read.
  const scopeFilter = scopeFilterClauses(auth).join(' && ')

  for (const facetField of collectionDef.chunkFacetFields) {
    // Skip parent_doc_id as it's not useful as a user-facing filter
    if (facetField === 'parent_doc_id') continue
    // When scoped to a tenant, skip the tenant facet (always single value)
    if (tenantSlug && facetField === 'tenant') continue

    try {
      const result = await ctx.typesense
        .collections(collectionDef.chunkCollection)
        .documents()
        .search({
          q: '*',
          query_by: collectionDef.chunkSearchFields[0] || 'title',
          facet_by: facetField,
          max_facet_values: 100,
          per_page: 0,
          ...(scopeFilter ? { filter_by: scopeFilter } : {})
        })

      const facetCounts = result.facet_counts?.find(f => f.field_name === facetField)
      if (facetCounts?.counts && facetCounts.counts.length > 0) {
        facets.push({
          field: facetField,
          values: facetCounts.counts.map(c => ({
            value: c.value,
            count: c.count
          }))
        })
      }
    } catch (err: unknown) {
      const status = (err as { httpStatus?: number }).httpStatus
      if (status !== 404) {
        console.error(`[mcp-typesense] Failed to get facets for ${collectionDef.chunkCollection}:`, err)
      }
    }
  }

  return {
    collection: collectionDef.chunkCollection,
    displayName: collectionDef.displayName,
    facets
  }
}

export async function getFilterCriteria(input: GetFilterCriteriaInput, ctx: ToolContext, auth: McpAuthContext | null) {
  const targets: ChunkCollectionConfig[] = []

  if (input.collection) {
    const def = ctx.collections.byChunkName(input.collection)
    if (!def) {
      return {
        error: `Unknown collection: ${input.collection}. Available: ${ctx.collections.chunkNames.join(', ')}`
      }
    }
    targets.push(def)
  } else {
    targets.push(...ctx.collections.chunks)
  }

  const results = await Promise.all(targets.map(t => getFacetsForCollection(ctx, t, auth)))
  return { collections: results }
}
