'use server'

import fs from 'node:fs'
import path from 'node:path'
import type { PayloadDocument } from '@nexo-labs/payload-indexer'
import { createEmbeddingService, createLogger, syncDocumentToIndex } from '@nexo-labs/payload-indexer'
import { createTypesenseAdapter } from '@nexo-labs/payload-typesense'
import type { Payload } from 'payload'
import { getPayload } from '@/modules/get-payload'
import { collections } from '@/payload/plugins/typesense/collections'
import { embeddingConfig, typesenseConnection } from '@/payload/plugins/typesense/config'
import type { Book, Post } from '@/payload-types'
import { seedBook } from '@/seed/book.seed'
import { seedPost } from '@/seed/post.seed'
import type { CollectionTarget, ImportMode, ImportResult, SyncResults } from './admin-types'

// Re-export types for consumers
export type { CollectionTarget } from './admin-types'

// Process entries in batches to avoid memory issues
const BATCH_SIZE = 50

/**
 * Convert Payload document to indexable format
 */
const toIndexableDocument = <T extends { id: number | string }>(doc: T): PayloadDocument => {
  const record = doc as unknown as Record<string, unknown>
  return {
    ...record,
    id: String(doc.id),
    slug: typeof record.slug === 'string' ? record.slug : undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  } as PayloadDocument
}

/**
 * Sync all documents of a collection to Typesense (all table configs: chunked + full)
 */
