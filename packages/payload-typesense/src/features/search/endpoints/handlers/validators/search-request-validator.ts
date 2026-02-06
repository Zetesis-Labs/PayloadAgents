import type { PayloadRequest } from 'payload'
import { getValidationErrors, validateSearchParams } from '../../../../../core/config/config-validation'
import { extractCollectionName } from '../../../utils/extract-collection-name'
import { extractSearchParams } from '../../../utils/extract-search-params'

/**
 * Result type for request validation
 */
export type ValidationResult =
  | { success: false; error: Response }
  | {
      success: true
      collectionName: string | null
      collectionNameStr: string
      searchParams: ReturnType<typeof extractSearchParams>
    }

/**
 * Validates search request and returns parsed parameters
 */
export function validateSearchRequest(request: PayloadRequest): ValidationResult {
  const { query } = request
  const { collectionName, collectionNameStr } = extractCollectionName(request)
  const searchParams = extractSearchParams(query as Record<string, unknown>)

  // Check for parsing errors
  if (searchParams.errors && searchParams.errors.length > 0) {
    return {
      success: false,
      error: Response.json({ error: searchParams.errors[0] }, { status: 400 })
    }
  }

  // Validate search parameters
  const validation = validateSearchParams({
    page: searchParams.page,
    per_page: searchParams.per_page,
    q: searchParams.q,
    sort_by: searchParams.sort_by
  })

  if (!validation.success) {
    return {
      success: false,
      error: Response.json(
        {
          details: getValidationErrors(validation.errors || []),
          error: 'Invalid search parameters'
        },
        { status: 400 }
      )
    }
  }

  return { success: true, collectionName, collectionNameStr, searchParams }
}
