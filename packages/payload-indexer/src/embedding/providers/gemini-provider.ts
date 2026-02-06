import { GoogleGenerativeAI, TaskType } from '@google/generative-ai'
import { MIN_EMBEDDING_TEXT_LENGTH } from '../../core/config/constants'
import type { Logger } from '../../core/logging/logger'
import type { BatchEmbeddingResult, EmbeddingProvider, EmbeddingResult, GeminiProviderConfig } from '../types'

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private client: GoogleGenerativeAI
  private model: string

  constructor(
    config: GeminiProviderConfig,
    private logger: Logger
  ) {
    if (!config.apiKey) {
      throw new Error('Gemini API key is required')
    }
    this.client = new GoogleGenerativeAI(config.apiKey)
    this.model = config.model
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult | null> {
    if (!text || text.trim().length < MIN_EMBEDDING_TEXT_LENGTH) {
      return null
    }

    try {
      const model = this.client.getGenerativeModel({ model: this.model })
      const result = await model.embedContent({
        content: { role: 'user', parts: [{ text: text.trim() }] },
        taskType: TaskType.RETRIEVAL_DOCUMENT
      })

      const embedding = result.embedding.values
      // Estimate usage (Gemini doesn't provide token counts)
      const estimatedTokens = Math.ceil(text.length / 4)

      return {
        embedding,
        usage: {
          promptTokens: estimatedTokens,
          totalTokens: estimatedTokens
        }
      }
    } catch (error) {
      this.logger.error('Gemini embedding generation failed', error, {
        model: this.model,
        textLength: text.length,
        textPreview: text.substring(0, 200) + (text.length > 200 ? '...' : '')
      })
      return null
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<BatchEmbeddingResult | null> {
    const validTexts = texts.filter(t => t && t.trim().length >= MIN_EMBEDDING_TEXT_LENGTH)
    if (validTexts.length === 0) return null

    try {
      const model = this.client.getGenerativeModel({ model: this.model })
      // Gemini doesn't have a batch API, so we process sequentially
      const embeddings: number[][] = []
      let totalTokens = 0

      for (const text of validTexts) {
        const result = await model.embedContent({
          content: { role: 'user', parts: [{ text: text.trim() }] },
          taskType: TaskType.RETRIEVAL_DOCUMENT
        })
        embeddings.push(result.embedding.values)
        totalTokens += Math.ceil(text.length / 4)
      }

      return {
        embeddings,
        usage: {
          promptTokens: totalTokens,
          totalTokens: totalTokens
        }
      }
    } catch (error) {
      this.logger.error('Gemini batch embedding generation failed', error, {
        model: this.model,
        count: texts.length
      })
      return null
    }
  }
}
