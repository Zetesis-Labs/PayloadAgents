import type { TableConfig } from '@nexo-labs/payload-indexer'
import type { Client } from 'typesense'
import { logger } from '../../../../../core/logging/logger'
import { searchCache } from '../../../../../shared/cache/cache'
import { combineTraditionalResults } from '../../../results/process-traditional-results'
import { searchTraditionalCollection } from '../../../traditional/search-collection'
import type { CombinedSearchResult, UniversalSearchOptions } from '../../../types'

export const performTraditionalMultiCollectionSearch = async (
  typesenseClient: Client,
  enabledCollections: Array<[string, TableConfig]>,
  query: string,
  options: UniversalSearchOptions
): Promise<CombinedSearchResult> => {
  logger.info('Performing traditional multi-collection search', {
    query,
    collections: enabledCollections.map(([name]) => name)
  })

  // Determine search fields (override if query_by is provided)
  const searchFieldsOverride = options.query_by ? options.query_by.split(',').map(f => f.trim()) : undefined

  const searchPromises = enabledCollections.map(async ([collectionName, config]) => {
    try {
      const result = await searchTraditionalCollection(typesenseClient, collectionName, config, {
        query,
        page: options.page,
        per_page: options.per_page,
        ...(searchFieldsOverride
          ? { searchFields: searchFieldsOverride }
          : (() => {
              // Extract default search fields from config
              if (!config) return {}
              let fields: {
                name: string
                index?: boolean
                type?: string
              }[] = []
              fields = config.fields
              // Filter for indexed fields that are searchable (string or string[] types only)
              // Typesense only accepts string/string[] fields in query_by parameter
              const searchFields = fields
                .filter(f => f.index !== false && (f.type === 'string' || f.type === 'string[]'))
                .map(f => f.name)
              return searchFields.length > 0 ? { searchFields } : {}
            })()),
        ...(options.sort_by && { sort_by: options.sort_by }),
        ...(options.exclude_fields && {
          exclude_fields: options.exclude_fields
        })
      })
      return result
    } catch (error) {
      logger.error('Error searching collection', error as Error, {
        collection: collectionName,
        query
      })
      throw error
    }
  })

  const results = await Promise.all(searchPromises)
  const fallbackResult = combineTraditionalResults(results, {
    page: options.page,
    per_page: options.per_page,
    query
  })

  searchCache.set(query, fallbackResult, 'universal', options)
  return fallbackResult
}
