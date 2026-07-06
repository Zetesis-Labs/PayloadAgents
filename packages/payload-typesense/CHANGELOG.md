# @zetesis/payload-typesense

## [0.4.3](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-typesense-v0.4.2...payload-typesense-v0.4.3) (2026-07-06)


### Features

* updated payload to version 3.85.2 ([0293c78](https://github.com/Zetesis-Labs/PayloadAgents/commit/0293c78f8e07dcc07e0b6f450960a30cf93dfce0))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @zetesis/payload-indexer bumped to 0.4.3

## [0.4.2](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-typesense-v0.4.1...payload-typesense-v0.4.2) (2026-06-24)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @zetesis/payload-indexer bumped to 0.4.2

## [0.4.1](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-typesense-v0.4.0...payload-typesense-v0.4.1) (2026-05-17)


### Bug Fixes

* **security:** timing-safe internal-secret compare + LlamaParse upload limits ([77ac5c6](https://github.com/Zetesis-Labs/PayloadAgents/commit/77ac5c6954abb196b25f3cb3ef0fe120fa32ca28))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @zetesis/payload-indexer bumped to 0.4.1

## [0.4.0](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-typesense-v0.3.1...payload-typesense-v0.4.0) (2026-05-09)


### ⚠ BREAKING CHANGES

* **indexer,typesense:** removes EmbeddingProviderConfig, EmbeddingService, EmbeddingResolver and their providers; removes IndexerFeatureConfig.embedding, TypesenseRAGPluginConfig.embeddingConfig, and FeatureFlags.embedding; EmbeddingTableConfig.autoEmbed is now required when embedding is set; removes per-table provider overrides, onEmbeddingFailure, reuseEmbeddingsWhenContentUnchanged. See changeset for full migration notes.

### Features

* devcontainer + test server app with chat-agent integration ([#3](https://github.com/Zetesis-Labs/PayloadAgents/issues/3)) ([ee6bd3e](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee6bd3ef11784d315ed65640a144216ef8fd1f5c))
* **indexer,typesense:** autoEmbed only + always-on content-hash skip ([#51](https://github.com/Zetesis-Labs/PayloadAgents/issues/51)) ([3ebb6c0](https://github.com/Zetesis-Labs/PayloadAgents/commit/3ebb6c0b297be36973c3c94876a8afdd3ebd9471))
* initial payload-agents monorepo with 5 packages ([d89ddf4](https://github.com/Zetesis-Labs/PayloadAgents/commit/d89ddf46b914ddf2d9e0664a6ec8bb1e11a577c0))
* replace chat-agent with AG-UI based @zetesis/agent-ui ([#64](https://github.com/Zetesis-Labs/PayloadAgents/issues/64)) ([adf5acd](https://github.com/Zetesis-Labs/PayloadAgents/commit/adf5acd9cf110bf0339389c215be2075bbf69e5e))


### Bug Fixes

* linter issues ([61d9125](https://github.com/Zetesis-Labs/PayloadAgents/commit/61d912527ffe4ba8714ac0a07c5d297ce4b0d394))
* small issues ([f4db5af](https://github.com/Zetesis-Labs/PayloadAgents/commit/f4db5af8873cc36d3742f07cc3c4983c9b0cbc98))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @zetesis/payload-indexer bumped to 0.4.0

## 0.3.1

### Patch Changes

- [#64](https://github.com/Zetesis-Labs/PayloadAgents/pull/64) [`adf5acd`](https://github.com/Zetesis-Labs/PayloadAgents/commit/adf5acd9cf110bf0339389c215be2075bbf69e5e) Thanks [@Fiser12](https://github.com/Fiser12)! - feat: replace `@zetesis/chat-agent` with `@zetesis/agent-ui` (AG-UI based)

  The chat surface is now built on top of the AG-UI protocol with assistant-ui:

  - New package `@zetesis/agent-ui` exposes `AgentChatProvider`, `AgentThread`, `AgentThreadList` and helper components (`MarkdownText`, `Sources`, `ToolCalls`, `TokenUsageBar`, `LimitAlert`).
  - The runtime endpoint `POST /agents/{slug}/runs` is replaced by an AG-UI compliant `POST /agents/{slug}/agui` (multi-agent dispatcher around Agno's built-in `agno.os.interfaces.agui`). `agno-agent-builder` now depends on `ag-ui-protocol`.
  - `payload-agents-core`'s `/chat` endpoint accepts a vanilla `RunAgentInput` body (portal-specific routing rides inside `forwardedProps.agentSlug`) and passes AG-UI events through unchanged. `translateAgnoStream` is removed; `passthroughAguiStream` replaces it.
  - `selectedDocuments` is removed end-to-end (BFF schema, RAG search handler, RAG query builder, plugin types, dashboard read-only thread).
  - `payload-agents-metrics` swaps the legacy `Thread` runtime in its session side panel for a static read-only renderer using `MarkdownText`/`Sources`/`ToolCalls` from the new package.

  The legacy `@zetesis/chat-agent` package is deleted.

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

### Patch Changes

- Updated dependencies [[`3ebb6c0`](https://github.com/Zetesis-Labs/PayloadAgents/commit/3ebb6c0b297be36973c3c94876a8afdd3ebd9471), [`3ebb6c0`](https://github.com/Zetesis-Labs/PayloadAgents/commit/3ebb6c0b297be36973c3c94876a8afdd3ebd9471)]:
  - @zetesis/payload-indexer@0.3.0

## 0.2.5

### Patch Changes

- Updated dependencies [[`f875938`](https://github.com/Zetesis-Labs/PayloadAgents/commit/f875938212c0adc3e722aa6d76a2b9de75f0e82d)]:
  - @zetesis/payload-indexer@0.2.5

## 0.2.3

### Patch Changes

- Updated dependencies [[`c67fece`](https://github.com/Zetesis-Labs/PayloadAgents/commit/c67fecedd3ecd05e500fdbeada5a938bf10be191)]:
  - @zetesis/payload-indexer@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [[`1a60057`](https://github.com/Zetesis-Labs/PayloadAgents/commit/1a600576986aaca58c70001e6144abd8dbf8e1f1)]:
  - @zetesis/payload-indexer@0.2.2

## 0.2.0

### Minor Changes

- [#10](https://github.com/Zetesis-Labs/PayloadAgents/pull/10) [`670062b`](https://github.com/Zetesis-Labs/PayloadAgents/commit/670062b0f4928a36db8f60b83ff584320d3b19ad) Thanks [@Fiser12](https://github.com/Fiser12)! - added use of agno as main agent system

### Patch Changes

- Updated dependencies [[`670062b`](https://github.com/Zetesis-Labs/PayloadAgents/commit/670062b0f4928a36db8f60b83ff584320d3b19ad)]:
  - @zetesis/payload-indexer@0.2.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`c73a899`](https://github.com/Zetesis-Labs/PayloadAgents/commit/c73a89959dba50c31f5563bf21978952f7a8e3ce)]:
  - @zetesis/payload-indexer@0.1.3

## 0.1.2

### Patch Changes

- [`2b1c2ca`](https://github.com/Zetesis-Labs/PayloadAgents/commit/2b1c2ca09ffe29d9b3be9a6528cc8fc5694e5284) - updated payloadcms to version 3.81.0

- Updated dependencies [[`2b1c2ca`](https://github.com/Zetesis-Labs/PayloadAgents/commit/2b1c2ca09ffe29d9b3be9a6528cc8fc5694e5284)]:
  - @zetesis/payload-indexer@0.1.2

## 0.1.1

### Patch Changes

- [#3](https://github.com/Zetesis-Labs/PayloadAgents/pull/3) [`ee6bd3e`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee6bd3ef11784d315ed65640a144216ef8fd1f5c) Thanks [@Fiser12](https://github.com/Fiser12)! - updated payload to 3.79.1

- [#3](https://github.com/Zetesis-Labs/PayloadAgents/pull/3) [`ee6bd3e`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee6bd3ef11784d315ed65640a144216ef8fd1f5c) Thanks [@Fiser12](https://github.com/Fiser12)! - added requireTaxonomies to payload-typesense

- [#3](https://github.com/Zetesis-Labs/PayloadAgents/pull/3) [`ee6bd3e`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee6bd3ef11784d315ed65640a144216ef8fd1f5c) Thanks [@Fiser12](https://github.com/Fiser12)! - changed react dependencies to 19^

- Updated dependencies [[`ee6bd3e`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee6bd3ef11784d315ed65640a144216ef8fd1f5c), [`ee6bd3e`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee6bd3ef11784d315ed65640a144216ef8fd1f5c), [`ee6bd3e`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee6bd3ef11784d315ed65640a144216ef8fd1f5c)]:
  - @zetesis/payload-indexer@0.1.1

## 0.1.0

### Patch Changes

- Initial release under @zetesis scope
