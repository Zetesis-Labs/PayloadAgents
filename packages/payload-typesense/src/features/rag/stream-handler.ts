/**
 * Stream handler utilities for Typesense Conversational RAG SSE events
 */

import { logger } from '../../core/logging/logger'
import type { ChunkSource, TypesenseRAGChunkDocument, TypesenseRAGSearchResult } from '../../shared/index'

/**
 * Parsed conversation event from Typesense SSE stream
 */
export interface ConversationEvent {
  /** Conversation ID */
  conversationId?: string
  /** Message token/chunk */
  message?: string
  /** Search results (only in first event) */
  results?: TypesenseRAGSearchResult[]
  /** Raw parsed data */
  raw?: unknown
}

/**
 * Stream processing result
 */
export interface StreamProcessingResult {
  /** Full assistant message */
  fullMessage: string
  /** Conversation ID */
  conversationId: string | null
  /** Extracted sources */
  sources: ChunkSource[]
  /** Context text (for token estimation) */
  contextText: string
}

/**
 * Parse a single SSE event from Typesense conversation stream
 *
 * @param line - Raw SSE event line
 * @returns Parsed conversation event or null if not parseable
 */
export function parseConversationEvent(line: string): ConversationEvent | null {
  if (!line.startsWith('data: ')) {
    return null
  }

  const data = line.slice(6)

  if (data === '[DONE]') {
    return { raw: '[DONE]' }
  }

  try {
    const parsed = JSON.parse(data)
    const event: ConversationEvent = { raw: parsed }

    // Extract conversation ID
    if (parsed.conversation_id) {
      event.conversationId = parsed.conversation_id
    } else if (parsed.conversation?.conversation_id) {
      event.conversationId = parsed.conversation.conversation_id
    }

    // Extract message/token
    if (parsed.message !== undefined) {
      event.message = parsed.message
    } else if (parsed.conversation?.answer) {
      event.message = parsed.conversation.answer
    }

    // Extract results (usually in first event)
    if (parsed.results) {
      event.results = parsed.results
    }

    return event
  } catch (e) {
    logger.error('Error parsing SSE data from conversation stream', e as Error)
    return null
  }
}

/**
 * Extract sources from Typesense search results
 *
 * @param results - Typesense multi-search results array
 * @param documentTypeResolver - Optional function to resolve document type from collection name
 * @returns Array of chunk sources with metadata
 */
export function extractSourcesFromResults(
  results: TypesenseRAGSearchResult[],
  documentTypeResolver?: (collectionName: string) => string
): ChunkSource[] {
  const allSources: ChunkSource[] = []

  for (const result of results) {
    if (result.hits) {
      for (const hit of result.hits) {
        const doc = hit.document as TypesenseRAGChunkDocument
        const score = hit.vector_distance || hit.text_match || 0
        const collectionName = result.request_params?.collection_name || ''

        const type = documentTypeResolver
          ? documentTypeResolver(collectionName)
          : getDefaultDocumentType(collectionName)

        const fullContent = doc.chunk_text || ''

        const source: ChunkSource = {
          id: doc.id || '',
          title: doc.title || 'Sin título',
          slug: doc.slug || '',
          type,
          chunkIndex: doc.chunk_index ?? 0,
          relevanceScore: score,
          content: '', // Empty by default - can be loaded separately
          excerpt: fullContent.substring(0, 200) + (fullContent.length > 200 ? '...' : '')
        }

        allSources.push(source)
      }
    }
  }

  return allSources
}

/**
 * Build context text from results (useful for token estimation)
 *
 * @param results - Typesense multi-search results array
 * @returns Combined context text from all chunks
 */
export function buildContextText(results: TypesenseRAGSearchResult[]): string {
  let contextText = ''

  for (const result of results) {
    if (result.hits) {
      for (const hit of result.hits) {
        const doc = hit.document as TypesenseRAGChunkDocument
        contextText += (doc.chunk_text || '') + '\n'
      }
    }
  }

  return contextText
}

/**
 * Process a Typesense conversation stream
 *
 * @param response - Fetch Response with SSE stream
 * @param onEvent - Callback for each parsed event
 * @param documentTypeResolver - Optional function to resolve document type
 * @returns Processing result with full message, ID, and sources
 */
export async function processConversationStream(
  response: Response,
  onEvent?: (event: ConversationEvent) => void,
  documentTypeResolver?: (collectionName: string) => string
): Promise<StreamProcessingResult> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()

  let buffer = ''
  let sources: ChunkSource[] = []
  let hasCollectedSources = false
  let conversationId: string | null = null
  let contextText = ''
  let fullMessage = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const event = parseConversationEvent(line)
      if (!event) continue

      // Notify callback
      if (onEvent) {
        onEvent(event)
      }

      // Capture conversation ID
      if (!conversationId && event.conversationId) {
        conversationId = event.conversationId
      }

      // Extract sources from first results
      if (!hasCollectedSources && event.results) {
        sources = extractSourcesFromResults(event.results, documentTypeResolver)
        contextText = buildContextText(event.results)
        hasCollectedSources = true
      }

      // Accumulate message
      if (event.message) {
        fullMessage += event.message
      }
    }
  }

  return {
    fullMessage,
    conversationId,
    sources,
    contextText
  }
}

/**
 * Create a ReadableStream that forwards SSE events
 *
 * @param response - Fetch Response with SSE stream
 * @param onData - Callback for processing each event before forwarding
 * @returns ReadableStream for SSE events
 */
export function createSSEForwardStream(
  response: Response,
  onData?: (event: ConversationEvent) => void
): ReadableStream<Uint8Array> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  let buffer = ''

  return new ReadableStream({
    async start(controller) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          controller.close()
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const event = parseConversationEvent(line)

          if (event && onData) {
            onData(event)
          }

          // Forward original line
          if (line) {
            controller.enqueue(encoder.encode(line + '\n'))
          }
        }
      }
    },
    cancel() {
      reader.cancel()
    }
  })
}

/**
 * Default document type resolver based on collection name
 *
 * @param collectionName - Name of the Typesense collection
 * @returns Document type string
 */
function getDefaultDocumentType(collectionName: string): string {
  if (collectionName.includes('article')) {
    return 'article'
  }
  if (collectionName.includes('book')) {
    return 'book'
  }
  if (collectionName.includes('post')) {
    return 'post'
  }
  if (collectionName.includes('page')) {
    return 'page'
  }
  return 'document'
}
