# @zetesis/mcp-pgvector

A deliberately **thin** MCP server over a pgvector-backed index
(`@zetesis/payload-pgvector`). Built for **A/B comparison against
`@zetesis/mcp-typesense`** — it does NOT share a search contract with it
(score scale, total counts, no hybrid/RRF, no facets are pgvector-native on
purpose). Private/internal (not published).

Three read tools: `search_collections`, `get_chunks_by_parent`, `get_chunks_by_ids`.

## Run (standalone, for evaluation)

Index some content into the `pgvector` schema (via `@zetesis/payload-pgvector` +
`createIndexerPlugin`, or a seed that calls `adapter.upsertDocuments`), then:

```bash
DATABASE_URL=postgres://... \
LITELLM_PROXY_URL=http://litellm:4000/v1 \
LITELLM_MASTER_KEY=... \
MCP_PGVECTOR_PORT=3041 \
node dist/standalone.mjs
# → [mcp-pgvector] running on http://0.0.0.0:3041/mcp
```

Then point an MCP client (or LiteLLM) at `http://localhost:3041/mcp` and compare
results against the Typesense MCP for the same queries.

## Security

- Trusted headers scope every query as **non-overridable** filters (a client cannot
  widen them): `x-tenant-slug` → a hard `tenant` boundary, `x-taxonomy-slugs` → an
  optional `taxonomy_slugs` refinement. For a multi-tenant deployment the table must
  have a `tenant` column and the proxy must always inject `x-tenant-slug`.
- `MCP_PGVECTOR_REQUIRE_SCOPE=true` denies unscoped requests (deny-by-default) where
  every caller is expected to be tenant-scoped.
- Collection names are **allowlisted** to the configured tables; the SQL identifier
  guard alone would otherwise let any table in the schema be queried.
- Listens on `0.0.0.0` with no auth of its own — run it behind a trusted proxy /
  NetworkPolicy, never directly exposed.
