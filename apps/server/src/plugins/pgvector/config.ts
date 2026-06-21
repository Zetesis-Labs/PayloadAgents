import type { OpenAICompatibleEmbeddingConfig } from '@zetesis/payload-pgvector'

/** Postgres connection for the pgvector tables (same DB as Payload). */
export const pgvectorConnectionString = process.env.DATABASE_URL || ''

/**
 * Dedicated Postgres schema for the pgvector tables. Keeps them OUT of `public`
 * so Payload/Drizzle's schema push doesn't treat them as unmanaged and drop them.
 */
export const pgvectorSchema = 'pgvector'

/**
 * Embedding routed through the LiteLLM gateway (OpenAI-compatible). The
 * `embeddings-dev` alias is seeded in the devcontainer LiteLLM catalog and
 * pins `text-embedding-3-small` (1536 dims). Index-time and query-time MUST use
 * this same alias.
 */
export const pgvectorEmbedding: OpenAICompatibleEmbeddingConfig = {
  baseUrl: process.env.LITELLM_PROXY_URL || 'http://litellm:4000/v1',
  apiKey: process.env.LITELLM_MASTER_KEY || '',
  model: 'embeddings-dev',
  dimensions: 1536,
  // text-embedding-3-small honours dimensionality reduction, so pin it explicitly.
  sendDimensions: true
}
