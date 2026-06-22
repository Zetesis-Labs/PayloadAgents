import type { BaseCollectionSchema } from '@zetesis/payload-indexer'

/**
 * SQL column types we map indexer fields onto. Kept deliberately small — the
 * indexer only needs scalars, text arrays (e.g. taxonomy_slugs), timestamps and
 * the vector column.
 */
export type PgFieldType = 'text' | 'text[]' | 'int' | 'bigint' | 'bool' | 'timestamptz' | 'jsonb' | 'vector'

/**
 * A single column in a pgvector-backed collection (table).
 */
export interface PgFieldSchema {
  name: string
  type: PgFieldType
  /** Required for `vector` columns: the embedding dimensionality (`vector(N)`). */
  dimensions?: number
  /** Create a btree/GIN index on this column. The vector column is handled separately (HNSW). */
  index?: boolean
  /** Whether the column is nullable. Defaults to true. */
  optional?: boolean
}

/**
 * pgvector-specific collection schema. Each collection maps to one Postgres
 * table. Extends the indexer's BaseCollectionSchema so the IndexerAdapter
 * contract is satisfied.
 */
export interface PgvectorCollectionSchema extends BaseCollectionSchema {
  name: string
  fields: PgFieldSchema[]
  /** Primary key column. Defaults to `id`. */
  idField?: string
  /** Name of the `vector` column embeddings are stored in. Defaults to `embedding`. */
  embeddingField?: string
  /**
   * Columns whose text is concatenated and embedded at upsert time when the
   * document does not already carry a precomputed vector. Mirrors Typesense's
   * `embed.from`. If omitted, the adapter never auto-embeds (vectors must be
   * supplied in the document).
   */
  embedFrom?: string[]
  /** HNSW index tuning for the embedding column. */
  hnsw?: {
    m?: number
    efConstruction?: number
    /** Distance operator class. Defaults to cosine. */
    distance?: 'cosine' | 'l2' | 'ip'
  }
}

/** Internal per-collection metadata captured from ensureCollection. */
export interface CollectionEmbedInfo {
  idField: string
  embeddingField: string
  embedFrom: string[]
  dimensions: number
  distance: 'cosine' | 'l2' | 'ip'
  /** Column name → SQL type, used to pick the right filter operator (e.g. && vs =). */
  columnTypes: Record<string, PgFieldType>
}
