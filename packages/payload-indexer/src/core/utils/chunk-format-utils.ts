/**
 * Utilities for formatting chunk text with header metadata
 */

/**
 * Separator used between chunk content and header metadata
 */
export const CHUNK_HEADER_SEPARATOR = '.________________________________________.'

/**
 * Header metadata structure embedded in chunk_text
 */
export interface ChunkHeaderMetadata {
  /** Current section (last header in hierarchy) */
  section: string
  /** Full hierarchical path */
  path: string
}

/**
 * Parsed chunk with separated headers and content
 */
export interface ParsedChunk {
  /** Header metadata (if present) */
  metadata?: ChunkHeaderMetadata
  /** The actual chunk content */
  content: string
}

/**
 * Formats chunk text with header metadata at the end
 *
 * @param content - The chunk content
 * @param headers - Hierarchical array of headers (e.g., ['Introduction', 'Introduction > Getting Started'])
 * @returns Formatted chunk text with content + separator + key-value metadata
 *
 * @example
 * const formatted = formatChunkWithHeaders(
 *   'To install the package...',
 *   ['Introduction', 'Introduction > Getting Started', 'Introduction > Getting Started > Installation']
 * );
 * // Result:
 * // To install the package...
 * // ._________________________________________.
 * // section: Installation | path: Introduction > Getting Started > Installation
 */
export const formatChunkWithHeaders = (content: string, headers: string[]): string => {
  if (!headers || headers.length === 0) {
    return content
  }

  // Get the last (most specific) header
  const fullPath = headers[headers.length - 1]
  const section = (fullPath && fullPath.split(' > ').pop()) || fullPath || ''

  // Format as key-value pairs
  const metadataLine = `section: ${section} | path: ${fullPath}`

  return `${content}\n${CHUNK_HEADER_SEPARATOR}\n${metadataLine}`
}

/**
 * Parses chunk text to extract header metadata and content separately
 *
 * @param chunkText - The formatted chunk text
 * @returns Object with separated metadata and content
 *
 * @example
 * const parsed = parseChunkText('Content here\\n._________________________________________.\\nsection: Installation | path: Introduction > Getting Started > Installation');
 * console.log(parsed.metadata.section); // "Installation"
 * console.log(parsed.content); // "Content here"
 */
export const parseChunkText = (chunkText: string): ParsedChunk => {
  if (!chunkText.includes(CHUNK_HEADER_SEPARATOR)) {
    return { content: chunkText }
  }

  const [contentPart, ...metadataParts] = chunkText.split(CHUNK_HEADER_SEPARATOR)
  const content = contentPart ? contentPart.trim() : ''
  const metadataLine = metadataParts.join(CHUNK_HEADER_SEPARATOR).trim()

  try {
    // Parse key-value format: "section: X | path: Y"
    const pairs = metadataLine.split(' | ')
    const metadata: ChunkHeaderMetadata = {
      section: '',
      path: ''
    }

    for (const pair of pairs) {
      const [key, ...valueParts] = pair.split(': ')
      const value = valueParts.join(': ').trim() // In case value contains ':'

      if (key?.trim() === 'section') {
        metadata.section = value
      } else if (key?.trim() === 'path') {
        metadata.path = value
      }
    }

    // Only return metadata if we found at least one field
    if (metadata.section || metadata.path) {
      return { metadata, content }
    }

    return { content: chunkText }
  } catch (error) {
    // If parsing fails, return the whole text as content
    return { content: chunkText }
  }
}

/**
 * Extracts only the content from a formatted chunk (removes header metadata)
 *
 * @param chunkText - The formatted chunk text
 * @returns Just the content without header metadata
 */
export const extractContentOnly = (chunkText: string): string => {
  return parseChunkText(chunkText).content
}

/**
 * Extracts only the header metadata from a formatted chunk
 *
 * @param chunkText - The formatted chunk text
 * @returns Header metadata or undefined if not present
 */
export const extractHeaderMetadata = (chunkText: string): ChunkHeaderMetadata | undefined => {
  return parseChunkText(chunkText).metadata
}
