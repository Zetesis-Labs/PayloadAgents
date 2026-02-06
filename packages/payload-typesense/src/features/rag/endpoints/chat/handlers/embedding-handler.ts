import {
  EmbeddingServiceImpl,
  GeminiEmbeddingProvider,
  type GeminiProviderConfig,
  Logger,
  logger,
  OpenAIEmbeddingProvider,
  type OpenAIProviderConfig
} from '@nexo-labs/payload-indexer'
import type { SpendingEntry } from '../../../../../shared/index'
import type { ChatEndpointConfig } from '../route'

/**
 * Generates embedding and tracks usage
 */
export async function generateEmbeddingWithTracking(
  userMessage: string,
  config: ChatEndpointConfig,
  spendingEntries: SpendingEntry[]
): Promise<number[]> {
  logger.debug('Generating embeddings for semantic search')

  const embeddingConfig = config.embeddingConfig

  if (!embeddingConfig) {
    throw new Error('Embedding configuration missing')
  }

  let provider

  // Use the strongly typed nested provider configuration
  const providerType = embeddingConfig.type
  const apiKey = embeddingConfig.apiKey
  const model = embeddingConfig.model
  const dimensions = embeddingConfig.dimensions

  const serviceLogger = new Logger({
    enabled: true,
    prefix: '[rag-embedding]'
  })

  if (providerType === 'gemini') {
    provider = new GeminiEmbeddingProvider(
      {
        type: 'gemini',
        apiKey: apiKey,
        model: model,
        dimensions: dimensions
      } as GeminiProviderConfig,
      serviceLogger
    )
  } else {
    provider = new OpenAIEmbeddingProvider(
      {
        type: 'openai',
        apiKey: apiKey,
        model: model,
        dimensions: dimensions
      } as OpenAIProviderConfig,
      serviceLogger
    )
  }

  const service = new EmbeddingServiceImpl(provider, serviceLogger, embeddingConfig)

  // We need usage info. The new service interface returns only embedding or array of embeddings.
  // We need to extend service or provider to return usage or get it from provider directly.
  // Let's use provider directly for now to get usage which we know returns EmbeddingResult

  const resultWithUsage = await provider.generateEmbedding(userMessage)

  if (!resultWithUsage) {
    throw new Error('Failed to generate embedding')
  }

  // Track embedding spending if function provided
  // We use model from config or default

  if (config.createEmbeddingSpending) {
    const embeddingSpending = config.createEmbeddingSpending(model, resultWithUsage.usage.totalTokens)
    spendingEntries.push(embeddingSpending)

    logger.info('Embedding generated successfully', {
      model,
      totalTokens: resultWithUsage.usage.totalTokens,
      costUsd: embeddingSpending.cost_usd
    })
  }

  return resultWithUsage.embedding
}
