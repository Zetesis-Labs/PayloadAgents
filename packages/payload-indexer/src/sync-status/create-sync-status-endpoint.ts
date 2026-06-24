/**
 * REST endpoint for sync status checks
 * Registers GET /api/sync-status/:collection as a Payload custom endpoint
 */

import type { Endpoint, PayloadRequest, Where } from 'payload'
import type { IndexerAdapter } from '../adapter/types'
import type { PayloadDocument, TableConfig } from '../document/types'
import { syncDocumentToIndex } from '../plugin/sync/document-syncer'
import { checkBatchSyncStatus, checkSyncStatus } from './sync-status-service'

interface SyncStatusEndpointConfig {
  adapter: IndexerAdapter
  collections: Record<string, TableConfig[]>
  /**
   * Path prefix for the registered endpoints (e.g. `/sync-status-typesense`).
   * Namespaced per adapter so multiple indexer plugins don't collide on the
   * same REST path. Must match the `basePath` the client field component uses.
   */
  basePath: string
}

/**
 * Resolve the best table config for sync status checks.
 * Prefers tables with embedding fields (content hash is computed from those).
 */
const resolveTableConfig = (tableConfigs: TableConfig[]): TableConfig | undefined => {
  return tableConfigs.find(t => t.enabled && t.embedding?.fields) ?? tableConfigs[0]
}

/**
 * Fetch a document with access control enforced.
 * Returns the document or a 403 Response if access is denied.
 */
const findDocumentWithAccessCheck = async (
  req: PayloadRequest,
  collection: string,
  id: string
): Promise<PayloadDocument | Response> => {
  try {
    return (await req.payload.findByID({
      collection,
      id,
      depth: 0,
      overrideAccess: false,
      req
    })) as unknown as PayloadDocument
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Access denied'
    return Response.json({ error: message }, { status: 403 })
  }
}

/**
 * Creates Payload REST endpoints for sync status checking
 *
 * Endpoints:
 * - GET /api/sync-status/:collection - Batch check all docs in a collection page
 * - GET /api/sync-status/:collection/:id - Check a single document
 *
 * Query params (batch):
 * - page (default: 1)
 * - limit (default: 20)
 * - ids (comma-separated doc IDs)
 */
export const createSyncStatusEndpoints = (config: SyncStatusEndpointConfig): Endpoint[] => {
  const { adapter, collections, basePath } = config

  return [
    // Single document sync status
    {
      path: `${basePath}/:collection/:id`,
      method: 'get',
      handler: async (req: PayloadRequest) => {
        if (!req.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const collection = req.routeParams?.collection as string
        const id = req.routeParams?.id as string

        if (!collection || !id) {
          return Response.json({ error: 'Missing collection or id' }, { status: 400 })
        }

        const tableConfigs = collections[collection]
        const tableConfig = tableConfigs ? resolveTableConfig(tableConfigs) : undefined

        if (!tableConfig) {
          return Response.json({ error: `Collection "${collection}" is not indexed` }, { status: 404 })
        }

        try {
          const doc = (await req.payload.findByID({
            collection: collection,
            id,
            depth: 0
          })) as unknown as PayloadDocument

          const result = await checkSyncStatus(adapter, collection, doc, tableConfig)
          return Response.json(result)
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
        }
      }
    },
    // Batch sync status for collection
    {
      path: `${basePath}/:collection`,
      method: 'get',
      handler: async (req: PayloadRequest) => {
        if (!req.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const collection = req.routeParams?.collection as string
        if (!collection) {
          return Response.json({ error: 'Missing collection' }, { status: 400 })
        }

        const tableConfigs = collections[collection]
        const tableConfig = tableConfigs ? resolveTableConfig(tableConfigs) : undefined

        if (!tableConfig) {
          return Response.json({ error: `Collection "${collection}" is not indexed` }, { status: 404 })
        }

        const url = new URL(req.url || '', 'http://localhost')
        const page = Number(url.searchParams.get('page') || '1')
        const limit = Number(url.searchParams.get('limit') || '20')
        const ids = url.searchParams.get('ids')

        try {
          let docs: PayloadDocument[]

          if (ids) {
            // Fetch specific documents by IDs
            const idList = ids.split(',')
            const results = await Promise.all(
              idList.map(id =>
                req.payload
                  .findByID({
                    collection: collection,
                    id: id.trim(),
                    depth: 0
                  })
                  .catch(() => null)
              )
            )
            docs = results.filter(Boolean) as unknown as PayloadDocument[]
          } else {
            // Fetch a page of documents
            const whereParam = url.searchParams.get('where')
            const where = whereParam ? (JSON.parse(whereParam) as Where) : undefined

            const result = (await req.payload.find({
              collection: collection,
              page,
              limit,
              depth: 0,
              ...(where && { where })
            })) as unknown as { docs: PayloadDocument[] }

            docs = result.docs
          }

          const batchResult = await checkBatchSyncStatus(adapter, collection, docs, tableConfig)

          return Response.json({
            results: Object.fromEntries(batchResult.results),
            total: batchResult.total,
            counts: batchResult.counts
          })
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
        }
      }
    },
    // Trigger sync for a single document
    {
      path: `${basePath}/:collection/:id/sync`,
      method: 'post',
      handler: async (req: PayloadRequest) => {
        if (!req.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const collection = req.routeParams?.collection as string
        const id = req.routeParams?.id as string

        if (!collection || !id) {
          return Response.json({ error: 'Missing collection or id' }, { status: 400 })
        }

        const tableConfigs = collections[collection]
        if (!tableConfigs) {
          return Response.json({ error: `Collection "${collection}" is not indexed` }, { status: 404 })
        }

        try {
          const result = await findDocumentWithAccessCheck(req, collection, id)
          if (result instanceof Response) return result
          const doc = result

          const enabledConfigs = tableConfigs.filter(t => t.enabled)
          for (const tableConfig of enabledConfigs) {
            await syncDocumentToIndex(adapter, collection, doc, 'update', tableConfig, { forceReindex: true })
          }

          const tableConfig = resolveTableConfig(tableConfigs)
          const status = tableConfig ? await checkSyncStatus(adapter, collection, doc, tableConfig) : undefined

          return Response.json({ success: true, status: status?.status ?? 'synced' })
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
        }
      }
    }
  ]
}
