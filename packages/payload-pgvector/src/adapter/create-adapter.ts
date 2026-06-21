import type { Pool, PoolConfig } from 'pg'
import pg from 'pg'
import {
  type EmbeddingProvider,
  type OpenAICompatibleEmbeddingConfig,
  OpenAICompatibleEmbeddingProvider
} from '../embedding/provider'
import { PgvectorAdapter } from './pgvector-adapter'

const { Pool: PoolCtor } = pg

export interface CreatePgvectorAdapterOptions {
  /** Postgres connection. Either a connection string or a node-pg Pool config. */
  connectionString?: string
  poolConfig?: PoolConfig
  /**
   * Embedding provider, or a shorthand OpenAI-compatible config (e.g. pointing at
   * a LiteLLM gateway). Optional: omit when documents arrive pre-vectorized.
   */
  embeddingProvider?: EmbeddingProvider
  embedding?: OpenAICompatibleEmbeddingConfig
}

/**
 * Build a PgvectorAdapter from a connection string/pool config. Mirrors
 * createTypesenseAdapter. The returned adapter plugs straight into
 * createIndexerPlugin from @zetesis/payload-indexer.
 */
export const createPgvectorAdapter = (options: CreatePgvectorAdapterOptions): PgvectorAdapter => {
  if (!options.connectionString && !options.poolConfig) {
    throw new Error('createPgvectorAdapter requires connectionString or poolConfig')
  }

  const pool = new PoolCtor(options.poolConfig ?? { connectionString: options.connectionString })

  const embeddingProvider =
    options.embeddingProvider ??
    (options.embedding ? new OpenAICompatibleEmbeddingProvider(options.embedding) : undefined)

  return new PgvectorAdapter(pool, { embeddingProvider })
}

/**
 * Build a PgvectorAdapter from an existing node-pg Pool. Use when the app already
 * owns the connection (e.g. sharing Payload's pool).
 */
export const createPgvectorAdapterFromPool = (pool: Pool, embeddingProvider?: EmbeddingProvider): PgvectorAdapter =>
  new PgvectorAdapter(pool, { embeddingProvider })
