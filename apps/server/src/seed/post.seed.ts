import type { Payload } from 'payload'
import type { Post } from '@/payload-types'
import { ensureTaxonomiesExist, ensureTenantExists } from './shared'

export const seedPost =
  (
    payload: Payload,
    mode: 'create' | 'upsert',
    options?: { skipIndexSync?: boolean; overrideAttributes?: { tenantId?: number } }
  ) =>
  async (postData: Post) => {
    const logger = payload.logger

    logger.debug(`Processing post ${postData.id} with slug ${postData.slug}`)

    try {
      // Check if post exists
      const existingPosts = await payload.find({
        collection: 'posts',
        where: {
          id: {
            equals: postData.id
          }
        },
        limit: 1
      })

      const existingPost = existingPosts.docs[0]

      // If exists and mode is 'create', skip
      if (existingPost && mode === 'create') {
        logger.debug(`Post ${postData.id} ya existe y modo es 'create', saltando...`)
        return
      }

      // Ensure related data exists
      const tenantId = options?.overrideAttributes?.tenantId ?? (await ensureTenantExists(payload, postData.tenant))
      const categoryIds = await ensureTaxonomiesExist(payload, postData.categories)

      // Prepare the data to insert/update
      const postPayload = {
        tenant: tenantId,
        title: postData.title,
        generateSlug: postData.generateSlug,
        slug: postData.slug,
        external_id: postData.external_id,
        url: postData.url,
        publishedAt: postData.publishedAt,
        content: postData.content,
        categories: categoryIds.length > 0 ? categoryIds : undefined,
        related_links_videos: postData.related_links_videos,
        related_links_books: postData.related_links_books,
        related_links_other: postData.related_links_other
      }

      if (existingPost) {
        // Update existing post
        await payload.update({
          collection: 'posts',
          id: existingPost.id,
          data: postPayload,
          context: { skipIndexSync: options?.skipIndexSync }
        })
        logger.debug(`Post ${postData.id} actualizado`)
      } else {
        // Create new post
        await payload.create({
          collection: 'posts',
          data: {
            ...postPayload,
            id: postData.id
          },
          context: { skipIndexSync: options?.skipIndexSync }
        })
        logger.debug(`Nuevo post creado con ID: ${postData.id}`)
      }
    } catch (error: any) {
      logger.error(`Error al procesar post ${postData.id}:`, error)
      throw error
    }
  }
