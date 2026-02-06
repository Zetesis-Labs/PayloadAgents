import type { PayloadHandler, PayloadRequest } from 'payload'
import type { Client } from 'typesense'
import type { ModularPluginConfig } from '../../../../core/config/types'
import { SearchService } from '../../services/search-service'
import { SearchConfigMapper, TargetCollectionResolver, transformToSimpleFormat } from './utils'
import { validateSearchRequest } from './validators'

/**
 * Creates a handler for standard search requests
 */
export const createSearchHandler = (typesenseClient: Client, pluginOptions: ModularPluginConfig): PayloadHandler => {
  const searchService = new SearchService(typesenseClient, pluginOptions)
  const targetResolver = new TargetCollectionResolver(pluginOptions)
  const configMapper = new SearchConfigMapper(pluginOptions)

  return async (request: PayloadRequest) => {
    try {
      // 1. Validate Request
      const validated = validateSearchRequest(request)
      if (!validated.success) return validated.error

      const { collectionName, searchParams } = validated

      // 2. Resolve Target Tables (Atomized Logic)
      const targetCollections = targetResolver.resolveTargetTables(
        collectionName, // Pass null if multi-search, or slug if single
        searchParams.collections
      )

      // Validation: Check if we have valid targets
      if (targetCollections.length === 0) {
        const isMultiSearch = !collectionName
        const hasExplicitRequest = isMultiSearch && searchParams.collections && searchParams.collections.length > 0

        if (hasExplicitRequest) {
          return Response.json({ error: 'None of the requested collections are allowed' }, { status: 403 })
        }
        return Response.json({ error: 'Collection not allowed or not enabled' }, { status: 403 })
      }

      if (!searchParams.q || searchParams.q.trim() === '') {
        return Response.json({ error: 'Query parameter "q" is required' }, { status: 400 })
      }

      // 3. Prepare Search Configuration (Atomized Logic)
      const searchConfigs = configMapper.mapTablesToConfigs(targetCollections)

      // 4. Execute Search via Service
      const searchResult = await searchService.performSearch(searchParams.q, searchConfigs, {
        filters: {},
        page: searchParams.page,
        per_page: searchParams.per_page,
        sort_by: searchParams.sort_by,
        mode: searchParams.mode,
        exclude_fields: searchParams.exclude_fields,
        query_by: searchParams.query_by
      })

      // 5. Format Response
      if (searchParams.simple) {
        return Response.json(transformToSimpleFormat(searchResult, pluginOptions.documentTypeResolver))
      }

      return Response.json(searchResult)
    } catch (error) {
      return Response.json(
        {
          details: error instanceof Error ? error.message : 'Unknown error',
          error: 'Search handler failed'
        },
        { status: 500 }
      )
    }
  }
}
