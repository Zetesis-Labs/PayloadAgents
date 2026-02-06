import type { TableConfig } from '@nexo-labs/payload-indexer'
import type { Client } from 'typesense'
import { processSingleCollectionTraditionalResults } from '../results/process-traditional-results'
import type { CollectionSearchResult } from '../types'
import { buildTraditionalSearchParams } from './build-params'

/**
 * Performs a traditional search on a single collection
 */
export const searchTraditionalCollection = async (
  typesenseClient: Client,
  collectionName: string,
  config: TableConfig,
  options: {
    query: string
    page: number
    per_page: number
    searchFields?: string[]
    sort_by?: string
    exclude_fields?: string
    skipChunkFilter?: boolean // Skip the !is_chunk filter for simple searches
  }
): Promise<CollectionSearchResult> => {
  try {
    const buildOptions: {
      page: number
      per_page: number
      searchFields?: string[]
      sort_by?: string
      exclude_fields?: string
    } = {
      page: options.page,
      per_page: options.per_page
    }

    // Extract search fields from config if not provided in options
    if (options.searchFields) {
      buildOptions.searchFields = options.searchFields
    } else if (config) {
      let fields: { name: string; index?: boolean; type?: string }[] = []
      fields = config.fields
      // Filter for indexed fields that are searchable (string or string[] types only)
      // Typesense only accepts string/string[] fields in query_by parameter
      const searchFields = fields
        .filter(f => f.index !== false && (f.type === 'string' || f.type === 'string[]'))
        .map(f => f.name)
      if (searchFields.length > 0) {
        buildOptions.searchFields = searchFields
      }
    }

    if (options.sort_by) {
      buildOptions.sort_by = options.sort_by
    }

    if (options.exclude_fields) {
      buildOptions.exclude_fields = options.exclude_fields
    }

    const searchParameters = buildTraditionalSearchParams(options.query, buildOptions)

    // Try to add chunk filter, but handle gracefully if schema doesn't support it
    // Skip chunk filter for simple searches since we're already searching main collections only
    if (!options.skipChunkFilter) {
      try {
        // First check if schema supports is_chunk field
        const collectionSchema = await typesenseClient.collections(collectionName).retrieve()

        const fieldNames = collectionSchema.fields?.map(f => f.name) || []
        if (fieldNames.includes('is_chunk')) {
          // Schema supports chunking, add filter
          searchParameters.filter_by = '!is_chunk:true'
        }
        // If schema doesn't support is_chunk, don't add filter (backward compatibility)
      } catch (_schemaError: unknown) {
        // If we can't retrieve schema, don't add filter (will work for old collections)
      }
    }

    const results = await typesenseClient.collections(collectionName).documents().search(searchParameters)

    return processSingleCollectionTraditionalResults(results, collectionName, config)
  } catch (error) {
    return {
      collection: collectionName,
      displayName: config?.displayName || collectionName,
      error: error instanceof Error ? error.message : 'Unknown error',
      found: 0,
      hits: [],
      icon: '📄'
    }
  }
}
