import type { EmbeddingProviderConfig } from '../../../shared/types/plugin-types'
import { generateEmbedding } from '../../embedding/embeddings'

/**
 * Generates or retrieves a search vector from query text or provided vector
 */
export const generateOrGetVector = async (
  query?: string,
  vector?: number[],
  embeddingConfig?: EmbeddingProviderConfig
): Promise<number[] | null> => {
  // Use provided vector if available
  if (vector && Array.isArray(vector) && vector.length > 0) {
    return vector
  }

  // Generate embedding from query if vector not provided
  if (query) {
    const searchVector = await generateEmbedding(query, embeddingConfig)
    if (!searchVector || searchVector.length === 0) {
      return null
    }
    return searchVector
  }

  return null
}
