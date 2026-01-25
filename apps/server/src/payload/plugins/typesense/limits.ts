/**
 * Token Limits Implementation
 * Implementation of token limit checking for chat-agent
 */

import type { Payload } from 'payload'
import { type SpendingEntry } from './token-utils'

// ============================================================================
// TYPES
// ============================================================================

export interface DailyTokenUsage {
  date: string
  tokens_used: number
  reset_at: string
}

export interface TokenUsageResult {
  limit: number
  used: number
  remaining: number
  percentage: number
  reset_at: string
  canUse: (tokens: number) => boolean
}

interface SessionWithSpending {
  spending?: SpendingEntry[]
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_LIMITS = {
  free: 10000,
  basic: 50000,
  pro: 200000,
  enterprise: 1000000,
} as const

// ============================================================================
// IMPLEMENTATIONS
// ============================================================================

/**
 * Get daily token limit for a user
 * For now, returns a fixed limit. Can be extended to check user roles or subscriptions.
 */
async function getUserDailyLimitImpl(payload: Payload, userId: string | number): Promise<number> {
  try {
    const user = await payload.findByID({
      collection: 'users',
      id: userId,
      depth: 1,
    })

    if (!user) return DEFAULT_LIMITS.free

    // Check if user has superadmin role
    const roles = (user as { roles?: string[] }).roles || []
    if (roles.includes('superadmin')) {
      return DEFAULT_LIMITS.enterprise
    }

    // Default limit for authenticated users
    return DEFAULT_LIMITS.basic
  } catch (error) {
    console.error('[Token Limits] Error getting user limit:', error)
    return DEFAULT_LIMITS.free
  }
}

/**
 * Get current daily usage for a user by querying chat-sessions
 */
async function getCurrentDailyUsageImpl(payload: Payload, userId: string | number): Promise<DailyTokenUsage> {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

  try {
    const sessions = await payload.find({
      collection: 'chat-sessions',
      where: { user: { equals: userId } },
      limit: 1000,
      pagination: false,
    })

    let totalTokens = 0
    for (const session of sessions.docs) {
      const spending = (session as SessionWithSpending).spending
      if (Array.isArray(spending)) {
        for (const entry of spending) {
          if (entry?.tokens?.total && new Date(entry.timestamp) >= today) {
            totalTokens += entry.tokens.total
          }
        }
      }
    }

    return {
      date: today.toISOString().split('T')[0] ?? '',
      tokens_used: totalTokens,
      reset_at: tomorrow.toISOString(),
    }
  } catch (error) {
    console.error('[Token Limits] Error calculating daily usage:', error)
    return {
      date: today.toISOString().split('T')[0] ?? '',
      tokens_used: 0,
      reset_at: tomorrow.toISOString(),
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Get complete token usage information for a user
 */
export async function getTokenUsage(payload: Payload, userId: string | number): Promise<TokenUsageResult> {
  try {
    const limit = await getUserDailyLimitImpl(payload, userId)
    const currentUsage = await getCurrentDailyUsageImpl(payload, userId)

    const used = currentUsage.tokens_used
    const remaining = Math.max(0, limit - used)
    const percentage = limit > 0 ? Math.min(100, (used / limit) * 100) : 0

    return {
      limit,
      used,
      remaining,
      percentage,
      reset_at: currentUsage.reset_at,
      canUse: (tokens: number) => used + tokens <= limit,
    }
  } catch (error) {
    console.error('[Token Usage] Error getting usage:', error)
    return {
      limit: 0,
      used: 0,
      remaining: 0,
      percentage: 0,
      reset_at: new Date().toISOString(),
      canUse: () => false,
    }
  }
}
