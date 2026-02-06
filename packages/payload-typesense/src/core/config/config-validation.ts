/**
 * Configuration validation using Zod schemas
 */

import { z } from 'zod'

// Validation result type
export interface ValidationResult {
  data?: ValidatedSearchParams
  errors?: string[]
  success: boolean
}

/**
 * Get configuration validation errors in a user-friendly format
 */
export function getValidationErrors(errors: string[]): string {
  return errors.map((error, index) => `${index + 1}. ${error}`).join('\n')
}

/**
 * Validate search parameters
 */
const SearchParamsSchema = z.object({
  facets: z.array(z.string()).optional(),
  filters: z.record(z.string(), z.any()).optional(),
  highlight_fields: z.array(z.string()).optional(),
  num_typos: z.number().int().min(0).max(4).optional().default(0),
  page: z.number().int().min(1).optional().default(1),
  per_page: z.number().int().min(1).max(250).optional().default(10),
  q: z.string().min(1, 'Query parameter "q" is required'),
  snippet_threshold: z.number().int().min(0).max(100).optional().default(30),
  sort_by: z.string().optional(),
  typo_tokens_threshold: z.number().int().min(1).optional().default(1)
})

export type ValidatedSearchParams = z.infer<typeof SearchParamsSchema>

/**
 * Validate search parameters
 */
export function validateSearchParams(params: unknown): ValidationResult {
  try {
    const validatedParams = SearchParamsSchema.parse(params)
    return {
      data: validatedParams,
      success: true
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map(err => {
        const path = err.path.length > 0 ? `${err.path.join('.')}: ` : ''
        return `${path}${err.message}`
      })

      return {
        errors,
        success: false
      }
    }

    return {
      errors: ['Invalid search parameters format'],
      success: false
    }
  }
}
