import type { AdapterSearchResult, IndexDocument, IndexerAdapter, VectorSearchOptions } from '@zetesis/payload-indexer'
import type { Pool, PoolClient } from 'pg'
import { logger } from '../core/logging/logger'
import type { EmbeddingProvider } from '../embedding/provider'
import type { CollectionEmbedInfo, PgFieldSchema, PgFieldType, PgvectorCollectionSchema } from './types'

export interface PgvectorAdapterOptions {
  /** Embedding provider used to vectorize text at upsert time. Optional: if a */
  /** document already carries a precomputed vector, no provider is needed. */
  embeddingProvider?: EmbeddingProvider
  /**
   * Postgres schema to create/query the tables in (e.g. `pgvector`). Required and
   * never `public`: these tables are raw (not ORM-managed), so they MUST live in
   * a dedicated schema — otherwise a Payload/Drizzle schema push sees them as
   * unmanaged and DROPs them.
   */
  schema: string
}

/** Map our PgFieldType to a concrete SQL column type. */
const sqlColumnType = (field: PgFieldSchema): string => {
  switch (field.type) {
    case 'text':
      return 'text'
    case 'text[]':
      return 'text[]'
    case 'int':
      return 'integer'
    case 'bigint':
      return 'bigint'
    case 'bool':
      return 'boolean'
    case 'timestamptz':
      return 'timestamptz'
    case 'jsonb':
      return 'jsonb'
    case 'vector':
      if (!field.dimensions) {
        throw new Error(`vector column "${field.name}" requires "dimensions"`)
      }
      return `vector(${field.dimensions})`
    default: {
      const exhaustive: never = field.type
      throw new Error(`Unsupported field type: ${String(exhaustive)}`)
    }
  }
}

const DISTANCE_OPS: Record<CollectionEmbedInfo['distance'], { op: string; opclass: string }> = {
  cosine: { op: '<=>', opclass: 'vector_cosine_ops' },
  l2: { op: '<->', opclass: 'vector_l2_ops' },
  ip: { op: '<#>', opclass: 'vector_ip_ops' }
}

