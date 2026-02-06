import type { TableConfig } from '@nexo-labs/payload-indexer'
import type { BuildMultiCollectionVectorSearchParamsOptions } from '../types'
import { buildVectorSearchParams } from './build-params'

/**
 * Builds multi-collection vector search parameters
 */
export const buildMultiCollectionVectorSearchParams = (
  searchVector: number[],
  enabledCollections: Array<[string, TableConfig]>,
  options: BuildMultiCollectionVectorSearchParamsOptions
): Array<Record<string, unknown>> => {
  const { query, k, hybrid, alpha, page, per_page, filter_by, sort_by } = options

  return enabledCollections.map(([collectionName, config]) => {
    // Extract search fields
    let searchFields: string[] | undefined
    if (config) {
      let fields: { name: string; index?: boolean; type?: string }[] = []
      fields = config.fields
      // Filter for indexed fields that are searchable (string or string[] types only)
      // Typesense only accepts string/string[] fields in query_by parameter
      const extracted = fields
        .filter(f => f.index !== false && (f.type === 'string' || f.type === 'string[]'))
        .map(f => f.name)
      if (extracted.length > 0) {
        searchFields = extracted
      }
    }

    // Build search params - don't add filter_by here
    // The filter will be added conditionally in the handler after schema check
    const collectionSearchParams = buildVectorSearchParams(searchVector, {
      ...(query !== undefined && { query }),
      ...(k !== undefined && { k }),
      ...(hybrid !== undefined && { hybrid }),
      ...(alpha !== undefined && { alpha }),
      ...(page !== undefined && { page }),
      ...(per_page !== undefined && { per_page }),
      // Don't add filter_by here - will be handled in handler after schema check
      ...(sort_by !== undefined && { sort_by }),
      ...(searchFields !== undefined && {
        searchFields: searchFields
      })
    })

    // Store filter_by separately - handler will add it conditionally
    return {
      collection: collectionName,
      ...collectionSearchParams,
      _filter_by: filter_by // Internal flag for handler to check schema and add filter
    }
  })
}
