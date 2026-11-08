/**
 * Token usage query — reads daily consumption from Agno's session store.
 *
 * Agno (>= 3) persists one row per run in `agno.agno_runs`, with the run's
 * token metrics inside `run_data`. This module only reads; Agno is the single
 * source of truth for token consumption.
 *
 * Uses cost-weighted "effective tokens" instead of raw totals so the daily
 * budget reflects real spend. Cached input counts at 25% and output tokens
 * count at 100% (model-agnostic approximation — for precise per-model
 * weighting use `costBreakdown()` from cost-calculator.ts).
 *
 * The daily *limit* comes from the consumer via `getDailyLimit()` callback.
 */

import { sql } from 'drizzle-orm'
import type { Payload } from 'payload'
import type { DailyTokenUsage, TokenUsageResult } from '../types'

/**
 * Compute cost-weighted effective tokens from raw Agno metrics.
 *
 * Formula matches the one applied to the aggregated daily usage in
 * `getCurrentDailyUsage()`, so per-run estimates and the running daily
 * total stay in the same unit.
 */
export function effectiveTokensFromMetrics(metrics: {
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
}): number {
  const input = metrics.input_tokens ?? 0
  const output = metrics.output_tokens ?? 0
  const cacheRead = metrics.cache_read_tokens ?? 0
  const nonCachedInput = Math.max(0, input - cacheRead)
  return Math.ceil(nonCachedInput + cacheRead * 0.25 + output)
}

/** Drizzle handle from the Payload DB adapter. */
function getDrizzle(payload: Payload) {
  return (
    payload.db as unknown as {
      drizzle: { execute: (q: ReturnType<typeof sql>) => Promise<{ rows: Record<string, unknown>[] }> }
    }
  ).drizzle
}

/**
 * Query current daily token usage from Agno's session store.
 *
 * Extracts the full metrics breakdown (input, output, cached, reasoning)
 * and returns both raw totals and effective (cost-weighted) tokens.
 */
async function getCurrentDailyUsage(payload: Payload, userId: string | number): Promise<DailyTokenUsage> {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

  const todayEpoch = Math.floor(today.getTime() / 1000)
  const userIdStr = String(userId)

  try {
    const db = getDrizzle(payload)

    // Runs of the sessions the user opened today — the same window the
    // pre-Agno-3 query applied to the legacy `agno_sessions.runs` blob.
    const result = await db.execute(sql`
      SELECT
        COALESCE(SUM((r.run_data #>> '{metrics,input_tokens}')::int), 0) AS input_tokens,
        COALESCE(SUM((r.run_data #>> '{metrics,output_tokens}')::int), 0) AS output_tokens,
        COALESCE(SUM((r.run_data #>> '{metrics,cache_read_tokens}')::int), 0) AS cache_read_tokens,
        COALESCE(SUM((r.run_data #>> '{metrics,reasoning_tokens}')::int), 0) AS reasoning_tokens,
        COALESCE(SUM((r.run_data #>> '{metrics,total_tokens}')::int), 0) AS total_tokens
      FROM agno.agno_sessions s
      JOIN agno.agno_runs r ON r.session_id = s.session_id
      WHERE s.user_id = ${userIdStr}
        AND s.created_at >= ${todayEpoch}
    `)

    const row = result.rows[0] ?? {}
    const inputTokens = Number(row.input_tokens ?? 0)
    const outputTokens = Number(row.output_tokens ?? 0)
    const cacheReadTokens = Number(row.cache_read_tokens ?? 0)
    const reasoningTokens = Number(row.reasoning_tokens ?? 0)
    const totalTokens = Number(row.total_tokens ?? 0)

    const effectiveTokens = effectiveTokensFromMetrics({
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_tokens: cacheReadTokens
    })

    return {
      date: today.toISOString().split('T')[0] ?? '',
      tokens_used: effectiveTokens,
      raw_total_tokens: totalTokens,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_tokens: cacheReadTokens,
      reasoning_tokens: reasoningTokens,
      reset_at: tomorrow.toISOString()
    }
  } catch (error) {
    console.error('[Token Limits] Error querying Agno sessions:', error instanceof Error ? error.message : error)
    throw error
  }
}

/**
 * Get complete token usage for a user: current consumption + limit from consumer callback.
 */
export async function getTokenUsage(
  payload: Payload,
  userId: string | number,
  getDailyLimit: (payload: Payload, userId: string | number) => Promise<number>
): Promise<TokenUsageResult> {
  try {
    const limit = await getDailyLimit(payload, userId)
    const currentUsage = await getCurrentDailyUsage(payload, userId)

    const used = currentUsage.tokens_used
    const remaining = Math.max(0, limit - used)
    const percentage = limit > 0 ? Math.min(100, (used / limit) * 100) : 0

    return {
      limit,
      used,
      remaining,
      percentage,
      reset_at: currentUsage.reset_at,
      canUse: (tokens: number) => used + tokens <= limit
    }
  } catch (error) {
    console.error('[Token Usage] Error getting usage:', error)
    return {
      limit: 0,
      used: 0,
      remaining: 0,
      percentage: 0,
      reset_at: new Date().toISOString(),
      canUse: () => false
    }
  }
}
