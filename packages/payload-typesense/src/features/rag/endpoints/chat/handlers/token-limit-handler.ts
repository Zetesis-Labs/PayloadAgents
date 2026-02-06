import type { Payload } from 'payload'
import { logger } from '../../../../../core/logging/logger'
import type { ChatEndpointConfig } from '../route'
import { jsonResponse } from '../validators/index'

/**
 * Checks token limits before processing request
 */
export async function checkTokenLimitsIfNeeded(
  config: ChatEndpointConfig,
  payload: Payload,
  userId: string | number,
  userEmail: string,
  userMessage: string
): Promise<Response | null> {
  if (!config.estimateTokensFromText || !config.checkTokenLimit) {
    return null // No token limit check needed
  }

  const estimatedEmbeddingTokens = config.estimateTokensFromText(userMessage)
  const estimatedLLMTokens = config.estimateTokensFromText(userMessage) * 10
  const estimatedTotalTokens = estimatedEmbeddingTokens + estimatedLLMTokens

  const limitCheck = await config.checkTokenLimit(payload, userId, estimatedTotalTokens)

  if (!limitCheck.allowed) {
    logger.warn('Token limit exceeded for user', {
      userId,
      limit: limitCheck.limit,
      used: limitCheck.used,
      remaining: limitCheck.remaining
    })
    return jsonResponse(
      {
        error: 'Has alcanzado tu límite diario de tokens.',
        limit_info: {
          limit: limitCheck.limit,
          used: limitCheck.used,
          remaining: limitCheck.remaining,
          reset_at: limitCheck.reset_at
        }
      },
      { status: 429 }
    )
  }

  logger.info('Chat request started with token limit check passed', {
    userId,
    userEmail,
    limit: limitCheck.limit,
    used: limitCheck.used,
    remaining: limitCheck.remaining
  })

  return null // Token limit passed
}
