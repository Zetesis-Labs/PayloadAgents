import { GoogleGenerativeAI, TaskType } from '@google/generative-ai'
import { logger, MIN_EMBEDDING_TEXT_LENGTH } from '@nexo-labs/payload-indexer'
import OpenAI from 'openai'
import type {
  BatchEmbeddingWithUsage,
  EmbeddingProviderConfig,
  EmbeddingWithUsage
} from '../../shared/types/plugin-types'

let openaiClient: OpenAI | null = null
let currentOpenAIApiKey: string | null = null

let geminiClient: GoogleGenerativeAI | null = null
let currentGeminiApiKey: string | null = null

const getOpenAIClient = (apiKey?: string): OpenAI | null => {
  const key = apiKey || process.env.OPENAI_API_KEY

  if (!key) {
    return null
  }

  // Recreate client if API key changed
  if (!openaiClient || currentOpenAIApiKey !== key) {
    openaiClient = new OpenAI({
      apiKey: key
    })
    currentOpenAIApiKey = key
  }

  return openaiClient
}

const getGeminiClient = (apiKey?: string): GoogleGenerativeAI | null => {
  const key = apiKey || process.env.GOOGLE_API_KEY

  if (!key) {
    return null
  }

  // Recreate client if API key changed
  if (!geminiClient || currentGeminiApiKey !== key) {
    geminiClient = new GoogleGenerativeAI(key)
    currentGeminiApiKey = key
  }

  return geminiClient
}

/**
 * Generates an embedding for the given text using OpenAI or Gemini API
 * @param text - The text to generate an embedding for
 * @param config - Optional embedding configuration (provider, model, dimensions, apiKey)
 * @returns The embedding vector as an array of numbers, or null if generation fails
 */
export const generateEmbedding = async (text: string, config?: EmbeddingProviderConfig): Promise<number[] | null> => {
  if (!text || text.trim().length < MIN_EMBEDDING_TEXT_LENGTH) {
    logger.debug('Skipping embedding generation for empty or invalid text')
    return null
  }

  const provider = config?.type || 'openai'

  if (provider === 'gemini') {
    return generateGeminiEmbedding(text, config)
  } else {
    return generateOpenAIEmbedding(text, config)
  }
}

/**
 * Generates an embedding using OpenAI API
 */
const generateOpenAIEmbedding = async (text: string, config?: EmbeddingProviderConfig): Promise<number[] | null> => {
  const client = getOpenAIClient(config?.apiKey)

  if (!client) {
    logger.debug('OpenAI API key not configured, skipping embedding generation')
    return null
  }
  if (!config) {
    logger.debug('No embedding configuration provided, skipping embedding generation')
    return null
  }

  try {
    const model = config.model
    const dimensions = config.dimensions

    logger.debug('Generating OpenAI embedding', {
      model,
      dimensions,
      textLength: text.length
    })

    const response = await client.embeddings.create({
      model,
      input: text.trim(),
      dimensions
    })

    const embedding = response.data[0]?.embedding

    logger.debug('OpenAI embedding generated', {
      embeddingLength: embedding?.length
    })

    if (!embedding || !Array.isArray(embedding) || embedding.length !== dimensions) {
      logger.warn('Generated embedding has invalid dimensions', {
        expected: dimensions,
        received: embedding?.length
      })
      return null
    }

    return embedding
  } catch (error) {
    logger.error('Failed to generate OpenAI embedding', error, {
      textLength: text.length,
      model: config?.model
    })
    return null
  }
}

/**
 * Generates an embedding using Google Gemini API
 */
