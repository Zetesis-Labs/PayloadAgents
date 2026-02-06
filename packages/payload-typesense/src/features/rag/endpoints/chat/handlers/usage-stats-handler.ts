import type { Payload } from 'payload'
import { logger } from '../../../../../core/logging/logger'
import type { SpendingEntry, SSEEvent } from '../../../../../shared/index'
import type { ChatEndpointConfig } from '../route'

/**
 * Calculates total usage from spending entries
 */
export function calculateTotalUsage(spendingEntries: SpendingEntry[]): {
  totalTokens: number
  totalCostUSD: number
} {
  const totalTokensUsed = spendingEntries.reduce((sum, entry) => sum + entry.tokens.total, 0)
  const totalCostUSD = spendingEntries.reduce((sum, entry) => sum + (entry.cost_usd || 0), 0)

  logger.info('Total token usage calculated', {
    totalTokens: totalTokensUsed,
    totalCostUsd: totalCostUSD
  })

  return { totalTokens: totalTokensUsed, totalCostUSD }
}

/**
 * Sends usage statistics event to client
 */
export async function sendUsageStatsIfNeeded(
  config: ChatEndpointConfig,
  payload: Payload,
  userId: string | number,
  totalTokens: number,
  totalCostUSD: number,
  sendEvent: (event: SSEEvent) => void
): Promise<void> {
  if (!config.getUserUsageStats) {
    return
  }

  const usageStats = await config.getUserUsageStats(payload, userId)

  sendEvent({
    type: 'usage',
    data: {
      tokens_used: totalTokens,
      cost_usd: totalCostUSD,
      daily_limit: usageStats.limit,
      daily_used: usageStats.used,
      daily_remaining: usageStats.remaining,
      reset_at: usageStats.reset_at
    }
  })
}
