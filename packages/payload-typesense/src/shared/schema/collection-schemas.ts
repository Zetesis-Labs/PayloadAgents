import type { TableConfig } from '@nexo-labs/payload-indexer'
import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections'
import type { TypesenseFieldMapping } from '../../adapter/types'

/**
 * Field schema definitions for Typesense collections
 */

/**
 * Type for Typesense collection field schema
 * Extracted from CollectionCreateSchema to ensure type compatibility
 */
type TypesenseFieldSchema = NonNullable<CollectionCreateSchema['fields']>[number]

/**
 * Base fields that every collection should have
 */
const getBaseFields = () => [
  { name: 'id', type: 'string' as const },
  { name: 'slug', type: 'string' as const },
  { name: 'createdAt', type: 'int64' as const },
  { name: 'updatedAt', type: 'int64' as const }
]

/**
 * Creates embedding field definition
 * @param optional - Whether the embedding field is optional
 * @param dimensions - Number of dimensions for the embedding vector (default: 1536)
 */
const getEmbeddingField = (optional: boolean = true, dimensions: number) => ({
  name: 'embedding',
  type: 'float[]' as const,
  num_dim: dimensions,
  ...(optional && { optional: true })
})

/**
 * Maps TypesenseFieldMapping to TypesenseFieldSchema
 */
const mapFieldMappingsToSchema = (fields: TypesenseFieldMapping[]): TypesenseFieldSchema[] => {
  return fields.map(field => ({
    name: field.name,
    type: field.type === 'auto' ? 'string' : field.type,
    facet: field.facet,
    index: field.index,
    optional: field.optional
  }))
}

/**
 * Gets chunk-specific fields for chunk collections
 */
const getChunkFields = () => [
  { name: 'parent_doc_id', type: 'string' as const, facet: true }, // Required for chunks
  { name: 'chunk_index', type: 'int32' as const },
  { name: 'chunk_text', type: 'string' as const }, // The chunk content
  { name: 'is_chunk', type: 'bool' as const }, // Always true for chunks
  { name: 'headers', type: 'string[]' as const, facet: true, optional: true } // Hierarchical header metadata
]

/**
 * Creates a complete schema for a chunk collection
 */
export const getChunkCollectionSchema = (
  collectionSlug: string,
  tableConfig: TableConfig<TypesenseFieldMapping>,
  embeddingDimensions: number
) => {
  const fields = tableConfig.fields ? mapFieldMappingsToSchema(tableConfig.fields) : []

  // Get user-defined field names to avoid duplicates
  const userFieldNames = new Set([...fields.map(f => f.name), ...getChunkFields().map(f => f.name)])

  // Filter base fields to exclude any that are already defined by user or chunk fields
  const baseFields = getBaseFields().filter(f => !userFieldNames.has(f.name))

  return {
    name: collectionSlug,
    fields: [
      ...baseFields,
      ...getChunkFields(),
      ...fields,
      getEmbeddingField(false, embeddingDimensions) // Embeddings are required for chunks
    ]
  }
}

/**
 * Creates a complete schema for a full document collection
 */
export const getFullDocumentCollectionSchema = (
  collectionSlug: string,
  tableConfig: TableConfig<TypesenseFieldMapping>,
  embeddingDimensions: number
) => {
  const mappedFields = mapFieldMappingsToSchema(tableConfig.fields)

  // Get user-defined field names to avoid duplicates
  const userFieldNames = new Set(mappedFields.map(f => f.name))

  // Filter base fields to exclude any that are already defined by user
  const baseFields = getBaseFields().filter(f => !userFieldNames.has(f.name))

  return {
    name: collectionSlug,
    fields: [
      ...baseFields,
      ...mappedFields,
      // Optional embedding for full documents
      getEmbeddingField(true, embeddingDimensions)
    ]
  }
}
