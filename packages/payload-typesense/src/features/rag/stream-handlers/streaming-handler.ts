/**
 * Streaming response handler
 *
 * Handles streaming responses from Typesense conversational search
 */

import { logger } from '../../../core/logging/logger'
import type { ChunkSource, SpendingEntry } from '../../../shared/index'
import type { ConversationEvent } from '../stream-handler'
import { buildContextText, extractSourcesFromResults, parseConversationEvent } from '../stream-handler'
import { sendSSEEvent } from '../utils/sse-utils'
import { estimateTokensFromText } from './utils'

/**
 * Mutable state accumulated during streaming
 */
interface StreamingState {
  sources: ChunkSource[]
  hasCollectedSources: boolean
  conversationId: string | null
  contextText: string
  fullAssistantMessage: string
}

/**
 * Handle a single parsed SSE event from the streaming response.
 * Updates the streaming state and sends SSE events to the client.
 */
function handleStreamEvent(
  event: ConversationEvent,
  state: StreamingState,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  documentTypeResolver?: (collectionName: string) => string
): void {
  // Handle [DONE] event
  if (event.raw === '[DONE]') {
    logger.info('[DONE] event received, sending done event to client')
    sendSSEEvent(controller, encoder, { type: 'done', data: '' })
    return
  }

  // Capture conversation_id
  if (!state.conversationId && event.conversationId) {
    state.conversationId = event.conversationId
    logger.info('Conversation ID captured', { conversationId: state.conversationId })
    sendSSEEvent(controller, encoder, {
      type: 'conversation_id',
      data: state.conversationId
    })
  }

  // Extract sources
  if (!state.hasCollectedSources && event.results) {
    state.sources = extractSourcesFromResults(event.results, documentTypeResolver)
    state.contextText = buildContextText(event.results)

    if (state.sources.length > 0) {
      logger.info('Sources extracted and sent', {
        sourceCount: state.sources.length
      })
      sendSSEEvent(controller, encoder, {
        type: 'sources',
        data: state.sources
      })
    }

    state.hasCollectedSources = true
  }

  // Stream conversation tokens
  if (event.message) {
    state.fullAssistantMessage += event.message
    logger.info('Token received', {
      tokenLength: event.message.length,
      totalMessageLength: state.fullAssistantMessage.length,
      token: event.message.substring(0, 50)
    })
    sendSSEEvent(controller, encoder, {
      type: 'token',
      data: event.message
    })
  }
}

/**
 * Calculate LLM spending based on context and response text
 */
function calculateLLMSpending(contextText: string, fullAssistantMessage: string): SpendingEntry {
  const llmInputTokens = estimateTokensFromText(contextText)
  const llmOutputTokens = estimateTokensFromText(fullAssistantMessage)

  const llmSpending: SpendingEntry = {
    service: 'openai_llm',
    model: 'gpt-4o-mini',
    tokens: {
      input: llmInputTokens,
      output: llmOutputTokens,
      total: llmInputTokens + llmOutputTokens
    },
    cost_usd: llmInputTokens * 0.00000015 + llmOutputTokens * 0.0000006, // gpt-4o-mini pricing
    timestamp: new Date().toISOString()
  }

  logger.info('LLM cost calculated', {
    inputTokens: llmInputTokens,
    outputTokens: llmOutputTokens,
    totalTokens: llmSpending.tokens.total,
    costUsd: llmSpending.cost_usd
  })

  return llmSpending
}

/**
 * Default implementation for handling streaming responses
 */
export async function defaultHandleStreamingResponse(
  response: Response,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  documentTypeResolver?: (collectionName: string) => string
): Promise<{
  fullAssistantMessage: string
  conversationId: string | null
  sources: ChunkSource[]
  llmSpending: SpendingEntry
}> {
  logger.debug('Starting streaming response handling')

  if (!response.body) {
    throw new Error('Response body is null')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const state: StreamingState = {
    sources: [],
    hasCollectedSources: false,
    conversationId: null,
    contextText: '',
    fullAssistantMessage: ''
  }

  try {
    let chunkCount = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        logger.info('Streaming response completed', {
          totalChunks: chunkCount,
          finalMessageLength: state.fullAssistantMessage.length
        })
        break
      }

      chunkCount++
      const chunkText = decoder.decode(value, { stream: true })
      buffer += chunkText
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      logger.info('Received chunk from Typesense', {
        chunkNumber: chunkCount,
        chunkSize: chunkText.length,
        linesInChunk: lines.length,
        bufferSize: buffer.length,
        firstLinePreview: lines[0]?.substring(0, 200)
      })

      for (const line of lines) {
        const event = parseConversationEvent(line)
        if (!event) {
          logger.info('Skipping line that could not be parsed', {
            line: line.substring(0, 100)
          })
          continue
        }

        handleStreamEvent(event, state, controller, encoder, documentTypeResolver)
      }
    }
  } finally {
    reader.releaseLock()
  }

  return {
    fullAssistantMessage: state.fullAssistantMessage,
    conversationId: state.conversationId,
    sources: state.sources,
    llmSpending: calculateLLMSpending(state.contextText, state.fullAssistantMessage)
  }
}
