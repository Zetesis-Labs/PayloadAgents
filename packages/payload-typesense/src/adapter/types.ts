/**
 * Typesense-specific field types, mappings, and schemas
 * These are the data types and field configurations supported by Typesense
 */

import type { BaseCollectionSchema, FieldMapping } from '@nexo-labs/payload-indexer'

/**
 * All valid Typesense field types
 * @see https://typesense.org/docs/latest/api/collections.html#schema-parameters
 */
export type TypesenseFieldType =
  | 'string'
  | 'int32'
  | 'int64'
  | 'float'
  | 'bool'
  | 'string[]'
  | 'float[]'
  | 'int32[]'
  | 'int64[]'
  | 'bool[]'
  | 'object'
  | 'object[]'
  | 'geopoint'
  | 'geopoint[]'
  | 'auto'

/**
 * Typesense-specific field mapping
 * Extends the base FieldMapping with Typesense-specific properties
 *
 * @example
 * ```typescript
 * const fields: TypesenseFieldMapping[] = [
 *   { name: 'title', type: 'string', index: true },
 *   { name: 'views', type: 'int64' },
 *   { name: 'tags', type: 'string[]', facet: true },
 *   { name: 'category', payloadField: 'category.name', type: 'string', facet: true },
 * ];
 * ```
 */
export interface TypesenseFieldMapping extends FieldMapping {
  /**
   * Typesense field type
   */
  type: TypesenseFieldType

  /**
   * Whether the field should be faceted (filterable in Typesense UI)
   */
  facet?: boolean

  /**
   * Whether the field should be indexed (searchable)
   * @default true
   */
  index?: boolean

  /**
   * Whether the field is optional (can be missing from documents)
   */
  optional?: boolean
}

/**
 * Typesense field schema for collection creation
 * Used internally when creating/updating collections
 */
export interface TypesenseFieldSchema {
  name: string
  type: TypesenseFieldType
  facet?: boolean
  index?: boolean
  optional?: boolean
  /** Number of dimensions for vector fields (float[]) */
  vectorDimensions?: number
  /** Allow additional properties for compatibility with BaseCollectionSchema */
  [key: string]: unknown
}

/**
 * Typesense collection schema for creation/update
 * Extends BaseCollectionSchema with Typesense-specific options
 */
export interface TypesenseCollectionSchema extends BaseCollectionSchema {
  fields: TypesenseFieldSchema[]
  /** Default sorting field (must be a numeric field) */
  defaultSortingField?: string
}

// ============================================================================
// SEARCH RESULT TYPES
// These types extend/wrap Typesense SDK types to add missing properties
// ============================================================================

/**
 * Highlight information for a search hit
 */
export interface TypesenseHighlight {
  field: string
  snippet?: string
  matched_tokens?: string[]
  snippets?: string[]
  indices?: number[]
}

/**
 * Search hit with vector_distance (not included in Typesense SDK types)
 * @typeParam TDoc - The document type
 */
export interface TypesenseSearchHit<TDoc = Record<string, unknown>> {
  document: TDoc
  /** Distance score for vector searches (lower is more similar) */
  vector_distance?: number
  /** Text match score for keyword searches */
  text_match?: number
  /** Highlighted snippets for matched fields */
  highlights?: TypesenseHighlight[]
}

/**
 * Typed search result from Typesense
 * @typeParam TDoc - The document type in hits
 */
export interface TypesenseSearchResult<TDoc = Record<string, unknown>> {
  hits?: TypesenseSearchHit<TDoc>[]
  found: number
  out_of: number
  page: number
  search_time_ms: number
  facet_counts?: Array<{
    field_name: string
    counts: Array<{ value: string; count: number }>
  }>
}

/**
 * Collection info returned by Typesense (for retrieve operations)
 * Uses proper types instead of `any`
 */
export interface TypesenseCollectionInfo {
  name: string
  fields: TypesenseFieldSchema[]
  default_sorting_field?: string
  num_documents: number
  created_at?: number
}
