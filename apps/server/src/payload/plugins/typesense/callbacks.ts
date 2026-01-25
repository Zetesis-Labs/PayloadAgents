/**
 * RAG Plugin Callbacks
 * Callbacks passed to the Typesense RAG plugin
 */

import type { Payload } from 'payload'
import { PayloadRequest } from 'payload'
import { saveChatSession } from '@nexo-labs/payload-typesense'
import { getPayload } from '@/modules/get-payload'
import { getTokenUsage } from './limits'
import { createEmbeddingSpending, estimateTokensFromText } from './token-utils'

// ============================================================================
// CALLBACKS
// ============================================================================

export const callbacks = {
  getPayload,

  checkPermissions: async (request: PayloadRequest) => {
    const payload = await getPayload()
    if (!request.user?.id) return false
    const user = await payload.findByID({
      collection: 'users',
      id: request.user.id,
      depth: 1,
    })
    return user !== null
  },

  /**
   * Check if user can use the specified tokens
   */
  checkTokenLimit: async (payload: Payload, userId: string | number, tokensToUse: number) => {
    const usage = await getTokenUsage(payload, userId)
    return {
      allowed: usage.canUse(tokensToUse),
      limit: usage.limit,
      used: usage.used,
      remaining: usage.remaining,
      reset_at: usage.reset_at,
    }
  },

  /**
   * Get user usage stats for displaying in UI
   */
  getUserUsageStats: async (payload: Payload, userId: string | number) => {
    const usage = await getTokenUsage(payload, userId)
    return {
      limit: usage.limit,
      used: usage.used,
      remaining: usage.remaining,
      reset_at: usage.reset_at,
    }
  },

  saveChatSession,
  createEmbeddingSpending,
  estimateTokensFromText,
}
