/**
 * Tool: get_filter_criteria
 * Returns available taxonomies and filterable facet values for collections.
 */

import { z } from 'zod'
import { getTypesenseClient } from '../client'
import { CHUNK_COLLECTIONS, COLLECTIONS, type CollectionDef } from '../config'

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

async function getFacetsForCollection(collectionDef: CollectionDef): Promise<CollectionFilters> {
  const client = getTypesenseClient()
  const facets: FacetValues[] = []

  for (const facetField of collectionDef.facetFields) {
    // Skip parent_doc_id as it's not useful as a user-facing filter
    if (facetField === 'parent_doc_id') continue

    try {
      const result = await client
        .collections(collectionDef.name)
        .documents()
        .search({
          q: '*',
          query_by: collectionDef.searchFields[0] || 'title',
          facet_by: facetField,
          max_facet_values: 100,
          per_page: 0
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
    } catch {
      // Collection might not exist yet, skip
    }
  }

  return {
    collection: collectionDef.name,
    displayName: collectionDef.displayName,
    facets
  }
}

export async function getFilterCriteria(input: GetFilterCriteriaInput) {
  const targets: CollectionDef[] = []

  if (input.collection) {
    const def = COLLECTIONS[input.collection]
    if (!def) {
      return { error: `Unknown collection: ${input.collection}. Available: ${Object.keys(COLLECTIONS).join(', ')}` }
    }
    targets.push(def)
  } else {
    targets.push(...CHUNK_COLLECTIONS)
  }

  const results = await Promise.all(targets.map(getFacetsForCollection))
  return { collections: results }
}