/** Quote a SQL identifier (table/column). Validates to avoid injection via schema. */
const ident = (name: string): string => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`)
  }
  return `"${name}"`
}

/** Format a number[] as a pgvector literal: [1,2,3]. */
const toVectorLiteral = (vector: number[]): string => `[${vector.join(',')}]`

/**
 * Postgres + pgvector implementation of the IndexerAdapter contract.
 *
 * Sibling of TypesenseAdapter. The crucial difference: pgvector does not embed,
 * so this adapter produces vectors app-side via an EmbeddingProvider at upsert
 * time (unless the document already carries one). Query-side embedding is done
 * by the caller; vectorSearch() receives a precomputed vector, matching the
 * IndexerAdapter signature.
 */
export class PgvectorAdapter implements IndexerAdapter<PgvectorCollectionSchema> {
  readonly name = 'pgvector'
  private readonly pool: Pool
  private readonly embeddingProvider?: EmbeddingProvider
  private readonly schema: string
  /** Per-collection embedding metadata, captured during ensureCollection. */
  private readonly embedInfo = new Map<string, CollectionEmbedInfo>()

  constructor(pool: Pool, options: PgvectorAdapterOptions) {
    if (!options.schema || options.schema === 'public') {
      throw new Error('PgvectorAdapter requires a dedicated `schema` (not "public")')
    }
    this.pool = pool
    this.embeddingProvider = options.embeddingProvider
    this.schema = options.schema
  }

  /** Schema-qualified, quoted table reference: `"schema"."table"`. */
  private relName(table: string): string {
    return `${ident(this.schema)}.${ident(table)}`
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1')
      return true
    } catch (error) {
      logger.error('pgvector connection test failed', error)
      return false
    }
  }

  // === Schema Management ===

  async ensureCollection(schema: PgvectorCollectionSchema): Promise<void> {
    const idField = schema.idField ?? 'id'
    const embeddingField = schema.embeddingField ?? 'embedding'
    const distance = schema.hnsw?.distance ?? 'cosine'
    const embeddingFieldSchema = schema.fields.find(f => f.name === embeddingField)

    const client = await this.pool.connect()
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector')
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${ident(this.schema)}`)
      await this.createTable(client, schema, idField)
      await this.warnOnIncompatibleSchema(client, schema, embeddingField, distance)
      await this.ensureIndexes(client, schema, embeddingField, Boolean(embeddingFieldSchema), distance)
    } finally {
      client.release()
    }

    this.registerCollection(schema)
    logger.info(`Ensured collection (table): ${schema.name}`)
  }

  /**
   * Register a collection's metadata (id/embedding field, distance, column
   * types) WITHOUT running any DDL. ensureCollection calls this after creating
   * the table; consumers that only read (e.g. a search server) can call it on
   * an existing table so filters and vectorSearch resolve correctly.
   */
  registerCollection(schema: PgvectorCollectionSchema): void {
    const idField = schema.idField ?? 'id'
    const embeddingField = schema.embeddingField ?? 'embedding'
    const distance = schema.hnsw?.distance ?? 'cosine'
    const embeddingFieldSchema = schema.fields.find(f => f.name === embeddingField)

    const columnTypes: Record<string, PgFieldType> = {}
    for (const field of schema.fields) {
      columnTypes[field.name] = field.type
    }

    this.embedInfo.set(schema.name, {
      idField,
      embeddingField,
      embedFrom: schema.embedFrom ?? [],
      dimensions: embeddingFieldSchema?.dimensions ?? this.embeddingProvider?.dimensions ?? 0,
      distance,
      columnTypes
    })
  }

  /** CREATE TABLE (id guaranteed as PK) + additive ADD COLUMN for pre-existing tables. */
  private async createTable(client: PoolClient, schema: PgvectorCollectionSchema, idField: string): Promise<void> {
    const hasIdField = schema.fields.some(f => f.name === idField)
    const columnDefs: string[] = []
    if (!hasIdField) {
      columnDefs.push(`${ident(idField)} text PRIMARY KEY`)
    }
    for (const field of schema.fields) {
      const nullable = field.optional === false ? ' NOT NULL' : ''
      const pk = field.name === idField ? ' PRIMARY KEY' : ''
      columnDefs.push(`${ident(field.name)} ${sqlColumnType(field)}${pk}${nullable}`)
    }
    await client.query(`CREATE TABLE IF NOT EXISTS ${this.relName(schema.name)} (\n  ${columnDefs.join(',\n  ')}\n)`)

    for (const field of schema.fields) {
      await client.query(
        `ALTER TABLE ${this.relName(schema.name)} ADD COLUMN IF NOT EXISTS ${ident(field.name)} ${sqlColumnType(field)}`
      )
    }
  }

  /**
   * The schema sync is additive (CREATE/ADD ... IF NOT EXISTS), so it can't change
   * an embedding column's dimension or an HNSW index's distance once they exist.
   * Detect those incompatible drifts and warn loudly — the operator must drop &
   * recreate (and reindex) to apply them; silently they'd break inserts/searches
   * or degrade relevance.
   */
  private async warnOnIncompatibleSchema(
    client: PoolClient,
    schema: PgvectorCollectionSchema,
    embeddingField: string,
    distance: CollectionEmbedInfo['distance']
  ): Promise<void> {
    const expectedDim = schema.fields.find(f => f.name === embeddingField)?.dimensions
    if (expectedDim) {
      // For a pgvector column, atttypmod holds the declared dimension (-1 if none).
      const { rows } = await client.query<{ dim: number }>(
        `SELECT a.atttypmod AS dim FROM pg_attribute a
         JOIN pg_class c ON a.attrelid = c.oid
         JOIN pg_namespace n ON c.relnamespace = n.oid
         WHERE n.nspname = $1 AND c.relname = $2 AND a.attname = $3 AND NOT a.attisdropped`,
        [this.schema, schema.name, embeddingField]
      )
      const actualDim = rows[0]?.dim
      if (typeof actualDim === 'number' && actualDim > 0 && actualDim !== expectedDim) {
        logger.warn(
          `[${schema.name}] embedding column "${embeddingField}" is vector(${actualDim}) but config wants vector(${expectedDim}). ` +
            'The additive schema sync will NOT change it — drop & recreate the table and reindex to switch dimensions.'
        )
      }
    }

    const indexName = `${schema.name}_${embeddingField}_hnsw`
    const expectedOpclass = DISTANCE_OPS[distance].opclass
    const { rows } = await client.query<{ def: string }>(
      `SELECT pg_get_indexdef(ic.oid) AS def FROM pg_class ic
       JOIN pg_namespace n ON ic.relnamespace = n.oid
       WHERE n.nspname = $1 AND ic.relname = $2`,
      [this.schema, indexName]
    )
    const def = rows[0]?.def
    if (def && !def.includes(expectedOpclass)) {
      logger.warn(
        `[${schema.name}] HNSW index "${indexName}" exists with a different distance metric (config: ${distance}/${expectedOpclass}). ` +
          "CREATE INDEX IF NOT EXISTS won't rebuild it — drop the index to switch distance."
      )
    }
  }

  /** HNSW index on the embedding column + btree/GIN indexes on flagged columns. */
  private async ensureIndexes(
    client: PoolClient,
    schema: PgvectorCollectionSchema,
    embeddingField: string,
    hasEmbedding: boolean,
    distance: CollectionEmbedInfo['distance']
  ): Promise<void> {
    if (hasEmbedding) {
      const { opclass } = DISTANCE_OPS[distance]
      const m = schema.hnsw?.m ?? 16
      const efc = schema.hnsw?.efConstruction ?? 64
      const indexName = `${schema.name}_${embeddingField}_hnsw`
      await client.query(
        `CREATE INDEX IF NOT EXISTS ${ident(indexName)} ON ${this.relName(schema.name)} ` +
          `USING hnsw (${ident(embeddingField)} ${opclass}) WITH (m = ${m}, ef_construction = ${efc})`
      )
    }

    for (const field of schema.fields) {
      if (!field.index || field.name === embeddingField) continue
      const indexName = `${schema.name}_${field.name}_idx`
      const method = field.type === 'text[]' ? 'gin' : 'btree'
      await client.query(
        `CREATE INDEX IF NOT EXISTS ${ident(indexName)} ON ${this.relName(schema.name)} USING ${method} (${ident(field.name)})`
      )
    }
  }

  async collectionExists(collectionName: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>('SELECT to_regclass($1) IS NOT NULL AS exists', [
      `${this.schema}.${collectionName}`
    ])
    return result.rows[0]?.exists ?? false
  }

  async deleteCollection(collectionName: string): Promise<void> {
    await this.pool.query(`DROP TABLE IF EXISTS ${this.relName(collectionName)} CASCADE`)
    this.embedInfo.delete(collectionName)
    logger.info(`Deleted collection (table): ${collectionName}`)
  }

  // === Document Operations ===

  async upsertDocument(collectionName: string, document: IndexDocument): Promise<void> {
    await this.upsertDocuments(collectionName, [document])
  }

  async upsertDocuments(collectionName: string, documents: IndexDocument[]): Promise<void> {
    if (documents.length === 0) return

    const info = this.embedInfo.get(collectionName)
    const vectors = await this.resolveVectors(documents, info)

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      for (let i = 0; i < documents.length; i++) {
        await this.insertRow(client, collectionName, documents[i], vectors[i], info)
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      logger.error(`Failed to upsert ${documents.length} document(s) to ${collectionName}`, error)
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * Atomically replace the rows matching `filter` with `documents`. Embeddings
   * are resolved FIRST (before any delete), then delete + insert run in a single
   * transaction. If embedding fails, nothing is deleted; if any insert fails, the
   * delete rolls back — a reindex can never leave a document with no chunks.
   */
  async replaceDocumentsByFilter(
    collectionName: string,
    filter: Record<string, unknown>,
    documents: IndexDocument[]
  ): Promise<void> {
    const info = this.embedInfo.get(collectionName)
    // Embed before touching the table — a gateway failure must not lose the index.
    const vectors = await this.resolveVectors(documents, info)
    const { clause, params } = this.buildWhere(filter, info?.columnTypes)

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`DELETE FROM ${this.relName(collectionName)}${clause}`, params)
      for (let i = 0; i < documents.length; i++) {
        await this.insertRow(client, collectionName, documents[i], vectors[i], info)
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      logger.error(`Failed to replace documents in ${collectionName}`, error)
      throw error
    } finally {
      client.release()
    }
  }

  async deleteDocument(collectionName: string, documentId: string): Promise<void> {
    const idField = this.embedInfo.get(collectionName)?.idField ?? 'id'
    await this.pool.query(`DELETE FROM ${this.relName(collectionName)} WHERE ${ident(idField)} = $1`, [documentId])
  }

  async deleteDocumentsByFilter(collectionName: string, filter: Record<string, unknown>): Promise<number> {
    const columnTypes = this.embedInfo.get(collectionName)?.columnTypes
    const { clause, params } = this.buildWhere(filter, columnTypes)
    const sql = `DELETE FROM ${this.relName(collectionName)}${clause}`
    const result = await this.pool.query(sql, params)
    return result.rowCount ?? 0
  }

  // === Vector Search ===

  async vectorSearch<TDoc = Record<string, unknown>>(
    collectionName: string,
    vector: number[],
    options: VectorSearchOptions = {}
  ): Promise<AdapterSearchResult<TDoc>[]> {
    const { limit = 10, filter, includeFields, excludeFields } = options
    const info = this.embedInfo.get(collectionName)
    const embeddingField = info?.embeddingField ?? 'embedding'
    const op = DISTANCE_OPS[info?.distance ?? 'cosine'].op

    const params: unknown[] = [toVectorLiteral(vector)]
    const { clause, params: whereParams } = this.buildWhere(filter ?? {}, info?.columnTypes, params.length)
    params.push(...whereParams)
    params.push(limit)

    // Exclude rows with no embedding: `NULL <=> v` is NULL → Number(null) === 0
    // would rank an unembedded row as a perfect match. They can't take part in a
    // vector search anyway.
    const notNull = `${ident(embeddingField)} IS NOT NULL`
    const where = clause ? `${clause} AND ${notNull}` : ` WHERE ${notNull}`

    const sql =
      `SELECT *, ${ident(embeddingField)} ${op} $1::vector AS _distance ` +
      `FROM ${this.relName(collectionName)}${where} ` +
      `ORDER BY ${ident(embeddingField)} ${op} $1::vector ` +
      `LIMIT $${params.length}`

    const result = await this.pool.query(sql, params)
    return result.rows
      .map(row => {
        const distance = Number(row._distance)
        const document = this.projectRow(row, embeddingField, includeFields, excludeFields)
        return {
          id: String((document as Record<string, unknown>)[info?.idField ?? 'id'] ?? ''),
          score: distance,
          document: document as TDoc
        }
      })
      .filter(r => Number.isFinite(r.score))
  }

  /**
   * Semantic search by text: embeds the query via the adapter's EmbeddingProvider
   * and runs vectorSearch. Convenience for read-only consumers (e.g. an MCP)
   * that hold text queries, not vectors.
   */
  async searchByText<TDoc = Record<string, unknown>>(
    collectionName: string,
    text: string,
    options: VectorSearchOptions = {}
  ): Promise<AdapterSearchResult<TDoc>[]> {
    if (!this.embeddingProvider) {
      throw new Error('searchByText requires an EmbeddingProvider on the adapter')
    }
    const [vector] = await this.embeddingProvider.embed([text])
    return this.vectorSearch<TDoc>(collectionName, vector, options)
  }

  // === Optional: Document Query & Partial Update ===

  async searchDocumentsByFilter<TDoc = Record<string, unknown>>(
    collectionName: string,
    filter: Record<string, unknown>,
    options?: { includeFields?: string[]; limit?: number; orderBy?: string }
  ): Promise<TDoc[]> {
    const info = this.embedInfo.get(collectionName)
    const embeddingField = info?.embeddingField ?? 'embedding'
    const { clause, params } = this.buildWhere(filter, info?.columnTypes)
    // Deterministic order when requested — without it Postgres returns an
    // arbitrary subset under LIMIT, silently dropping rows for large documents.
    const orderClause = options?.orderBy ? ` ORDER BY ${ident(options.orderBy)}` : ''
    const limit = options?.limit ?? 250
    params.push(limit)
    const sql = `SELECT * FROM ${this.relName(collectionName)}${clause}${orderClause} LIMIT $${params.length}`
    const result = await this.pool.query(sql, params)
    return result.rows.map(row => this.projectRow(row, embeddingField, options?.includeFields) as TDoc)
  }

  async updateDocument(collectionName: string, documentId: string, partialDoc: Record<string, unknown>): Promise<void> {
    const idField = this.embedInfo.get(collectionName)?.idField ?? 'id'
    const keys = Object.keys(partialDoc)
    if (keys.length === 0) return

    const sets = keys.map((key, i) => `${ident(key)} = $${i + 1}`)
    const params = keys.map(key => this.toParam(partialDoc[key]))
    params.push(documentId)
    const sql = `UPDATE ${this.relName(collectionName)} SET ${sets.join(', ')} WHERE ${ident(idField)} = $${params.length}`
    await this.pool.query(sql, params)
  }

  async updateDocumentsByFilter(
    collectionName: string,
    filter: Record<string, unknown>,
    partialDoc: Record<string, unknown>
  ): Promise<number> {
    const keys = Object.keys(partialDoc)
    if (keys.length === 0) return 0

    const sets = keys.map((key, i) => `${ident(key)} = $${i + 1}`)
    const params = keys.map(key => this.toParam(partialDoc[key]))
    const columnTypes = this.embedInfo.get(collectionName)?.columnTypes
    const { clause, params: whereParams } = this.buildWhere(filter, columnTypes, params.length)
    params.push(...whereParams)
    const sql = `UPDATE ${this.relName(collectionName)} SET ${sets.join(', ')}${clause}`
    const result = await this.pool.query(sql, params)
    return result.rowCount ?? 0
  }

  // === Private helpers ===

  /** Resolve a vector per document: use a precomputed one, else embed embedFrom text. */
  private async resolveVectors(
    documents: IndexDocument[],
    info?: CollectionEmbedInfo
  ): Promise<Array<number[] | null>> {
    const vectors: Array<number[] | null> = documents.map(doc => {
      if (!info) return null
      const existing = doc[info.embeddingField]
      return Array.isArray(existing) && existing.every(v => typeof v === 'number') ? (existing as number[]) : null
    })

    if (!info || info.embedFrom.length === 0) return vectors

    const toEmbedIndexes: number[] = []
    const toEmbedTexts: string[] = []
    for (let i = 0; i < documents.length; i++) {
      if (vectors[i] !== null) continue
      const text = info.embedFrom
        .map(field => documents[i][field])
        .filter(v => typeof v === 'string' && v.length > 0)
        .join('\n')
      if (text.length === 0) continue
      toEmbedIndexes.push(i)
      toEmbedTexts.push(text)
    }

    if (toEmbedTexts.length === 0) return vectors
    if (!this.embeddingProvider) {
      throw new Error(`Collection has embedFrom configured but no EmbeddingProvider was supplied to the adapter`)
    }

    const embedded = await this.embeddingProvider.embed(toEmbedTexts)
    toEmbedIndexes.forEach((docIndex, k) => {
      vectors[docIndex] = embedded[k]
    })
    return vectors
  }

  /** INSERT ... ON CONFLICT (id) DO UPDATE for one document. */
  private async insertRow(
    client: PoolClient,
    collectionName: string,
    document: IndexDocument,
    vector: number[] | null,
    info?: CollectionEmbedInfo
  ): Promise<void> {
    const idField = info?.idField ?? 'id'
    const embeddingField = info?.embeddingField ?? 'embedding'

    const columns: string[] = []
    const placeholders: string[] = []
    const params: unknown[] = []

    for (const [key, value] of Object.entries(document)) {
      if (key === embeddingField) continue // embedding handled below
      columns.push(ident(key))
      params.push(this.toParam(value))
      placeholders.push(`$${params.length}`)
    }

    if (vector !== null) {
      columns.push(ident(embeddingField))
      params.push(toVectorLiteral(vector))
      placeholders.push(`$${params.length}::vector`)
    }

    const updates = columns.filter(col => col !== ident(idField)).map(col => `${col} = EXCLUDED.${col}`)

    const conflict =
      updates.length > 0
        ? `ON CONFLICT (${ident(idField)}) DO UPDATE SET ${updates.join(', ')}`
        : `ON CONFLICT (${ident(idField)}) DO NOTHING`

    const sql =
      `INSERT INTO ${this.relName(collectionName)} (${columns.join(', ')}) ` +
      `VALUES (${placeholders.join(', ')}) ${conflict}`

    await client.query(sql, params)
  }

  /**
   * Build a WHERE clause from a filter object with parameterized values. The
   * operator is chosen by the column's SQL type: array columns (text[], e.g.
   * taxonomy_slugs) use overlap/membership, scalar columns use equality/IN.
   */
  private buildWhere(
    filter: Record<string, unknown>,
    columnTypes: Record<string, PgFieldType> = {},
    paramOffset = 0
  ): { clause: string; params: unknown[] } {
    const conditions: string[] = []
    const params: unknown[] = []

    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) continue
      const isArrayColumn = columnTypes[key] === 'text[]'

      if (isArrayColumn && Array.isArray(value)) {
        // Array column + array filter → overlap (any of the values present).
        params.push(value)
        conditions.push(`${ident(key)} && $${paramOffset + params.length}::text[]`)
      } else if (isArrayColumn) {
        // Array column + scalar filter → membership.
        params.push(value)
        conditions.push(`$${paramOffset + params.length} = ANY(${ident(key)})`)
      } else if (Array.isArray(value)) {
        // Scalar column + multiple values → IN list.
        params.push(value)
        conditions.push(`${ident(key)} = ANY($${paramOffset + params.length}::text[])`)
      } else {
        // Scalar column + scalar value → equality.
        params.push(this.toParam(value))
        conditions.push(`${ident(key)} = $${paramOffset + params.length}`)
      }
    }

    const clause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    return { clause, params }
  }

  /** Convert a JS value to a pg-bindable parameter (jsonb for plain objects). */
  private toParam(value: unknown): unknown {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return JSON.stringify(value)
    }
    return value
  }

  /** Strip the embedding column and internal fields, applying include/exclude. */
  private projectRow(
    row: Record<string, unknown>,
    embeddingField: string,
    includeFields?: string[],
    excludeFields?: string[]
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      if (key === embeddingField || key === '_distance') continue
      if (includeFields && !includeFields.includes(key)) continue
      if (excludeFields?.includes(key)) continue
      out[key] = value
    }
    return out
  }
}
