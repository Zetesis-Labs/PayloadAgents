/**
 * Builds a hierarchical path array from markdown header metadata.
 *
 * @param metadata - The metadata object from LangChain's MarkdownHeaderTextSplitter
 * @returns An array of header paths showing the hierarchy
 *
 * @example
 * // Input: { 'Header 1': 'Introduction', 'Header 2': 'Getting Started', 'Header 3': 'Installation' }
 * // Output: ['Introduction', 'Introduction > Getting Started', 'Introduction > Getting Started > Installation']
 */
export const buildHeaderHierarchy = (metadata?: Record<string, string>): string[] => {
  if (!metadata || Object.keys(metadata).length === 0) {
    return []
  }

  const headers: string[] = []
  const headerLevels = Object.keys(metadata)
    .filter(key => key.startsWith('Header '))
    .sort((a, b) => {
      const levelA = parseInt(a.replace('Header ', ''), 10)
      const levelB = parseInt(b.replace('Header ', ''), 10)
      return levelA - levelB
    })

  const currentPath: string[] = []

  for (const headerKey of headerLevels) {
    const headerValue = metadata[headerKey]
    if (!headerValue) {
      continue
    }
    currentPath.push(headerValue)
    headers.push(currentPath.join(' > '))
  }

  return headers
}
