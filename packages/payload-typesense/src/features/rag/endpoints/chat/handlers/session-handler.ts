import type { Payload } from 'payload'
import { logger } from '../../../../../core/logging/logger'
import type { ChunkSource, SpendingEntry } from '../../../../../shared/index'
import type { ChatEndpointConfig } from '../route'

/**
 * Saves chat session if function is provided
 */
export async function saveChatSessionIfNeeded(
  config: ChatEndpointConfig,
  payload: Payload,
  userId: string | number,
  conversationId: string | null,
  userMessage: string,
  assistantMessage: string,
  sources: ChunkSource[],
  spendingEntries: SpendingEntry[],
  agentSlug?: string
): Promise<void> {
  if (!conversationId || !config.saveChatSession) {
    return
  }

  await config.saveChatSession(
    payload,
    userId,
    conversationId,
    userMessage,
    assistantMessage,
    sources,
    spendingEntries,
    config.collectionName,
    agentSlug
  )

  logger.info('Chat session saved to PayloadCMS', {
    conversationId,
    agentSlug
  })
}
