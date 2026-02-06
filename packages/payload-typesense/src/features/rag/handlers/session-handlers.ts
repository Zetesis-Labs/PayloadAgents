/**
 * Session management handlers
 *
 * Handles all chat session operations including getting, saving, and closing sessions
 */

import type { CollectionSlug, Payload } from 'payload'

/**
 * Session data structure
 */
export type ChatSessionData = {
  conversation_id: string
  title?: string
  messages: Array<Record<string, unknown>>
  status: string
  total_tokens?: number
  total_cost?: number
  last_activity?: string
}

/**
 * Configuration for session operations
 */
export type SessionConfig<TSlug extends CollectionSlug> = {
  /** Collection name for sessions */
  collectionName?: TSlug
  /** Time window for active sessions in milliseconds */
  activeSessionWindow?: number
}

/**
 * Get active chat session for a user
 *
 * @param payload - Payload CMS instance
 * @param userId - User ID
 * @param config - Session configuration
 * @returns Promise with session data or null
 */
export async function getActiveSession<TSlug extends CollectionSlug>(
  payload: Payload,
  userId: string | number,
  config: SessionConfig<TSlug> = {}
): Promise<ChatSessionData | null> {
  const collectionName = config.collectionName
  if (!collectionName) {
    throw new Error('Collection name is required to get active session')
  }
  const windowMs = config.activeSessionWindow || 24 * 60 * 60 * 1000 // 24 hours default

  const cutoffTime = new Date(Date.now() - windowMs)

  const chatSessions = await payload.find({
    collection: collectionName,
    where: {
      and: [
        {
          user: {
            equals: userId
          }
        },
        {
          status: {
            equals: 'active'
          }
        },
        {
          last_activity: {
            greater_than: cutoffTime.toISOString()
          }
        }
      ]
    },
    sort: '-last_activity',
    limit: 1
  })

  if (!chatSessions.docs.length) {
    return null
  }

  return chatSessions.docs[0] as unknown as ChatSessionData
}

/**
 * Get session by conversation ID
 *
 * @param payload - Payload CMS instance
 * @param userId - User ID
 * @param conversationId - Conversation ID
 * @param config - Session configuration
 * @returns Promise with session data or null
 */
export async function getSessionByConversationId<TSlug extends CollectionSlug>(
  payload: Payload,
  userId: string | number,
  conversationId: string,
  config: SessionConfig<TSlug> = {}
): Promise<ChatSessionData | null> {
  const collectionName = config.collectionName
  if (!collectionName) {
    throw new Error('Collection name is required to get a session by conversation ID')
  }

  const chatSessions = await payload.find({
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
    },
    limit: 1
  })

  if (!chatSessions.docs.length) {
    return null
  }

  return chatSessions.docs[0] as unknown as ChatSessionData
}

/**
 * Close a chat session
 *
 * @param payload - Payload CMS instance
 * @param userId - User ID
 * @param conversationId - Conversation ID
 * @param config - Session configuration
 * @returns Promise with updated session data or null if not found
 */
export async function closeSession<TSlug extends CollectionSlug>(
  payload: Payload,
  userId: string | number,
  conversationId: string,
  config: SessionConfig<TSlug> = {}
): Promise<ChatSessionData | null> {
  const collectionName = config.collectionName
  if (!collectionName) {
    throw new Error('Collection name is required to close a session')
  }
  const chatSessions = await payload.find({
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
    },
    limit: 1
  })

  if (!chatSessions.docs.length) {
    return null
  }

  const doc = chatSessions.docs[0]
  if (!doc) {
    return null
  }
  const session = doc as unknown as ChatSessionData

  await payload.update({
    collection: collectionName,
    id: doc.id,
    data: {
      status: 'closed',
      closed_at: new Date().toISOString()
    }
  } as Parameters<Payload['update']>[0])

  return {
    conversation_id: session.conversation_id,
    messages: session.messages || [],
    status: 'closed',
    total_tokens: session.total_tokens,
    total_cost: session.total_cost,
    last_activity: session.last_activity
  }
}

/**
 * Get user chat sessions
 *
 * @param payload - Payload CMS instance
 * @param userId - User ID
 * @param config - Session configuration
 * @returns Promise with list of sessions
 */
export async function getUserSessions<TSlug extends CollectionSlug>(
  payload: Payload,
  userId: string | number,
  config: SessionConfig<TSlug> = {}
): Promise<ChatSessionData[]> {
  const collectionName = config.collectionName
  if (!collectionName) {
    throw new Error('Collection name is required to get user sessions')
  }

  const chatSessions = await payload.find({
    collection: collectionName,
    where: {
      user: {
        equals: userId
      }
    },
    sort: '-last_activity',
    limit: 50
  })

  return chatSessions.docs.map(doc => ({
    ...doc,
    title: (doc as unknown as Record<string, unknown>).title as string | undefined
  })) as unknown as ChatSessionData[]
}

/**
 * Rename a chat session
 *
 * @param payload - Payload CMS instance
 * @param userId - User ID
 * @param conversationId - Conversation ID
 * @param newTitle - New title for the session
 * @param config - Session configuration
 * @returns Promise with updated session or null
 */
export async function renameSession<TSlug extends CollectionSlug>(
  payload: Payload,
  userId: string | number,
  conversationId: string,
  newTitle: string,
  config: SessionConfig<TSlug> = {}
): Promise<ChatSessionData | null> {
  const collectionName = config.collectionName
  if (!collectionName) {
    throw new Error('Collection name is required to rename a session')
  }

  const chatSessions = await payload.find({
    collection: collectionName,
    where: {
      and: [{ conversation_id: { equals: conversationId } }, { user: { equals: userId } }]
    },
    limit: 1
  })

  const doc = chatSessions.docs[0]
  if (!doc) return null

  const updated = await payload.update({
    collection: collectionName,
    id: doc.id,
    data: {
      title: newTitle
    }
  } as Parameters<Payload['update']>[0])

  return updated as unknown as ChatSessionData
}
