import type { CollectionSlug, Payload, PayloadRequest } from 'payload'
import { logger } from '../../../../../core/logging/logger'
import {
  getActiveSession,
  getSessionByConversationId,
  renameSession,
  type SessionConfig
} from '../../../handlers/session-handlers'
import { jsonResponse } from '../validators/index'

/**
 * Configuration for session endpoints
 */
export type SessionEndpointConfig<TSlug extends CollectionSlug> = {
  /** Get Payload instance */
  getPayload: () => Promise<Payload>
  checkPermissions: (request: PayloadRequest) => Promise<boolean>
  /** Session configuration */
  sessionConfig?: SessionConfig<TSlug>
}

/**
 * Create a parameterizable GET handler for session endpoint
 *
 * Query params:
 * - ?active=true → Get the most recent active session
 * - ?conversationId=xxx → Get a specific session by conversation ID
 */
export function createSessionGETHandler<TSlug extends CollectionSlug>(config: SessionEndpointConfig<TSlug>) {
  return async function GET(request: PayloadRequest) {
    try {
      if (!(await config.checkPermissions(request))) {
        return jsonResponse({ error: 'No tienes permisos para acceder a esta sesión.' }, { status: 403 })
      }
      const userId = request.user?.id

      if (!request.url || !userId) {
        return jsonResponse({ error: 'URL not found' }, { status: 400 })
      }

      const { searchParams } = new URL(request.url)
      const isActive = searchParams.get('active') === 'true'
      const conversationId = searchParams.get('conversationId')

      // Get Payload instance
      const payload = await config.getPayload()

      // Handle active session request
      if (isActive) {
        const session = await getActiveSession(payload, userId, config.sessionConfig)

        if (!session) {
          return jsonResponse({ error: 'No hay sesión activa.' }, { status: 404 })
        }

        return jsonResponse(session)
      }

      // Handle specific session request
      if (!conversationId) {
        return jsonResponse({ error: 'Se requiere conversationId o active=true.' }, { status: 400 })
      }

      const session = await getSessionByConversationId(payload, userId, conversationId, config.sessionConfig)

      if (!session) {
        return jsonResponse({ error: 'Sesión de chat no encontrada.' }, { status: 404 })
      }

      return jsonResponse(session)
    } catch (error) {
      logger.error('Error retrieving chat session', error as Error, {
        userId: request.user?.id
      })

      return jsonResponse(
        {
          error: 'Error al recuperar la sesión.',
          details: error instanceof Error ? error.message : 'Error desconocido'
        },
        { status: 500 }
      )
    }
  }
}

/**
 * Create a parameterizable DELETE handler for session endpoint
 *
 * DELETE /api/chat/session?conversationId=xxx
 * Close a chat session
 */
export function createSessionDELETEHandler<TSlug extends CollectionSlug>(config: SessionEndpointConfig<TSlug>) {
  return async function DELETE(request: PayloadRequest) {
    try {
      if (!(await config.checkPermissions(request))) {
        return jsonResponse({ error: 'No tienes permisos para acceder a esta sesión.' }, { status: 403 })
      }
      const userId = request.user?.id
      if (!request.url || !userId) {
        return jsonResponse({ error: 'URL not found' }, { status: 400 })
      }

      const { searchParams } = new URL(request.url)
      const conversationId = searchParams.get('conversationId')

      if (!conversationId) {
        return jsonResponse({ error: 'Se requiere un conversationId válido.' }, { status: 400 })
      }

      // Get Payload instance
      const payload = await config.getPayload()

      logger.info('Deleting chat session', { conversationId, userId })

      const collectionName = config.sessionConfig?.collectionName
      if (!collectionName) {
        throw new Error('Collection name is required to delete a session')
      }

      const result = await payload.delete({
        collection: collectionName,
        where: {
          and: [
            {
              conversation_id: {
                equals: conversationId
              }
            },
            {
              user: {
                equals: userId
              }
            }
          ]
        }
      })

      if (!result.docs || result.docs.length === 0) {
        return jsonResponse({ error: 'Sesión de chat no encontrada o no tienes permisos.' }, { status: 404 })
      }

      const _session = result.docs[0] as unknown as Record<string, unknown>

      logger.info('Chat session deleted successfully', {
        conversationId
      })

      return jsonResponse({
        success: true,
        message: 'Sesión eliminada correctamente',
        session: {
          conversation_id: conversationId,
          status: 'deleted'
        }
      })
    } catch (error) {
      logger.error('Error closing chat session', error as Error, {
        conversationId: request.url ? new URL(request.url).searchParams.get('conversationId') : undefined,
        userId: request.user?.id
      })

      return jsonResponse(
        {
          error: 'Error al cerrar la sesión. Por favor, inténtalo de nuevo.',
          details: error instanceof Error ? error.message : 'Error desconocido'
        },
        { status: 500 }
      )
    }
  }
}

/**
 * Create a parameterizable PATCH handler for session endpoint
 *
 * PATCH /api/chat/session?conversationId=xxx
 * Body: { title: "New Title" }
 * Rename a chat session
 */
export function createSessionPATCHHandler<TSlug extends CollectionSlug>(config: SessionEndpointConfig<TSlug>) {
  return async function PATCH(request: PayloadRequest) {
    try {
      if (!(await config.checkPermissions(request))) {
        return jsonResponse({ error: 'No tienes permisos para acceder a esta sesión.' }, { status: 403 })
      }
      const userId = request.user?.id
      if (!request.url || !userId) {
        return jsonResponse({ error: 'URL not found' }, { status: 400 })
      }

      const { searchParams } = new URL(request.url)
      const conversationId = searchParams.get('conversationId')

      if (!conversationId) {
        return jsonResponse({ error: 'Se requiere un conversationId válido.' }, { status: 400 })
      }

      const body = await request.json?.()
      const { title } = body

      if (!title || typeof title !== 'string') {
        return jsonResponse({ error: 'Se requiere un título válido.' }, { status: 400 })
      }

      // Get Payload instance
      const payload = await config.getPayload()

      // Import explicitly to avoid circular dependencies if possible, or use from imported module

      const session = await renameSession(payload, userId, conversationId, title, config.sessionConfig)

      if (!session) {
        return jsonResponse({ error: 'Sesión de chat no encontrada o no tienes permisos.' }, { status: 404 })
      }

      return jsonResponse({
        success: true,
        message: 'Sesión renombrada correctamente',
        session
      })
    } catch (error) {
      logger.error('Error renaming chat session', error as Error, {
        conversationId: request.url ? new URL(request.url).searchParams.get('conversationId') : undefined,
        userId: request.user?.id
      })

      return jsonResponse(
        {
          error: 'Error al renombrar la sesión.',
          details: error instanceof Error ? error.message : 'Error desconocido'
        },
        { status: 500 }
      )
    }
  }
}

/**
 * Default exports for Next.js App Router
 */
export { createSessionDELETEHandler as DELETE, createSessionGETHandler as GET, createSessionPATCHHandler as PATCH }
