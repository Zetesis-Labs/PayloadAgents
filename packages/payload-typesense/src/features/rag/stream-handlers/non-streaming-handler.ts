/**
 * Non-streaming response handler
 *
 * Handles non-streaming (regular JSON) responses from Typesense conversational search
 */

import { logger } from '../../../core/logging/logger'
import type { ChunkSource, SpendingEntry, TypesenseRAGSearchResult } from '../../../shared/index'
import { buildContextText, extractSourcesFromResults } from '../stream-handler'
import { sendSSEEvent } from '../utils/sse-utils'
import { estimateTokensFromText, resolveDocumentType } from './utils'

/**
 * Default implementation for handling non-streaming responses
 */
export async function defaultHandleNonStreamingResponse(
  data: Record<string, unknown>,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
): Promise<{
  fullAssistantMessage: string
  conversationId: string | null
  sources: ChunkSource[]
  llmSpending: SpendingEntry
}> {
  logger.debug('Using non-streaming fallback for response handling')

  // Type assertion for accessing known properties from the Typesense response
  const typedData = data as {
    conversation?: { conversation_id?: string; answer?: string }
    conversation_id?: string
    response?: string
    message?: string
    results?: unknown[]
  }

  let conversationId: string | null = null
  if (typedData.conversation?.conversation_id) {
    conversationId = typedData.conversation.conversation_id
  } else if (typedData.conversation_id) {
    conversationId = typedData.conversation_id
  }

  let fullAnswer = ''
  if (typedData.conversation?.answer) {
    fullAnswer = typedData.conversation.answer
  } else if (typedData.response || typedData.message) {
    fullAnswer = typedData.response || typedData.message || ''
  }

  const sources = extractSourcesFromResults(
    (typedData.results || []) as TypesenseRAGSearchResult[],
    resolveDocumentType
  )
  const contextText = buildContextText((typedData.results || []) as TypesenseRAGSearchResult[])

  // Simulate streaming by sending tokens word by word
  if (fullAnswer) {
    const words = fullAnswer.split(' ')
    for (let i = 0; i < words.length; i++) {
      const token = i === 0 ? words[i] : ' ' + words[i]
      if (token) {
        sendSSEEvent(controller, encoder, { type: 'token', data: token })
      }
    }
  }

  if (conversationId) {
    sendSSEEvent(controller, encoder, {
      type: 'conversation_id',
      data: conversationId
    })
  }

  if (sources.length > 0) {
    sendSSEEvent(controller, encoder, { type: 'sources', data: sources })
  }

  sendSSEEvent(controller, encoder, { type: 'done', data: '' })

  // Estimate LLM tokens
  const llmInputTokens = estimateTokensFromText(contextText)
  const llmOutputTokens = estimateTokensFromText(fullAnswer)

  const llmSpending: SpendingEntry = {
    service: 'openai_llm',
    model: 'gpt-4o-mini',
    tokens: {
      input: llmInputTokens,
      output: llmOutputTokens,
      total: llmInputTokens + llmOutputTokens
    },
    cost_usd: llmInputTokens * 0.00000015 + llmOutputTokens * 0.0000006,
    timestamp: new Date().toISOString()
  }

  return {
    fullAssistantMessage: fullAnswer,
    conversationId,
    sources,
    llmSpending
  }
}
