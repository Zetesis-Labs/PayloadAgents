/**
 * Embedding service types and interfaces
 */

/**
 * Usage tracking for embedding operations
 */
export interface EmbeddingUsage {
  promptTokens: number
  totalTokens: number
}

/**
 * Result from a single embedding generation
 */
export interface EmbeddingResult {
  embedding: number[]
  usage: EmbeddingUsage
}

/**
 * Result from batch embedding generation
 */
export interface BatchEmbeddingResult {
  embeddings: number[][]
  usage: EmbeddingUsage
}

/**
 * Interface for embedding providers (OpenAI, Gemini, etc.)
 * Implementations handle the actual API calls
 */
export interface EmbeddingProvider {
  /**
   * Generate embedding for a single text
   */
  generateEmbedding(text: string): Promise<EmbeddingResult | null>

  /**
   * Generate embeddings for multiple texts (batch)
   */
  generateBatchEmbeddings(texts: string[]): Promise<BatchEmbeddingResult | null>
}

/**
 * High-level embedding service interface
 * Used by document processing pipeline
 */
export interface EmbeddingService {
  /**
   * Get embedding vector for text
   */
  getEmbedding(text: string): Promise<number[] | null>

  /**
   * Get embeddings for multiple texts
   */
  getEmbeddingsBatch(texts: string[]): Promise<number[][] | null>

  /**
   * Get the dimension size of embeddings
   */
  getDimensions(): number
}

// === Provider Configuration Types ===

/**
 * Embedding provider types
 */
export type EmbeddingProviderType = 'openai' | 'gemini'

/**
 * OpenAI embedding models
 */
export type OpenAIEmbeddingModel = 'text-embedding-3-small' | 'text-embedding-3-large' | 'text-embedding-ada-002'

/**
 * Gemini embedding models
 */
export type GeminiEmbeddingModel = 'gemini-embedding-001' | 'text-embedding-004'

/**
 * Dimensions by OpenAI model
 */
export type OpenAIDimensionsByModel = {
  'text-embedding-3-large': 3072
  'text-embedding-3-small': 1536
  'text-embedding-ada-002': 1536
}

/**
 * Dimensions by Gemini model
 */
export type GeminiDimensionsByModel = {
  'gemini-embedding-001': number
  'text-embedding-004': 768
}

/**
 * OpenAI provider configuration
 */
export interface OpenAIProviderConfig {
  type: 'openai'
  model: OpenAIEmbeddingModel
  dimensions: OpenAIDimensionsByModel[OpenAIEmbeddingModel]
  apiKey: string
}

/**
 * Gemini provider configuration
 */
export interface GeminiProviderConfig {
  type: 'gemini'
  model: GeminiEmbeddingModel
  dimensions: GeminiDimensionsByModel[GeminiEmbeddingModel]
  apiKey: string
}

/**
 * Union type for all embedding provider configurations
 */
export type EmbeddingProviderConfig = OpenAIProviderConfig | GeminiProviderConfig
