import type { PayloadDocument } from '@nexo-labs/payload-indexer'
import { syncDocumentToIndex } from '@nexo-labs/payload-indexer'
import { createTypesenseAdapter } from '@nexo-labs/payload-typesense'
import type { CollectionSlug, Endpoint } from 'payload'
import { APIError } from 'payload'
import { isSuperAdmin } from '@/access/isSuperAdmin'
import { getTableConfig } from '@/payload/plugins/typesense/collections'
import { typesenseConnection } from '@/payload/plugins/typesense/config'

/**
 * Convert Payload document to indexable format
 * Handles the id type conversion (number -> string) and null values
 */
const toIndexableDocument = (doc: any): PayloadDocument => ({
  ...doc,
  id: String(doc.id),
  slug: doc.slug ?? undefined,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt
})

/**
 * Factory to create a syncToTypesense endpoint for any collection
 *
 * @param collectionSlug - The slug of the collection to sync
 * @returns Payload endpoint configuration
 *
 * @example
 * ```ts
 * export const syncToTypesense = createSyncToTypesenseEndpoint('posts')
 * ```
 */
export const createSyncToTypesenseEndpoint = (collectionSlug: CollectionSlug): Endpoint => ({
  handler: async req => {
    // Check authentication
    if (!req.user) {
      throw new APIError('Unauthorized', 401, null, true)
    }

    // Check permissions - only superadmins can trigger full sync
    if (!isSuperAdmin(req.user)) {
      throw new APIError('Forbidden - superadmin access required', 403, null, true)
    }

    const collectionName = String(collectionSlug)
    const collectionNameCap = collectionName.charAt(0).toUpperCase() + collectionName.slice(1)

    try {
      const adapter = createTypesenseAdapter(typesenseConnection)
      const tableConfig = getTableConfig(collectionSlug)

      if (!tableConfig) {
        throw new APIError(`${collectionNameCap} collection is not configured for indexing`, 500, null, true)
      }

      // Get all documents with tenant populated
      const response = await req.payload.find({
        collection: collectionSlug,
        limit: 0, // Get all
        depth: 1 // Populate tenant relationship
      })

      const results = {
        synced: [] as string[],
        errors: [] as string[]
      }

      console.log(`[Typesense Sync] Starting sync of ${response.totalDocs} ${collectionName}...`)

      // Sync each document
      for (const doc of response.docs) {
        try {
          const indexableDoc = toIndexableDocument(doc)
          await syncDocumentToIndex(adapter, collectionSlug, indexableDoc, 'update', tableConfig)
          results.synced.push(String(doc.id))
          console.log(`[Typesense Sync] Synced ${collectionName.slice(0, -1)} ${doc.id}}`)
        } catch (error) {
          const errorMsg = `${doc.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
          results.errors.push(errorMsg)
          console.error(`[Typesense Sync] Error syncing ${collectionName.slice(0, -1)} ${doc.id}:`, error)
        }
      }

      console.log(`[Typesense Sync] Completed: ${results.synced.length} synced, ${results.errors.length} errors`)

      return Response.json({
        success: true,
        message: 'Sync completed',
        totalDocuments: response.totalDocs,
        results
      })
    } catch (error) {
      if (error instanceof APIError) {
        throw error
      }
      console.error('[Typesense Sync] Fatal error:', error)
      throw new APIError(
        `Failed to sync to Typesense: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        null,
        true
      )
    }
  },
  method: 'post',
  path: '/sync-to-typesense'
})