const generateGeminiEmbedding = async (text: string, config?: EmbeddingProviderConfig): Promise<number[] | null> => {
  const client = getGeminiClient(config?.apiKey)

  if (!client) {
    logger.debug('Google API key not configured, skipping embedding generation')
    return null
  }
  if (!config) {
    logger.debug('No embedding configuration provided, skipping embedding generation')
    return null
  }

  try {
    const model = config.model
    const dimensions = config?.dimensions

    logger.debug('Generating Gemini embedding', {
      model,
      dimensions,
      textLength: text.length
    })

    const embeddingModel = client.getGenerativeModel({ model })
    const result = await embeddingModel.embedContent({
      content: { role: 'user', parts: [{ text: text.trim() }] },
      taskType: TaskType.RETRIEVAL_DOCUMENT
    })

    const embedding = result.embedding.values

    logger.debug('Gemini embedding generated', {
      embeddingLength: embedding?.length
    })

    if (!embedding || !Array.isArray(embedding) || embedding.length !== dimensions) {
      logger.warn('Generated embedding has invalid dimensions', {
        expected: dimensions,
        received: embedding?.length
      })
      return null
    }

    return embedding
  } catch (error) {
    logger.error('Failed to generate Gemini embedding', error, {
      textLength: text.length,
      model: config?.model
    })
    return null
  }
}

/**
 * Generate embedding with usage tracking
 *
 * This function returns both the embedding and usage information (tokens used)
 *
 * @param text - The text to generate an embedding for
 * @param config - Optional embedding configuration
 * @returns Embedding with usage information, or null if generation fails
 */
export const generateEmbeddingWithUsage = async (
  text: string,
  config?: EmbeddingProviderConfig
): Promise<EmbeddingWithUsage | null> => {
  if (!text || text.trim().length < MIN_EMBEDDING_TEXT_LENGTH) {
    logger.debug('Skipping embedding generation for empty or invalid text')
    return null
  }

  const provider = config?.type || 'openai'

  if (provider === 'gemini') {
    return generateGeminiEmbeddingWithUsage(text, config)
  } else {
    return generateOpenAIEmbeddingWithUsage(text, config)
  }
}

/**
 * Generate OpenAI embedding with usage tracking
 */
const generateOpenAIEmbeddingWithUsage = async (
  text: string,
  config?: EmbeddingProviderConfig
): Promise<EmbeddingWithUsage | null> => {
  const client = getOpenAIClient(config?.apiKey)

  if (!client) {
    logger.debug('OpenAI API key not configured, skipping embedding generation')
    return null
  }
  if (!config) {
    logger.debug('No embedding configuration provided, skipping embedding generation')
    return null
  }

  try {
    const model = config.model
    const dimensions = config.dimensions

    logger.debug('Generating OpenAI embedding with usage tracking', {
      model,
      dimensions
    })

    const response = await client.embeddings.create({
      model,
      input: text.trim(),
      dimensions
    })

    const embedding = response.data[0]?.embedding

    if (!embedding || !Array.isArray(embedding) || embedding.length !== dimensions) {
      logger.warn('Generated embedding has invalid dimensions', {
        expected: dimensions,
        received: embedding?.length
      })
      return null
    }

    return {
      embedding,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      }
    }
  } catch (error) {
    logger.error('Failed to generate OpenAI embedding with usage', error, {
      textLength: text.length,
      model: config?.model
    })
    return null
  }
}

/**
 * Generate Gemini embedding with usage tracking
 * Note: Gemini doesn't provide token usage, so we estimate it
 */
const generateGeminiEmbeddingWithUsage = async (
  text: string,
  config?: EmbeddingProviderConfig
): Promise<EmbeddingWithUsage | null> => {
  const embeddingResult = await generateGeminiEmbedding(text, config)

  if (!embeddingResult) {
    return null
  }

  // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
  const estimatedTokens = Math.ceil(text.length / 4)

  return {
    embedding: embeddingResult,
    usage: {
      promptTokens: estimatedTokens,
      totalTokens: estimatedTokens
    }
  }
}

/**
 * Generate embeddings for multiple texts with usage tracking (batch)
 *
 * @param texts - Array of texts to generate embeddings for
 * @param config - Optional embedding configuration
 * @returns Embeddings with total usage information, or null if generation fails
 */
