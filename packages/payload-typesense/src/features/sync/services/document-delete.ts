import type { TableConfig } from '@nexo-labs/payload-indexer'
import type { Client } from 'typesense'
import { logger } from '../../../core/logging/logger'
import { getTypesenseCollectionName } from '../../../core/utils/naming'

/**
 * Deletes a document from Typesense
 * Handles both direct document deletion and chunk deletion
 */
export const deleteDocumentFromTypesense = async (
  typesenseClient: Client,
  collectionSlug: string,
  docId: string,
  tableConfig: TableConfig
) => {
  try {
    // Build table name from collection slug + tableSuffix
    const tableName = getTypesenseCollectionName(collectionSlug, tableConfig)

    logger.debug('Attempting to delete document from Typesense', {
      documentId: docId,
      collection: collectionSlug,
      tableName
    })

    // Try to delete the document directly first
    try {
      await typesenseClient.collections(tableName).documents(docId).delete()
      logger.info('Document deleted from Typesense', {
        documentId: docId,
        tableName
      })
    } catch (docDeleteError: unknown) {
      const typesenseError = docDeleteError as { httpStatus?: number }

      // If document doesn't exist, try to delete chunks by parent_doc_id
      if (typesenseError.httpStatus === 404) {
        logger.debug('Document not found, attempting to delete chunks', {
          documentId: docId,
          tableName
        })

        try {
          await typesenseClient
            .collections(tableName)
            .documents()
            .delete({
              filter_by: `parent_doc_id:${docId}`
            })
          logger.info('All chunks deleted for document', {
            documentId: docId,
            tableName
          })
        } catch (chunkDeleteError: unknown) {
          const chunkError = chunkDeleteError as { httpStatus?: number }

          // Ignore 404 errors (collection might not exist)
          if (chunkError.httpStatus !== 404) {
            logger.error('Failed to delete chunks for document', chunkDeleteError as Error, {
              documentId: docId,
              tableName
            })
          } else {
            logger.debug('No chunks found to delete', { documentId: docId })
          }
        }
      } else {
        throw docDeleteError
      }
    }
  } catch (error: unknown) {
    // Build table name for error message
    const tableName = getTypesenseCollectionName(collectionSlug, tableConfig)

    logger.error('Failed to delete document from Typesense', error as Error, {
      documentId: docId,
      collection: collectionSlug,
      tableName
    })

    // Note: We don't rethrow to allow the deletion process to continue
  }
}
