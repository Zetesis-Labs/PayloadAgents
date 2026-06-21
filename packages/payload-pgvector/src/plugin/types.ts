import type { FieldMapping, IndexableCollectionConfig } from '@zetesis/payload-indexer'
import type { PgvectorAdapter } from '../adapter/pgvector-adapter'
import type { PgFieldType } from '../adapter/types'

/**
 * Field mapping for pgvector collections. `type` is the SQL column type used to
 * build the table. Extends the indexer's base FieldMapping (name/payloadField/
 * transform), mirroring how TypesenseFieldMapping extends it.
 */
export interface PgvectorFieldMapping extends FieldMapping {
  /** SQL column type for this field. */
  type: PgFieldType
  /** Create a btree (scalar) / GIN (text[]) index on this column. */
  index?: boolean
  /** Whether the column is nullable. Defaults to true. */
  optional?: boolean
}

/**
 * Config for the pgvector schema-sync plugin. Pair it with createIndexerPlugin
 * (which handles the actual document sync via hooks). This plugin only ensures
 * the tables exist on startup — the equivalent of payload-typesense's onInit
 * schema sync.
 */
export interface PgvectorPluginConfig {
  /** The pgvector adapter (same instance passed to createIndexerPlugin). */
  adapter: PgvectorAdapter
  /** Collections to ensure tables for. */
  collections: IndexableCollectionConfig<PgvectorFieldMapping>
  /** Embedding dimensionality of the vector column (must match the provider). */
  dimensions: number
  /** Name of the vector column. Defaults to `embedding`. */
  embeddingField?: string
  /** Distance metric for the HNSW index. Defaults to `cosine`. */
  distance?: 'cosine' | 'l2' | 'ip'
}