export const generateEmbeddingsBatchWithUsage = async (
  texts: string[],
  config?: EmbeddingProviderConfig
): Promise<BatchEmbeddingWithUsage | null> => {
  if (!texts || texts.length === 0) {
    logger.debug('No texts provided for batch embedding generation')
    return null
  }

  // Filter out empty texts
  const validTexts = texts.filter(t => t && t.trim().length >= MIN_EMBEDDING_TEXT_LENGTH)

  if (validTexts.length === 0) {
    logger.debug('No valid texts after filtering for batch embedding generation')
    return null
  }

  const provider = config?.type || 'openai'

  if (provider === 'gemini') {
    return generateGeminiBatchEmbeddingsWithUsage(validTexts, config)
  } else {
    return generateOpenAIBatchEmbeddingsWithUsage(validTexts, config)
  }
}

/**
 * Generate OpenAI batch embeddings with usage tracking
 */
const generateOpenAIBatchEmbeddingsWithUsage = async (
  validTexts: string[],
  config?: EmbeddingProviderConfig
): Promise<BatchEmbeddingWithUsage | null> => {
  const client = getOpenAIClient(config?.apiKey)

  if (!client) {
    logger.debug('OpenAI API key not configured, skipping batch embedding generation')
    return null
  }
  if (!config) {
    logger.debug('No embedding configuration provided, skipping batch embedding generation')
    return null
  }

  try {
    const model = config.model
    const dimensions = config.dimensions

    logger.debug('Generating OpenAI batch embeddings with usage tracking', {
      model,
      dimensions,
      batchSize: validTexts.length
    })

    const response = await client.embeddings.create({
      model,
      input: validTexts.map(t => t.trim()),
      dimensions
    })

    const embeddings = response.data.map(item => item.embedding)

    // Validate all embeddings
    const allValid = embeddings.every(emb => Array.isArray(emb) && emb.length === dimensions)

    if (!allValid) {
      logger.warn('Some generated embeddings have invalid dimensions', {
        expected: dimensions,
        batchSize: embeddings.length
      })
      return null
    }

    logger.info('OpenAI batch embeddings generated successfully', {
      count: embeddings.length,
      totalTokens: response.usage?.total_tokens || 0
    })

    return {
      embeddings,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      }
    }
  } catch (error) {
    logger.error('Failed to generate OpenAI batch embeddings with usage', error, {
      batchSize: validTexts.length,
      model: config?.model
    })
    return null
  }
}

/**
 * Generate Gemini batch embeddings with usage tracking
 * Note: Gemini API handles one text at a time, so we batch them sequentially
 */
const generateGeminiBatchEmbeddingsWithUsage = async (
  validTexts: string[],
  config?: EmbeddingProviderConfig
): Promise<BatchEmbeddingWithUsage | null> => {
  const client = getGeminiClient(config?.apiKey)

  if (!client) {
    logger.debug('Google API key not configured, skipping batch embedding generation')
    return null
  }
  if (!config) {
    logger.debug('No embedding configuration provided, skipping batch embedding generation')
    return null
  }

  try {
    const model = config.model
    const dimensions = config?.dimensions

    logger.debug('Generating Gemini batch embeddings with usage tracking', {
      model,
      dimensions,
      batchSize: validTexts.length
    })

    const embeddingModel = client.getGenerativeModel({ model })
    const embeddings: number[][] = []
    let totalEstimatedTokens = 0

    // Process each text sequentially
    for (const text of validTexts) {
      const result = await embeddingModel.embedContent({
        content: { role: 'user', parts: [{ text: text.trim() }] },
        taskType: TaskType.RETRIEVAL_DOCUMENT
      })

      embeddings.push(result.embedding.values)
      totalEstimatedTokens += Math.ceil(text.length / 4)
    }

    // Validate all embeddings
    const allValid = embeddings.every(emb => Array.isArray(emb) && emb.length === dimensions)

    if (!allValid) {
      logger.warn('Some generated embeddings have invalid dimensions', {
        expected: dimensions,
        batchSize: embeddings.length
      })
      return null
    }

    logger.info('Gemini batch embeddings generated successfully', {
      count: embeddings.length,
      estimatedTokens: totalEstimatedTokens
    })

    return {
      embeddings,
      usage: {
        promptTokens: totalEstimatedTokens,
        totalTokens: totalEstimatedTokens
      }
    }
  } catch (error) {
    logger.error('Failed to generate Gemini batch embeddings with usage', error, {
      batchSize: validTexts.length,
      model: config?.model
    })
    return null
  }
}
