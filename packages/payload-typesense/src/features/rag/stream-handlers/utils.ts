/**
 * Stream handler utilities
 *
 * Shared utility functions for stream handlers
 */
/**
 * Estimate tokens from text (simple word-based estimation)
 * More accurate implementations can be provided via callbacks
 */
export function estimateTokensFromText(text: string): number {
  // Simple estimation: ~1.3 tokens per word
  const words = text.trim().split(/\s+/).length
  return Math.ceil(words * 1.3)
}
