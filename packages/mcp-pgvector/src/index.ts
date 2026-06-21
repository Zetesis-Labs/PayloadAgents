/**
 * @zetesis/mcp-pgvector
 *
 * Thin MCP server over a pgvector index, for A/B comparison against
 * @zetesis/mcp-typesense. Intentionally minimal and pgvector-native — it does
 * not emulate Typesense's retrieval semantics.
 */

export type {
  PgvectorMcpCollection,
  PgvectorMcpConfig,
  PgvectorMcpHandle
} from './server'
export { createPgvectorMcpServer } from './server'
