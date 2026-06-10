# @zetesis/mcp-typesense

## [0.6.0](https://github.com/Zetesis-Labs/PayloadAgents/compare/mcp-typesense-v0.5.1...mcp-typesense-v0.6.0) (2026-05-21)


### ⚠ BREAKING CHANGES

* **mcp-typesense:** `createDeepInfraBgeReranker` and `createDeepInfraJinaReranker` exports replaced by `createDeepInfraReranker(model, config)`. Custom reranker registrations in `RerankerFactoryConfig.custom` now receive the model identifier as their argument.

### Features

* **mcp-typesense:** add reranker closure primitives and factory ([61cfaf2](https://github.com/Zetesis-Labs/PayloadAgents/commit/61cfaf201f922bb79395e3e1522b1f7f0fc22f00))
* **mcp-typesense:** apply SearchProfile.queryRewrite Mustache template before retrieval ([d00479a](https://github.com/Zetesis-Labs/PayloadAgents/commit/d00479a69227c6434ec003495571382df8c32d4b))
* **mcp-typesense:** emit OpenTelemetry spans for retrieval observability ([a5eaccc](https://github.com/Zetesis-Labs/PayloadAgents/commit/a5eaccc9c9040ce3fc7ea72490c3fdebe9ee505a))
* **mcp-typesense:** wire reranker + retrieval params into search flow ([f1fc308](https://github.com/Zetesis-Labs/PayloadAgents/commit/f1fc3086516fa76f663a888d4da3d020831a5951))
* SearchProfiles collection + reranker closures for two-stage retrieval ([4206f73](https://github.com/Zetesis-Labs/PayloadAgents/commit/4206f738fd1589d1c8ed8000bf9013354710bcd5))


### Bug Fixes

* **mcp-typesense:** resolve auth per request instead of per session ([1288c5b](https://github.com/Zetesis-Labs/PayloadAgents/commit/1288c5be2fa4ac0172d3c059b5c522f4950e3509))

## [0.5.1](https://github.com/Zetesis-Labs/PayloadAgents/compare/mcp-typesense-v0.5.0...mcp-typesense-v0.5.1) (2026-05-17)


### Bug Fixes

* **security:** timing-safe internal-secret compare + LlamaParse upload limits ([77ac5c6](https://github.com/Zetesis-Labs/PayloadAgents/commit/77ac5c6954abb196b25f3cb3ef0fe120fa32ca28))

## [0.5.0](https://github.com/Zetesis-Labs/PayloadAgents/compare/mcp-typesense-v0.4.0...mcp-typesense-v0.5.0) (2026-05-09)


### ⚠ BREAKING CHANGES

* **indexer,typesense:** removes EmbeddingProviderConfig, EmbeddingService, EmbeddingResolver and their providers; removes IndexerFeatureConfig.embedding, TypesenseRAGPluginConfig.embeddingConfig, and FeatureFlags.embedding; EmbeddingTableConfig.autoEmbed is now required when embedding is set; removes per-table provider overrides, onEmbeddingFailure, reuseEmbeddingsWhenContentUnchanged. See changeset for full migration notes.

### Features

* added agno finaly to payload-agents ([670062b](https://github.com/Zetesis-Labs/PayloadAgents/commit/670062b0f4928a36db8f60b83ff584320d3b19ad))
* added mcp to repository ([02afa35](https://github.com/Zetesis-Labs/PayloadAgents/commit/02afa352c24c7b61bb737af254b67d8b354d18af))
* **indexer,typesense:** autoEmbed only + always-on content-hash skip ([#51](https://github.com/Zetesis-Labs/PayloadAgents/issues/51)) ([3ebb6c0](https://github.com/Zetesis-Labs/PayloadAgents/commit/3ebb6c0b297be36973c3c94876a8afdd3ebd9471))
* **mcp-typesense,payload-agents-core:** scope MCP search by folder ([#68](https://github.com/Zetesis-Labs/PayloadAgents/issues/68)) ([43dbd87](https://github.com/Zetesis-Labs/PayloadAgents/commit/43dbd87481e1c4fe63bc6ae5c931dedffb258518))
* **mcp-typesense:** enforce taxonomy filtering server-side via header ([7dd730a](https://github.com/Zetesis-Labs/PayloadAgents/commit/7dd730a68fe742793b9acbc4046e639cf04c6dc3))
* replace chat-agent with AG-UI based @zetesis/agent-ui ([#64](https://github.com/Zetesis-Labs/PayloadAgents/issues/64)) ([adf5acd](https://github.com/Zetesis-Labs/PayloadAgents/commit/adf5acd9cf110bf0339389c215be2075bbf69e5e))
* uv workspace backend + MCP token taxonomies + release-please ([#44](https://github.com/Zetesis-Labs/PayloadAgents/issues/44)) ([5ffdff5](https://github.com/Zetesis-Labs/PayloadAgents/commit/5ffdff5b574026a6a16be52166c1be350c1ad326))


### Bug Fixes

* **mcp-typesense:** surface silent failures in embeddings, taxonomy, and stats ([0d4ec09](https://github.com/Zetesis-Labs/PayloadAgents/commit/0d4ec09492d2c2ab21b7834a507eb1cf6b99bbae))

## 0.4.0

### Minor Changes

- [`43dbd87`](https://github.com/Zetesis-Labs/PayloadAgents/commit/43dbd87481e1c4fe63bc6ae5c931dedffb258518) Thanks [@Fiser12](https://github.com/Fiser12)! - **Folder-scoped MCP search**: parse the new `x-folder-slugs` header and
  auto-apply it as the `folder_slugs` filter on every search.

  Mirrors the existing `x-taxonomy-slugs` plumbing:

  - `McpAuthContext` gains an optional `folderSlugs?: string[]` field.
  - The default `header` auth strategy parses comma-separated values from
    the `x-folder-slugs` request header.
  - `searchCollections` injects `folder_slugs:[…]` into `scopedFilters`
    when `auth.folderSlugs` is non-empty and the caller hasn't already
    set the filter explicitly.
  - `getPostSummaries` mirrors the same auto-scoping for both
    `taxonomy_slugs` (when not already narrowed via `author_slug` /
    `topic_slug`) and `folder_slugs`. A token-scoped client now sees a
    consistent corpus across listing and search.

  The slug chain is expected to mirror the folder breadcrumb (root →
  leaf), so a token scoped to "Proyectos" matches every doc nested below
  it. Documentation in `defaults.ts` (DEFAULT_INSTRUCTIONS / DEFAULT_GUIDE)
  mentions the new filter alongside `taxonomy_slugs`.

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

## 0.2.1

### Patch Changes

- [#44](https://github.com/Zetesis-Labs/PayloadAgents/pull/44) [`5ffdff5`](https://github.com/Zetesis-Labs/PayloadAgents/commit/5ffdff5b574026a6a16be52166c1be350c1ad326) Thanks [@Fiser12](https://github.com/Fiser12)! - Allow taxonomy-only auth contexts. The header strategy used to discard the entire context whenever `x-tenant-slug` was missing, even if `x-taxonomy-slugs` was present. Single-tenant deploys (no tenant header) couldn't auto-scope by taxonomy at all. Now `resolveAuth` returns a context whenever at least one of the two headers is present and `tenantSlug` becomes optional in the resolved object. Multi-tenant deploys keep working unchanged because they always send both headers.

## 0.2.0

### Minor Changes

- [#10](https://github.com/Zetesis-Labs/PayloadAgents/pull/10) [`670062b`](https://github.com/Zetesis-Labs/PayloadAgents/commit/670062b0f4928a36db8f60b83ff584320d3b19ad) Thanks [@Fiser12](https://github.com/Fiser12)! - added use of agno as main agent system

### Patch Changes

- [`0d4ec09`](https://github.com/Zetesis-Labs/PayloadAgents/commit/0d4ec09492d2c2ab21b7834a507eb1cf6b99bbae) - fix: surface silent failures in embeddings, taxonomy cache, and collection stats

  - Log OpenAI embedding errors instead of swallowing them silently
  - Throw on taxonomy mid-pagination failure instead of caching partial results; fall back to stale cache if available
  - Include error/error_message fields in collection stats when Typesense is unavailable

## 0.1.1

### Patch Changes

- [`02afa35`](https://github.com/Zetesis-Labs/PayloadAgents/commit/02afa352c24c7b61bb737af254b67d8b354d18af) - feat: first version zetesis mcp builder
