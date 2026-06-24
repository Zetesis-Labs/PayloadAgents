# @zetesis/payload-pgvector

A Postgres + **pgvector** search backend for Payload CMS. Implements the
`@zetesis/payload-indexer` `IndexerAdapter` contract — a sibling of
`@zetesis/payload-typesense` — with **app-side embeddings** via any
OpenAI-compatible endpoint (OpenAI, a LiteLLM gateway, a local TEI/Ollama
server, …). Unlike Typesense, pgvector does not embed for you: vectors are
produced app-side before they hit the database.

## Install

```bash
pnpm add @zetesis/payload-pgvector @zetesis/payload-indexer pg
```

Requires the `vector` extension and a **dedicated schema** (never `public`, so a
Payload/Drizzle schema push can't treat the raw tables as unmanaged and drop them):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS pgvector;
```

## Usage

```ts
import { createPgvectorAdapter, createPgvectorPlugin } from '@zetesis/payload-pgvector'
import { createIndexerPlugin } from '@zetesis/payload-indexer'

const adapter = createPgvectorAdapter({
  connectionString: process.env.DATABASE_URL!,
  schema: 'pgvector', // required, dedicated
  embedding: {
    baseUrl: process.env.LITELLM_PROXY_URL!, // any OpenAI-compatible /embeddings
    apiKey: process.env.EMBEDDINGS_API_KEY!,
    model: 'text-embedding-3-small',
    dimensions: 1536,
    sendDimensions: true // text-embedding-3-* honour it; off for ada-002/TEI/Ollama
  }
})

// Document sync (hooks) + schema sync (ensure tables on init):
const { plugin: indexerPlugin } = createIndexerPlugin({ adapter, features: { sync: { enabled: true } }, collections })
const schemaPlugin = createPgvectorPlugin({ adapter, collections, dimensions: 1536 })
// add both to your Payload `plugins`
```

Query (read-only consumers, e.g. an MCP server):

```ts
const hits = await adapter.searchByText('posts_chunk', 'justicia sin estado', { limit: 10 })
```

## Notes

- **Atomic reindex**: `replaceDocumentsByFilter` embeds *before* deleting and runs
  delete+insert in one transaction, so a failed reindex never wipes the old index.
- **Schema sync is additive** (`CREATE/ADD … IF NOT EXISTS`) and warns on incompatible
  drift (vector dimension / HNSW distance) — change those by dropping & recreating.
- Index-time and query-time **must** use the same model + dimensions, or similarity is garbage.
