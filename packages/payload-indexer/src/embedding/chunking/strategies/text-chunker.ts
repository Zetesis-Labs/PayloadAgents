/**
 * Simple text chunking strategy using LangChain's RecursiveCharacterTextSplitter
 */

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { DEFAULT_CHUNK_SIZE, DEFAULT_OVERLAP } from '../../../core/config/constants'
import type { ChunkOptions, TextChunk } from '../types'

/**
 * Splits text into chunks using LangChain's RecursiveCharacterTextSplitter
 * Main entry point for simple text chunking
 */
export const chunkText = async (text: string, options: ChunkOptions = {}): Promise<TextChunk[]> => {
  const { maxChunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP } = options

  if (!text || text.trim().length === 0) {
    return []
  }

  // For very short texts, return as single chunk
  if (text.length <= maxChunkSize) {
    return [
      {
        text: text.trim(),
        index: 0,
        startIndex: 0,
        endIndex: text.length
      }
    ]
  }

  // Use LangChain's RecursiveCharacterTextSplitter
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: maxChunkSize,
    chunkOverlap: overlap
  })

  const chunks = await splitter.createDocuments([text])

  // Convert to our TextChunk format
  return chunks.map((chunk, index) => ({
    text: chunk.pageContent,
    index,
    startIndex: 0,
    endIndex: chunk.pageContent.length
  }))
}

/**
 * Determines if chunking should be applied based on content length
 */
export const shouldChunk = (text: string, threshold: number = DEFAULT_CHUNK_SIZE): boolean => {
  return Boolean(text && text.length > threshold)
}
