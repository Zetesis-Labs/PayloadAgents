/**
 * Chat Session Repository
 * Functions for managing chat sessions in PayloadCMS
 */

import type { CollectionSlug, Payload } from 'payload'
import { logger } from '../../core/logging/logger'
import type { ChunkSource, SpendingEntry } from '../../shared/index'
/**
 * Chat message format with optional sources
 */
export interface ChatMessageWithSources {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  sources?: Array<{
    id: string
    title: string
    type: string
    chunk_index: number
    slug?: string
  }>
}

/**
 * Chat session document structure
 */
interface ChatSessionDocument {
  id: string | number
  messages?: unknown
  spending?: unknown
  total_tokens?: number
  total_cost?: number
  conversation_id?: string
  status?: string
  last_activity?: Date | string
}

/**
 * Save or update chat session in PayloadCMS
 *
 * @param payload - Payload CMS instance
 * @param userId - User ID
 * @param conversationId - Conversation ID from Typesense
 * @param userMessage - User's message
 * @param assistantMessage - Assistant's response
 * @param sources - Source chunks used for the response
 * @param spending - Token spending entries
 * @param collectionName - Collection name for sessions (default: 'chat-sessions')
 * @param agentSlug - Slug of the agent used in this conversation (optional)
 */
export async function saveChatSession(
  payload: Payload,
  userId: string | number,
  conversationId: string,
  userMessage: string,
  assistantMessage: string,
  sources: ChunkSource[],
  spending: SpendingEntry[],
  collectionName: CollectionSlug,
  agentSlug?: string
): Promise<void> {
  try {
    // Check if session already exists
    const existing = await payload.find({
      collection: collectionName,
      where: {
        conversation_id: {
          equals: conversationId
        }
      },
      limit: 1
    })

    const newUserMessage: ChatMessageWithSources = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString()
    }

    const newAssistantMessage: ChatMessageWithSources = {
      role: 'assistant',
      content: assistantMessage,
      timestamp: new Date().toISOString(),
      sources: sources.map(s => ({
        id: s.id,
        title: s.title,
        type: s.type,
        chunk_index: s.chunkIndex,
        slug: s.slug
      }))
    }

    if (existing.docs.length > 0 && existing.docs[0]) {
      // Update existing session
      await updateExistingSession(
        payload,
        existing.docs[0] as ChatSessionDocument,
        newUserMessage,
        newAssistantMessage,
        spending,
        collectionName,
        agentSlug
      )
    } else {
      // Create new session
      await createNewSession(
        payload,
        userId,
        conversationId,
        newUserMessage,
        newAssistantMessage,
        spending,
        collectionName,
        agentSlug
      )
    }
  } catch (error) {
    logger.error('Error saving chat session', error as Error, {
      conversationId,
      userId
    })
    // Don't fail the request if saving fails
  }
}

/**
 * Update an existing chat session
 */
async function updateExistingSession<TSlug extends CollectionSlug>(
  payload: Payload,
  session: ChatSessionDocument,
  newUserMessage: ChatMessageWithSources,
  newAssistantMessage: ChatMessageWithSources,
  spending: SpendingEntry[],
  collectionName: TSlug,
  agentSlug?: string
): Promise<void> {
  const existingMessages = (session.messages as ChatMessageWithSources[]) || []
  const existingSpending = (session.spending as SpendingEntry[]) || []

  const messages = [...existingMessages, newUserMessage, newAssistantMessage]
  const allSpending = [...existingSpending, ...spending]
  const totalTokens = (session.total_tokens || 0) + spending.reduce((sum, e) => sum + e.tokens.total, 0)
  const totalCost = (session.total_cost || 0) + spending.reduce((sum, e) => sum + (e.cost_usd || 0), 0)

  await payload.update({
    collection: collectionName,
    id: session.id,
    data: {
      messages,
      spending: allSpending,
      total_tokens: totalTokens,
      total_cost: totalCost,
      last_activity: new Date().toISOString(),
      status: 'active',
      // Only update agentSlug if provided and session doesn't have one yet
      ...(agentSlug && !(session as unknown as Record<string, unknown>).agentSlug ? { agentSlug } : {})
    }
  } as Parameters<Payload['update']>[0])

  logger.info('Chat session updated successfully', {
    sessionId: session.id,
    conversationId: session.conversation_id,
    totalTokens,
    totalCost
  })
}

/**
 * Create a new chat session
 */
async function createNewSession(
  payload: Payload,
  userId: string | number,
  conversationId: string,
  newUserMessage: ChatMessageWithSources,
  newAssistantMessage: ChatMessageWithSources,
  spending: SpendingEntry[],
  collectionName: CollectionSlug,
  agentSlug?: string
): Promise<void> {
  const totalTokens = spending.reduce((sum, e) => sum + e.tokens.total, 0)
  const totalCost = spending.reduce((sum, e) => sum + (e.cost_usd || 0), 0)

  await payload.create({
    collection: collectionName,
    data: {
      user: typeof userId === 'string' ? Number(userId) : userId,
      conversation_id: conversationId,
      status: 'active',
      agentSlug,
      messages: [newUserMessage, newAssistantMessage],
      spending,
      total_tokens: totalTokens,
      total_cost: totalCost,
      last_activity: new Date().toISOString()
    }
  })

  logger.info('New chat session created successfully', {
    conversationId,
    userId,
    totalTokens,
    totalCost
  })
}

/**
 * Mark chat session as expired/closed
 * Called when Typesense returns "conversation_id is invalid"
 *
 * @param payload - Payload CMS instance
 * @param conversationId - Conversation ID that expired in Typesense
 * @param collectionName - Collection name for sessions
 * @returns true if session was found and marked as expired, false otherwise
 */
export async function markChatSessionAsExpired(
  payload: Payload,
  conversationId: string,
  collectionName: CollectionSlug
): Promise<boolean> {
  try {
    const existing = await payload.find({
      collection: collectionName,
      where: { conversation_id: { equals: conversationId } },
      limit: 1
    })

    if (existing.docs.length > 0 && existing.docs[0]) {
      await payload.update({
        collection: collectionName,
        id: existing.docs[0].id,
        data: {
          status: 'closed',
          closed_at: new Date().toISOString()
        } as Record<string, unknown>
      })

      logger.info('Chat session marked as expired', {
        conversationId,
        sessionId: existing.docs[0].id
      })

      return true
    }

    return false
  } catch (error) {
    logger.error('Error marking chat session as expired', error as Error, {
      conversationId
    })
    return false
  }
}
