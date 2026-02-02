import { createSyncToTypesenseEndpoint } from '@/collections/endpoints/createSyncToTypesenseEndpoint'

/**
 * Endpoint to manually sync all Books to Typesense
 * POST /api/books/sync-to-typesense
 */
export const syncToTypesense = createSyncToTypesenseEndpoint('books')
