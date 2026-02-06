/**
 * Default values for vector search parameters
 *
 * K is set high because:
 * - Documents are split into chunks (avg 5-10 chunks per doc)
 * - To get 20 unique documents, we need K = 20 docs × 7 chunks/doc = 140
 * - Higher K = better coverage but slightly slower (still fast with good indexing)
 */
export const DEFAULT_K = 150 // High K for good chunk coverage
export const DEFAULT_PAGE = 1
export const DEFAULT_PER_PAGE = 20 // Show more results per page (was 10)
export const DEFAULT_ALPHA = 0.7

/**
 * Default search field names when not specified
 */
export const DEFAULT_SEARCH_FIELDS = ['title', 'content']

/**
 * Default snippet threshold for search results
 */
export const DEFAULT_SNIPPET_THRESHOLD = 30

/**
 * Default typo tokens threshold
 */
export const DEFAULT_TYPO_TOKENS_THRESHOLD = 1

/**
 * Default number of typos allowed
 */
export const DEFAULT_NUM_TYPOS = 0
