/**
 * Configuration options for text chunking
 */
export interface ChunkOptions {
  /**
   * Maximum characters per chunk
   */
  maxChunkSize?: number
  /**
   * Number of characters to overlap between chunks (for context preservation)
   */
  overlap?: number
  /**
   * Separator used to split text (default: paragraph breaks)
   */
  separator?: string | RegExp
}

/**
 * Represents a single chunk of text with metadata
 */
export interface TextChunk {
  text: string
  index: number
  startIndex: number
  endIndex: number
  /**
   * Optional metadata extracted from the chunk (e.g., markdown headers)
   */
  metadata?: Record<string, string>
}
