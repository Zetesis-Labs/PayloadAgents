# @zetesis/payload-indexer

## [0.4.3](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-indexer-v0.4.2...payload-indexer-v0.4.3) (2026-07-06)


### Features

* updated payload to version 3.85.2 ([0293c78](https://github.com/Zetesis-Labs/PayloadAgents/commit/0293c78f8e07dcc07e0b6f450960a30cf93dfce0))

## [0.4.2](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-indexer-v0.4.1...payload-indexer-v0.4.2) (2026-06-24)


### Features

* pgvector adapter + thin MCP server (A/B vs Typesense) ([#116](https://github.com/Zetesis-Labs/PayloadAgents/issues/116)) ([e66d963](https://github.com/Zetesis-Labs/PayloadAgents/commit/e66d9630ee2bb6d44951dd27092b83ecad46e031))

## [0.4.1](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-indexer-v0.4.0...payload-indexer-v0.4.1) (2026-05-17)


### Bug Fixes

* **security:** timing-safe internal-secret compare + LlamaParse upload limits ([77ac5c6](https://github.com/Zetesis-Labs/PayloadAgents/commit/77ac5c6954abb196b25f3cb3ef0fe120fa32ca28))

## [0.4.0](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-indexer-v0.3.0...payload-indexer-v0.4.0) (2026-05-09)


### ⚠ BREAKING CHANGES

* **indexer,typesense:** removes EmbeddingProviderConfig, EmbeddingService, EmbeddingResolver and their providers; removes IndexerFeatureConfig.embedding, TypesenseRAGPluginConfig.embeddingConfig, and FeatureFlags.embedding; EmbeddingTableConfig.autoEmbed is now required when embedding is set; removes per-table provider overrides, onEmbeddingFailure, reuseEmbeddingsWhenContentUnchanged. See changeset for full migration notes.

### Features

* devcontainer + test server app with chat-agent integration ([#3](https://github.com/Zetesis-Labs/PayloadAgents/issues/3)) ([ee6bd3e](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee6bd3ef11784d315ed65640a144216ef8fd1f5c))
* **indexer,typesense:** autoEmbed only + always-on content-hash skip ([#51](https://github.com/Zetesis-Labs/PayloadAgents/issues/51)) ([3ebb6c0](https://github.com/Zetesis-Labs/PayloadAgents/commit/3ebb6c0b297be36973c3c94876a8afdd3ebd9471))
* initial payload-agents monorepo with 5 packages ([d89ddf4](https://github.com/Zetesis-Labs/PayloadAgents/commit/d89ddf46b914ddf2d9e0664a6ec8bb1e11a577c0))
* replace chat-agent with AG-UI based @zetesis/agent-ui ([#64](https://github.com/Zetesis-Labs/PayloadAgents/issues/64)) ([adf5acd](https://github.com/Zetesis-Labs/PayloadAgents/commit/adf5acd9cf110bf0339389c215be2075bbf69e5e))


### Bug Fixes

* **indexer:** correct afterChange sync — transaction, populate depth, opt-in metadata-only ([#42](https://github.com/Zetesis-Labs/PayloadAgents/issues/42)) ([f875938](https://github.com/Zetesis-Labs/PayloadAgents/commit/f875938212c0adc3e722aa6d76a2b9de75f0e82d))
* issue in tsdown at chat-agent and payload-indexer ([c73a899](https://github.com/Zetesis-Labs/PayloadAgents/commit/c73a89959dba50c31f5563bf21978952f7a8e3ce))
* **payload-indexer:** per-collection defaultColumns wins over global sync default ([305b5df](https://github.com/Zetesis-Labs/PayloadAgents/commit/305b5df7876bb5b61de74c329a714ba90e04181c))
* **payload-indexer:** per-collection defaultColumns wins over global sync default ([c67fece](https://github.com/Zetesis-Labs/PayloadAgents/commit/c67fecedd3ecd05e500fdbeada5a938bf10be191))
* **payload-indexer:** report Typesense outages as status=error, not not-indexed ([1a60057](https://github.com/Zetesis-Labs/PayloadAgents/commit/1a600576986aaca58c70001e6144abd8dbf8e1f1))
* **runtime:** fan out agent reloads via Postgres LISTEN/NOTIFY ([6beb12b](https://github.com/Zetesis-Labs/PayloadAgents/commit/6beb12b1040147b11182911b60ccf876d8ac202c))

## 0.3.0

### Minor Changes

- [#51](https://github.com/Zetesis-Labs/PayloadAgents/pull/51) [`3ebb6c0`](https://github.com/Zetesis-Labs/PayloadAgents/commit/3ebb6c0b297be36973c3c94876a8afdd3ebd9471) Thanks [@Fiser12](https://github.com/Fiser12)! - Drop client-side embedding path across the indexer, the Typesense plugin,
  and the MCP server. `autoEmbed` is now the only embedding mode.

  The search backend (Typesense) generates every vector — on upsert from the
  fields listed in `embedding.autoEmbed.from`, and on search from the `q`
  parameter using the model declared in the collection schema. None of the
  three packages call an embedding API directly.

  **`@zetesis/payload-indexer` breaking changes**

  - `EmbeddingTableConfig.autoEmbed` is now required when `embedding` is set.
  - `AutoEmbedConfig.modelConfig` is now backend-agnostic
    (`Record<string, unknown>`) — adapter packages declare their own typed
    shapes (e.g. `TypesenseAutoEmbedConfig` in `@zetesis/payload-typesense`).
  - Removed `EmbeddingTableConfig.provider`,
    `EmbeddingTableConfig.onEmbeddingFailure`, and
    `EmbeddingTableConfig.reuseEmbeddingsWhenContentUnchanged` (the
    content-hash optimization is now always-on; bypass via
    `req.context.forceReindex` or `SyncOptions.forceReindex`).
  - Removed `IndexerFeatureConfig.embedding`.
  - Removed `IndexerPluginResult.embeddingService` and
    `IndexerPluginResult.embeddingResolver`.
  - Removed exports: `EmbeddingService`, `EmbeddingServiceImpl`,
    `EmbeddingProvider`, `EmbeddingProviderConfig`, `EmbeddingProviderType`,
    `EmbeddingResult`, `EmbeddingUsage`, `BatchEmbeddingResult`,
    `OpenAIProviderConfig`, `OpenAIEmbeddingProvider`, `OpenAIEmbeddingModel`,
    `GeminiProviderConfig`, `GeminiEmbeddingProvider`, `GeminiEmbeddingModel`,
    `EmbeddingFailureBehavior`, `EmbeddingResolver`, `createEmbeddingService`,
    `DEFAULT_EMBEDDING_MODEL`, `DEFAULT_GEMINI_EMBEDDING_MODEL`,
    `DEFAULT_EMBEDDING_DIMENSIONS`, `MIN_EMBEDDING_TEXT_LENGTH`.
  - `syncDocumentToIndex` no longer accepts an `embeddingService` argument.
    Same for `DocumentSyncer`. `syncDocumentToIndex` and `DocumentSyncer`
    accept an optional `SyncOptions { forceReindex?: boolean }` to bypass the
    content-hash optimization.
  - `applySyncHooks` no longer accepts an `embeddingResolver` argument.
  - `createSyncStatusEndpoints` no longer accepts an `embeddingService`
    argument.
  - Removed `@google/generative-ai` from dependencies.

  The content-hash optimization runs unconditionally: when an update's
  source-text hash matches the stored one, the indexer issues a partial
  metadata update via `updateDocumentsByFilter` (chunks) or `updateDocument`
  (single docs), skipping the re-chunk/re-upsert and the backend's
  re-embedding cost. Adapters that don't implement those partial-update
  methods fall back to the full re-sync path automatically. Bypass with
  `req.context.forceReindex = true` or `SyncOptions.forceReindex`.

  **`@zetesis/payload-typesense` breaking changes**

  - Removed `TypesenseRAGPluginConfig.embeddingConfig`.
  - Removed `FeatureFlags.embedding` from `ModularPluginConfig`.
  - Removed exports: `generateEmbedding`, `generateEmbeddingWithUsage`,
    `generateEmbeddingsBatchWithUsage`, `EmbeddingProviderConfig`,
    `EmbeddingWithUsage`, `BatchEmbeddingWithUsage`.
  - `RAGSearchConfig` no longer has `autoEmbedCollections`. `RAGChatRequest`
    no longer has `queryEmbedding`. `TypesenseQueryConfig` no longer has
    `queryEmbedding` or `autoEmbedCollections`.
  - `BuildVectorSearchParamsOptions` no longer has `autoEmbed`.
    `buildVectorSearchParams` no longer accepts a precomputed search vector —
    Typesense always embeds the query.
  - `buildMultiCollectionVectorSearchParams` no longer accepts a `searchVector`
    argument — autoEmbed is the only mode.
  - Schema generation: a table without `embedding.autoEmbed` no longer gets
    an `embedding` field at all (was previously optional with `num_dim`).
    Vector search filters out such tables.
  - Removed `@google/generative-ai` and `openai` from dependencies.
  - Added `TypesenseAutoEmbedConfig` and `TypesenseModelConfig` exports for
    typing the per-table `embedding.autoEmbed` config.

  **`@zetesis/mcp-typesense` breaking changes**

  - `McpServerConfig.embeddings` removed. `createMcpServer` no longer needs
    any embedding provider config — the MCP package sends queries as text
    and Typesense embeds them server-side using each chunk collection's
    declared `embed.model_config`.
  - Removed exports: `EmbeddingConfig`.
  - Removed internal `embeddings/openai.ts` module and the `openai` runtime
    dependency.
  - Search builders for `mode: 'semantic'` and `mode: 'hybrid'` now emit
    `vector_query: 'embedding:([], k:N[, alpha:...])'` and force
    `prefix: false` (Typesense rejects prefix search whenever a remote
    embedder participates in `query_by`). Hybrid `query_by` now includes
    the `embedding` field so the autoEmbed flow kicks in.
  - Each chunk collection must declare `embed.from` + `embed.model_config`
    on its Typesense schema (e.g. via `@zetesis/payload-typesense`'s
    `embedding.autoEmbed`). Without it, semantic and hybrid modes fall
    through to a Typesense error; lexical still works unchanged.

  **Migration**

  For any indexed table that produced embeddings under the old API, declare
  `autoEmbed` and drop the existing Typesense collection so it is recreated
  with the new `embed` block. Type the value via `TypesenseAutoEmbedConfig`
  (re-exported from `@zetesis/payload-typesense`) to keep `modelConfig`
  type-safe:

  ```ts
  import type { TypesenseAutoEmbedConfig } from '@zetesis/payload-typesense'

  const autoEmbed: TypesenseAutoEmbedConfig = {
    from: ['chunk_text'],
    modelConfig: {
      modelName: 'openai/text-embedding-3-small',
      apiKey: process.env.OPENAI_API_KEY!
    }
  }

  // then…
  {
    embedding: {
      fields: ['content'],
      chunking: { strategy: 'markdown' },
      autoEmbed
    }
  }
  ```

  After deploying, drop the affected `*_chunk` collections in Typesense and
  re-sync: existing documents have a client-supplied `embedding` that the new
  schema rejects.

- [#51](https://github.com/Zetesis-Labs/PayloadAgents/pull/51) [`3ebb6c0`](https://github.com/Zetesis-Labs/PayloadAgents/commit/3ebb6c0b297be36973c3c94876a8afdd3ebd9471) Thanks [@Fiser12](https://github.com/Fiser12)! - Per-table embedding strategy + Typesense auto-embedding.

  `EmbeddingTableConfig` accepts two new mutually exclusive fields:

  - `provider` — overrides the global `features.embedding` for a single
    table, so you can mix providers (e.g. OpenAI Large on one table, Gemini
    on another) without writing a second plugin instance.
  - `autoEmbed` — declares `embed.from` and `embed.model_config` on the
    Typesense schema. The indexer no longer computes embeddings for that
    table and search no longer round-trips to OpenAI/Gemini for the query
    vector — Typesense embeds documents on upsert and queries on search,
    using the model declared in the schema (incl. built-in
    `ts/multilingual-e5-large`, `ts/e5-small`, etc.).

  `features.embedding` is now optional at the plugin level and acts as a
  fallback for tables that don't declare their own provider. Backwards
  compatible: existing configs keep working.

  Internally, `createIndexerPlugin` exposes a new `embeddingResolver` that
  returns the right `EmbeddingService` per table (or `undefined` when the
  backend handles embedding). Sync hooks were rewired to use it.

## 0.2.5

### Patch Changes

- [#42](https://github.com/Zetesis-Labs/PayloadAgents/pull/42) [`f875938`](https://github.com/Zetesis-Labs/PayloadAgents/commit/f875938212c0adc3e722aa6d76a2b9de75f0e82d) Thanks [@Fiser12](https://github.com/Fiser12)! - Three fixes that together make `afterChange` indexing correct out of the box:

  **Refetch through the request transaction.** The `afterChange` hook now passes `req` to `payload.findByID` when repopulating, so the read joins the same transaction as the save that triggered the hook. Without this, Payload opens a new connection and reads the pre-commit snapshot, returning stale field values (e.g. the title from before the user's edit).

  **Add `TableConfig.syncDepth`.** Payload calls `afterChange` with `depth=0`, so relationship fields arrive as IDs and any field `transform` that needs populated relations (e.g. extracting `slug` from a related taxonomy doc) silently produces empty output. Set `syncDepth: 1` (or higher) on a table config to make the hook refetch the doc with that depth before running transforms. Default `0` — existing consumers see no behavior change and no extra query. The hook picks the highest `syncDepth` across enabled tables for the collection so a single refetch covers all of them.

  **Make the metadata-only optimization opt-in** via `EmbeddingTableConfig.reuseEmbeddingsWhenContentUnchanged` (default `false`). Previously, on `update` operations the syncer compared the content hash and, when unchanged, performed a partial update of mapped fields instead of re-chunking + re-embedding. That partial-update path can leave non-content fields stale in subtle ways. Default behavior is now to always run a full re-sync on update; consumers who have validated the partial path for their adapter and field set can opt in for the embedding-cost saving.

## 0.2.3

### Patch Changes

- [#28](https://github.com/Zetesis-Labs/PayloadAgents/pull/28) [`c67fece`](https://github.com/Zetesis-Labs/PayloadAgents/commit/c67fecedd3ecd05e500fdbeada5a938bf10be191) Thanks [@Fiser12](https://github.com/Fiser12)! - Fix `defaultColumns` precedence so the per-collection `admin.defaultColumns` wins over the global `syncConfig.defaultColumns` (the global is now a fallback for collections that haven't picked their own list).

  Previously the global default silently overrode every indexed collection — e.g. `@zetesis/payload-documents` ships `['filename', 'parse_status', 'parsed_at']` but the host's global `['title', '_syncStatus', 'slug', 'categorias']` was applied instead, leaving only `_syncStatus` rendered (the other columns don't exist on the documents schema).

## 0.2.2

### Patch Changes

- [#21](https://github.com/Zetesis-Labs/PayloadAgents/pull/21) [`1a60057`](https://github.com/Zetesis-Labs/PayloadAgents/commit/1a600576986aaca58c70001e6144abd8dbf8e1f1) Thanks [@Fiser12](https://github.com/Fiser12)! - Distinguish "not indexed" from "lookup failed" in `checkBatchSyncStatus`.

  Previously, when Typesense was down or the adapter lacked
  `searchDocumentsByFilter`, every document in the batch came back as
  `'not-indexed'` — so the admin list view implied the index was empty
  instead of surfacing the outage.

  `getIndexedHashes` now returns a lookup shape with three distinct states
  (`hashes` / `errored` / `adapterUnsupported`). `checkBatchSyncStatus` maps
  those to `status: 'error'` with a descriptive `error` string, matching
  what the single-document `checkSyncStatus` already returns.

  Closes Zetesis-Labs/ZetesisPortal#107.

## 0.2.0

### Minor Changes

- [#10](https://github.com/Zetesis-Labs/PayloadAgents/pull/10) [`670062b`](https://github.com/Zetesis-Labs/PayloadAgents/commit/670062b0f4928a36db8f60b83ff584320d3b19ad) Thanks [@Fiser12](https://github.com/Fiser12)! - added use of agno as main agent system

## 0.1.3

### Patch Changes

- [`c73a899`](https://github.com/Zetesis-Labs/PayloadAgents/commit/c73a89959dba50c31f5563bf21978952f7a8e3ce) - fix: issue regarding jsx tsdown build compilation

## 0.1.2

### Patch Changes

- [`2b1c2ca`](https://github.com/Zetesis-Labs/PayloadAgents/commit/2b1c2ca09ffe29d9b3be9a6528cc8fc5694e5284) - updated payloadcms to version 3.81.0

## 0.1.1

### Patch Changes

- [#3](https://github.com/Zetesis-Labs/PayloadAgents/pull/3) [`ee6bd3e`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee6bd3ef11784d315ed65640a144216ef8fd1f5c) Thanks [@Fiser12](https://github.com/Fiser12)! - updated payload to 3.79.1

- [#3](https://github.com/Zetesis-Labs/PayloadAgents/pull/3) [`ee6bd3e`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee6bd3ef11784d315ed65640a144216ef8fd1f5c) Thanks [@Fiser12](https://github.com/Fiser12)! - added requireTaxonomies to payload-typesense

- [#3](https://github.com/Zetesis-Labs/PayloadAgents/pull/3) [`ee6bd3e`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee6bd3ef11784d315ed65640a144216ef8fd1f5c) Thanks [@Fiser12](https://github.com/Fiser12)! - changed react dependencies to 19^

## 0.1.0

### Patch Changes

- Initial release under @zetesis scope
