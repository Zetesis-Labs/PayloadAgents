import type { Payload } from 'payload'
import type { Book } from '@/payload-types'
import { ensureTaxonomiesExist, ensureTenantExists } from './shared'

export const seedBook =
  (
    payload: Payload,
    mode: 'create' | 'upsert',
    options?: { skipIndexSync?: boolean; overrideAttributes?: { tenantId?: number } }
  ) =>
  async (bookData: Book) => {
    const logger = payload.logger

    logger.debug(`Processing book ${bookData.id} with slug ${bookData.slug}`)

    try {
      // Check if book exists
      const existingBooks = await payload.find({
        collection: 'books',
        where: {
          id: {
            equals: bookData.id
          }
        },
        limit: 1
      })

      const existingBook = existingBooks.docs[0]

      // If exists and mode is 'create', skip
      if (existingBook && mode === 'create') {
        logger.debug(`Book ${bookData.id} ya existe y modo es 'create', saltando...`)
        return
      }

      // Ensure related data exists
      const tenantId = options?.overrideAttributes?.tenantId ?? (await ensureTenantExists(payload, bookData.tenant))
      const categoryIds = await ensureTaxonomiesExist(payload, bookData.categories)

      // Prepare the data to insert/update
      const bookPayload = {
        tenant: tenantId,
        title: bookData.title,
        generateSlug: bookData.generateSlug,
        slug: bookData.slug,
        publishedAt: bookData.publishedAt,
        categories: categoryIds.length > 0 ? categoryIds : undefined,
        chapters: bookData.chapters
      }

      if (existingBook) {
        // Update existing book
        await payload.update({
          collection: 'books',
          id: existingBook.id,
          data: bookPayload,
          context: { skipIndexSync: options?.skipIndexSync }
        })
        logger.debug(`Book ${bookData.id} actualizado`)
      } else {
        // Create new book
        await payload.create({
          collection: 'books',
          data: {
            ...bookPayload,
            id: bookData.id
          },
          context: { skipIndexSync: options?.skipIndexSync }
        })
        logger.debug(`Nuevo book creado con ID: ${bookData.id}`)
      }
    } catch (error: any) {
      logger.error(`Error al procesar book ${bookData.id}:`, error)
      throw error
    }
  }
