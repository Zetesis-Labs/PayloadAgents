import { createSyncToTypesenseEndpoint } from '@/collections/endpoints/createSyncToTypesenseEndpoint'

/**
 * Endpoint to manually sync all Posts to Typesense
 * POST /api/posts/sync-to-typesense
 */
export const syncToTypesense = createSyncToTypesenseEndpoint('posts')
