import type { PgFieldSchema, PgvectorCollectionSchema } from '../adapter/types'
import type { PgvectorPluginConfig } from './types'

/**
 * Standard columns the payload-indexer sync emits for CHUNKED collections.
 * Timestamps are epoch milliseconds (number) → bigint. Must stay in sync with
 * payload-indexer's document-syncer buildChunkDocument().
 */
const chunkStandardFields = (): PgFieldSchema[] => [
  { name: 'id', type: 'text' },
  { name: 'parent_doc_id', type: 'text', index: true },
  { name: 'chunk_index', type: 'int' },
  { name: 'chunk_text', type: 'text' },
  { name: 'is_chunk', type: 'bool' },
  { name: 'headers', type: 'text[]', optional: true },
  { name: 'createdAt', type: 'bigint', optional: true },
  { name: 'updatedAt', type: 'bigint', optional: true },
  { name: 'publishedAt', type: 'bigint', optional: true },
  { name: 'content_hash', type: 'text', optional: true },
  { name: 'slug', type: 'text', optional: true }
]

/** Standard columns the sync emits for FULL-DOCUMENT collections. */
const docStandardFields = (): PgFieldSchema[] => [
  { name: 'id', type: 'text' },
  { name: 'slug', type: 'text', optional: true },
  { name: 'createdAt', type: 'bigint', optional: true },
  { name: 'updatedAt', type: 'bigint', optional: true },
  { name: 'publishedAt', type: 'bigint', optional: true },
  { name: 'content_hash', type: 'text', optional: true }
]

/**
 * Derive pgvector table schemas from the indexer collections config. Adds the
 * standard sync columns + the embedding vector column to the user-defined
 * fields, so the table matches exactly what the syncer upserts.
 */
export const deriveCollectionSchemas = (config: PgvectorPluginConfig): PgvectorCollectionSchema[] => {
  const { collections, dimensions, embeddingField = 'embedding', distance = 'cosine' } = config
  const schemas: PgvectorCollectionSchema[] = []

  for (const [slug, tableConfigs] of Object.entries(collections)) {
    for (const tableConfig of tableConfigs) {
      if (!tableConfig.enabled) continue

      const chunked = Boolean(tableConfig.embedding?.chunking)
      const standard = chunked ? chunkStandardFields() : docStandardFields()
      const standardNames = new Set(standard.map(f => f.name))
      const userByName = new Map(tableConfig.fields.map(f => [f.name, f]))

      // Merge the user's index/optional flags onto standard columns they also
      // declare (e.g. index:true on slug), instead of silently dropping them.
      const mergedStandard: PgFieldSchema[] = standard.map(s => {
        const u = userByName.get(s.name)
        if (!u) return s
        return { ...s, index: u.index ?? s.index, optional: u.optional ?? s.optional }
      })

      const userFields: PgFieldSchema[] = tableConfig.fields
        .filter(field => !standardNames.has(field.name))
        .map(field => ({
          name: field.name,
          type: field.type,
          index: field.index,
          optional: field.optional ?? true
        }))

      const embeddingColumn: PgFieldSchema = { name: embeddingField, type: 'vector', dimensions }

      schemas.push({
        name: tableConfig.tableName ?? slug,
        idField: 'id',
        embeddingField,
        embedFrom: chunked ? ['chunk_text'] : [],
        fields: [...mergedStandard, ...userFields, embeddingColumn],
        hnsw: { distance }
      })
    }
  }

  return schemas
}