async function syncCollectionToTypesense(payload: Payload, collectionSlug: CollectionTarget): Promise<SyncResults> {
  const adapter = createTypesenseAdapter(typesenseConnection)
  const tableConfigs = collections[collectionSlug]

  if (!tableConfigs || tableConfigs.length === 0) {
    throw new Error(`${collectionSlug} collection is not configured for indexing`)
  }

  const enabledConfigs = tableConfigs.filter(tc => tc.enabled)
  if (enabledConfigs.length === 0) {
    throw new Error(`No enabled table configs for ${collectionSlug}`)
  }

  const logger = createLogger({ prefix: '[Agent Data Sync]' })
  const embeddingService = createEmbeddingService(embeddingConfig, logger)

  const response = await payload.find({
    collection: collectionSlug,
    limit: 0,
    depth: 1,
    overrideAccess: true // Bypass tenant filtering to sync all documents across all tenants
  })

  const results: SyncResults = { synced: 0, errors: [] }

  payload.logger.info(
    `[Agent Data Sync] Starting sync of ${response.totalDocs} ${collectionSlug} to Typesense (${enabledConfigs.length} tables)...`
  )

  for (const doc of response.docs) {
    try {
      const indexableDoc = toIndexableDocument(doc)
      for (const tableConfig of enabledConfigs) {
        await syncDocumentToIndex(
          adapter,
          collectionSlug,
          indexableDoc,
          'update',
          tableConfig,
          tableConfig.embedding ? embeddingService : undefined
        )
      }
      results.synced++
    } catch (error: unknown) {
      const errorMsg = `${doc.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
      results.errors.push(errorMsg)
      payload.logger.error(`[Agent Data Sync] Error syncing ${collectionSlug} ${errorMsg}`)
    }
  }

  payload.logger.info(`[Agent Data Sync] Completed: ${results.synced} synced, ${results.errors.length} errors`)

  return results
}

/**
 * Core import logic: batch-process entries through the appropriate seeder,
 * then optionally sync to Typesense.
 */
async function processImportEntries(
  payload: Payload,
  entries: (Post | Book)[],
  collection: CollectionTarget,
  mode: ImportMode,
  logPrefix: string,
  overrideAttributes?: { tenantId?: number }
): Promise<Pick<ImportResult, 'results' | 'syncResults' | 'needsSync'>> {
  payload.logger.info(
    `${logPrefix} Found ${entries.length} entries to process as ${collection} (index sync disabled for speed)`
  )

  const results = {
    imported: 0,
    skipped: 0,
    errors: [] as string[]
  }

  const seeder =
    collection === 'books'
      ? seedBook(payload, 'upsert', { skipIndexSync: true, overrideAttributes })
      : seedPost(payload, 'upsert', { skipIndexSync: true, overrideAttributes })

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(entries.length / BATCH_SIZE)

    payload.logger.info(`${logPrefix} Processing batch ${batchNum}/${totalBatches}`)

    for (const entry of batch) {
      try {
        await seeder(entry as Post & Book)
        results.imported++
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        results.errors.push(`Entry ${entry.id}: ${errorMsg}`)
        payload.logger.error(`${logPrefix} Error processing entry ${entry.id}: ${errorMsg}`)
      }
    }
  }

  let syncResults: SyncResults | undefined
  if (mode === 'import-sync') {
    payload.logger.info(`${logPrefix} Import done. Starting Typesense sync for ${collection}...`)
    syncResults = await syncCollectionToTypesense(payload, collection)
  }

  payload.logger.info(`${logPrefix} Completed: ${results.imported} imported, ${results.errors.length} errors.`)

  return { results, syncResults, needsSync: mode === 'import' }
}

/**
 * Handle sync-only mode (shared by both public functions)
 */
async function handleSyncOnly(
  payload: Payload,
  collection: CollectionTarget,
  logPrefix: string
): Promise<ImportResult> {
  payload.logger.info(`${logPrefix} Starting sync-only mode for ${collection}`)
  const syncResults = await syncCollectionToTypesense(payload, collection)
  return {
    success: true,
    message: `Sync completed: ${syncResults.synced} synced, ${syncResults.errors.length} errors`,
    syncResults
  }
}

/**
 * Import data for a specific agent (from uploaded JSON or data file on disk)
 */
export async function importAgentData({
  agentId,
  mode = 'import',
  jsonContent,
  collection = 'posts',
  overrideAttributes
}: {
  agentId: string | number
  mode?: ImportMode
  jsonContent?: string
  collection?: CollectionTarget
  overrideAttributes?: { tenantId?: number }
}): Promise<ImportResult> {
  const payload = await getPayload()
  const logPrefix = '[Agent Data Import]'

  try {
    if (mode === 'sync') {
      return await handleSyncOnly(payload, collection, logPrefix)
    }

    const agent = await payload.findByID({
      collection: 'agents',
      id: agentId
    })

    if (!agent) {
      return { success: false, message: 'Agent not found' }
    }

    const slug = agent.slug as string
    const name = ((agent.name as string) || '').toLowerCase().replace(/\s+/g, '_')
    payload.logger.info(`${logPrefix} Starting ${collection} import for agent: ${slug}`)

    let entries: (Post | Book)[]
    let dataFileName: string

    if (jsonContent) {
      payload.logger.info(`${logPrefix} Using uploaded JSON content`)
      const parsed = JSON.parse(jsonContent)
      entries = Array.isArray(parsed) ? parsed : [parsed]
      dataFileName = 'uploaded'
    } else {
      const possiblePaths = [
        path.join(process.cwd(), 'data', `${slug}_data.json`),
        path.join(process.cwd(), 'data', `${name}_data.json`)
      ]

      let dataFilePath: string | null = null
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          dataFilePath = p
          break
        }
      }

      if (!dataFilePath) {
        return {
          success: false,
          message: `Data file not found. Expected: ${slug}_data.json in /data folder`
        }
      }

      payload.logger.info(`${logPrefix} Found data file: ${dataFilePath}`)

      const fileContent = fs.readFileSync(dataFilePath, 'utf-8')
      const parsed = JSON.parse(fileContent)
      entries = Array.isArray(parsed) ? parsed : [parsed]
      dataFileName = path.basename(dataFilePath)
    }

    const importResult = await processImportEntries(payload, entries, collection, mode, logPrefix, overrideAttributes)

    return {
      success: true,
      message:
        mode === 'import-sync'
          ? 'Import and sync completed.'
          : 'Import completed. Use sync endpoint to index documents.',
      agentSlug: slug,
      dataFile: dataFileName,
      totalEntries: entries.length,
      ...importResult
    }
  } catch (error) {
    payload.logger.error(`${logPrefix} Fatal error: ${error}`)
    return {
      success: false,
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Import data for a collection (from uploaded JSON, no agent context)
 */
export async function importCollectionData({
  jsonContent,
  collection = 'posts',
  mode = 'import',
  overrideAttributes
}: {
  jsonContent?: string
  collection?: CollectionTarget
  mode?: ImportMode
  overrideAttributes?: { tenantId?: number }
}): Promise<ImportResult> {
  const payload = await getPayload()
  const logPrefix = '[Collection Import]'

  try {
    if (mode === 'sync') {
      return await handleSyncOnly(payload, collection, logPrefix)
    }

    if (!jsonContent) {
      return { success: false, message: 'Se requiere un archivo JSON para importar' }
    }

    const parsed = JSON.parse(jsonContent)
    const entries: (Post | Book)[] = Array.isArray(parsed) ? parsed : [parsed]

    const importResult = await processImportEntries(payload, entries, collection, mode, logPrefix, overrideAttributes)

    return {
      success: true,
      message: mode === 'import-sync' ? 'Import and sync completed.' : 'Import completed.',
      totalEntries: entries.length,
      ...importResult
    }
  } catch (error) {
    payload.logger.error(`${logPrefix} Fatal error: ${error}`)
    return {
      success: false,
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}
