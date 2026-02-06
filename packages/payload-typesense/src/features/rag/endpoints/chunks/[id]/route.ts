import type { PayloadRequest } from 'payload'
import { createTypesenseClient } from '../../../../../core/client/typesense-client'
import { logger } from '../../../../../core/logging/logger'
import { fetchChunkById, type TypesenseConnectionConfig } from '../../../index'
import { jsonResponse } from '../../chat/validators/index'

/**
 * Configuration for chunks endpoint
 */
export type ChunksEndpointConfig = {
  /** Typesense connection config */
  typesense: TypesenseConnectionConfig
  /** Check permissions function */
  checkPermissions: (request: PayloadRequest) => Promise<boolean>
  /** Valid collections for chunks */
  validCollections: string[]
}

/**
 * Validate the chunk request parameters.
 * Returns the validated id and collectionName, or a Response on error.
 */
function validateChunkRequest(
  request: PayloadRequest,
  validCollections: string[]
): { id: string; collectionName: string } | Response {
  if (!request.url || !request.user) {
    return jsonResponse({ error: 'URL not found' }, { status: 400 })
  }

  const id = request.routeParams?.id
  if (!id) {
    return jsonResponse({ error: 'Se requiere el ID del chunk' }, { status: 400 })
  }

  const url = new URL(request.url)
  const collectionName = url.searchParams.get('collection')
  if (!collectionName) {
    return jsonResponse(
      {
        error: 'Se requiere el parámetro collection',
        collections: validCollections
      },
      { status: 400 }
    )
  }

  return { id: id as string, collectionName }
}

/**
 * Map a caught error to the appropriate JSON response
 */
function mapChunkErrorToResponse(error: unknown, validCollections: string[]): Response {
  if (error instanceof Error) {
    if (error.message.includes('Invalid collection')) {
      return jsonResponse(
        {
          error: error.message,
          collections: validCollections
        },
        { status: 400 }
      )
    }
    if (error.message.includes('not found')) {
      return jsonResponse({ error: 'Chunk no encontrado' }, { status: 404 })
    }
  }

  return jsonResponse(
    {
      error: 'Error al obtener el chunk',
      details: error instanceof Error ? error.message : 'Error desconocido'
    },
    { status: 500 }
  )
}

/**
 * Create a parameterizable GET handler for chunks endpoint
 *
 * GET /api/chat/chunks/[id]?collection=article_web_chunk
 * Fetch the full chunk text from Typesense by document ID
 */
export function createChunksGETHandler(config: ChunksEndpointConfig) {
  return async function GET(request: PayloadRequest) {
    try {
      if (!(await config.checkPermissions(request))) {
        return jsonResponse({ error: 'No tienes permisos para acceder a este chunk.' }, { status: 403 })
      }

      const validated = validateChunkRequest(request, config.validCollections)
      if (validated instanceof Response) {
        return validated
      }

      const { id, collectionName } = validated

      // Get Typesense client
      const client = createTypesenseClient(config.typesense)

      // Use the parameterizable function from the package
      const chunkData = await fetchChunkById(client, {
        chunkId: id,
        collectionName,
        validCollections: config.validCollections
      })

      // Return the chunk data
      return jsonResponse(chunkData)
    } catch (error: unknown) {
      logger.error('Error fetching chunk', error as Error, {
        chunkId: request.routeParams?.id,
        collection: request.url ? new URL(request.url).searchParams.get('collection') : undefined
      })

      return mapChunkErrorToResponse(error, config.validCollections)
    }
  }
}

/**
 * Default export for Next.js App Router
 */
export { createChunksGETHandler as GET }
