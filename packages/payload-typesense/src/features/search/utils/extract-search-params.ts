/**
 * Extracts and validates search parameters from request query
 */
export const extractSearchParams = (
  query: Record<string, unknown>
): {
  q: string
  page: number
  per_page: number
  sort_by?: string
  mode?: 'simple' | 'semantic'
  collections?: string[]
  exclude_fields?: string
  query_by?: string
  simple?: boolean
  errors?: string[]
} => {
  const q = String(query?.q || '')
  const pageParam = query?.page
  const perPageParam = query?.per_page
  const page = pageParam ? parseInt(String(pageParam), 10) : 1
  const per_page = perPageParam ? parseInt(String(perPageParam), 10) : 10
  const sort_by = query?.sort_by as string | undefined
  const mode = query?.mode as 'simple' | 'semantic' | undefined

  // New parameters for collection filtering and simplified response
  const collectionParam = query?.collection
  const collections: string[] | undefined = collectionParam
    ? Array.isArray(collectionParam)
      ? collectionParam.map(c => String(c))
      : [String(collectionParam)]
    : undefined

  const exclude_fields = query?.exclude_fields as string | undefined
  const query_by = query?.query_by as string | undefined
  const simpleParam = query?.simple
  const simple = simpleParam === 'true' || simpleParam === true || simpleParam === '1'

  const errors: string[] = []

  // Validate parsed numbers
  if (isNaN(page) || page < 1) {
    errors.push('Invalid page parameter')
  }
  if (isNaN(per_page) || per_page < 1 || per_page > 250) {
    errors.push('Invalid per_page parameter')
  }

  const result: {
    q: string
    page: number
    per_page: number
    sort_by?: string
    mode?: 'simple' | 'semantic'
    collections?: string[]
    exclude_fields?: string
    query_by?: string
    simple?: boolean
    errors?: string[]
  } = {
    q,
    page,
    per_page
  }

  if (sort_by) {
    result.sort_by = sort_by
  }

  if (mode) {
    result.mode = mode
  }

  if (collections && collections.length > 0) {
    result.collections = collections
  }

  if (exclude_fields) {
    result.exclude_fields = exclude_fields
  }

  if (query_by) {
    result.query_by = query_by
  }

  if (simple) {
    result.simple = simple
  }

  if (errors.length > 0) {
    result.errors = errors
  }

  return result
}
