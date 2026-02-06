/**
 * Stream handler utilities
 *
 * Shared utility functions for stream handlers
 */

/**
 * Resolve document type from collection name
 */
export function resolveDocumentType(collectionName: string): string {
  if (collectionName === 'article_web_chunk') return 'article'
  if (collectionName === 'page_chunk') return 'pages'
  return 'document'
}

/**
 * Estimate tokens from text (simple word-based estimation)
 * More accurate implementations can be provided via callbacks
 */
export function estimateTokensFromText(text: string): number {
  // Simple estimation: ~1.3 tokens per word
  const words = text.trim().split(/\s+/).length
  return Math.ceil(words * 1.3)
}
