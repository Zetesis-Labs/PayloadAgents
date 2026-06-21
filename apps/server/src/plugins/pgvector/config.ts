import type { OpenAICompatibleEmbeddingConfig } from '@zetesis/payload-pgvector'

/** Postgres connection for the pgvector tables (same DB as Payload). */
export const pgvectorConnectionString = process.env.DATABASE_URL || ''

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
  dimensions: 1536
}
