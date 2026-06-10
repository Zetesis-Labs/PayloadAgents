# @zetesis/payload-agents-core

## [0.6.0](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-agents-core-v0.5.2...payload-agents-core-v0.6.0) (2026-05-21)


### ⚠ BREAKING CHANGES

* **mcp-typesense:** `createDeepInfraBgeReranker` and `createDeepInfraJinaReranker` exports replaced by `createDeepInfraReranker(model, config)`. Custom reranker registrations in `RerankerFactoryConfig.custom` now receive the model identifier as their argument.

### Features

* **mcp-typesense:** add reranker closure primitives and factory ([61cfaf2](https://github.com/Zetesis-Labs/PayloadAgents/commit/61cfaf201f922bb79395e3e1522b1f7f0fc22f00))
* **mcp-typesense:** wire reranker + retrieval params into search flow ([f1fc308](https://github.com/Zetesis-Labs/PayloadAgents/commit/f1fc3086516fa76f663a888d4da3d020831a5951))
* **payload-agents-core:** add SearchProfiles collection factory ([6bec978](https://github.com/Zetesis-Labs/PayloadAgents/commit/6bec97822c5e6992535ad93d2ecf034b59711730))
* SearchProfiles collection + reranker closures for two-stage retrieval ([4206f73](https://github.com/Zetesis-Labs/PayloadAgents/commit/4206f738fd1589d1c8ed8000bf9013354710bcd5))

## [0.5.2](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-agents-core-v0.5.1...payload-agents-core-v0.5.2) (2026-05-17)


### Bug Fixes

* **security:** timing-safe internal-secret compare + LlamaParse upload limits ([77ac5c6](https://github.com/Zetesis-Labs/PayloadAgents/commit/77ac5c6954abb196b25f3cb3ef0fe120fa32ca28))

## [0.5.1](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-agents-core-v0.5.0...payload-agents-core-v0.5.1) (2026-05-13)


### Features

* **agno-agent-builder:** add Teams channel support ([c937a81](https://github.com/Zetesis-Labs/PayloadAgents/commit/c937a81615b56b70350bae9b0a84d8cfffd8bc6f))
* **agno-agent-builder:** Microsoft Teams channel + attachment intake (Teams + Discord) ([f0dd9af](https://github.com/Zetesis-Labs/PayloadAgents/commit/f0dd9afd2de75e8ae87180da70faedf80351dd53))


### Bug Fixes

* **teams:** harden runtime and package publishing ([f99459b](https://github.com/Zetesis-Labs/PayloadAgents/commit/f99459be32408009806191e0dd236e6fddbc2d40))

## [0.5.0](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-agents-core-v0.4.2...payload-agents-core-v0.5.0) (2026-05-09)


### ⚠ BREAKING CHANGES

* **core:** require searchCollectionOptions on agentPlugin ([#36](https://github.com/Zetesis-Labs/PayloadAgents/issues/36))
* **agents-core:** require mediaCollectionSlug and taxonomyCollectionSlug
* **payload-agents-core:** removed `extractTenantId`, `AgentsCollectionOverrides`, `createSessionId`, `parseSessionId`, `validateSessionOwnership`, `defaultExtractTenantId`, and the automatic tenant filter in the agents list endpoint.

### Features

* add payload-agents-core package and agent-runtime service ([971d8e2](https://github.com/Zetesis-Labs/PayloadAgents/commit/971d8e26d5bf1fb9e068f34e3296858c38108ceb))
* added agno finaly to payload-agents ([670062b](https://github.com/Zetesis-Labs/PayloadAgents/commit/670062b0f4928a36db8f60b83ff584320d3b19ad))
* **agno-agent-builder:** channel-agnostic loader + WhatsApp + Discord ([#57](https://github.com/Zetesis-Labs/PayloadAgents/issues/57)) ([25766b5](https://github.com/Zetesis-Labs/PayloadAgents/commit/25766b57ed5912d97e3141e8f6d87b2a78c57445))
* **core:** require searchCollectionOptions on agentPlugin ([#36](https://github.com/Zetesis-Labs/PayloadAgents/issues/36)) ([5c8a958](https://github.com/Zetesis-Labs/PayloadAgents/commit/5c8a958d90237b0a8dcbee03b068e5fd1944e04c))
* **mcp-typesense,payload-agents-core:** scope MCP search by folder ([#68](https://github.com/Zetesis-Labs/PayloadAgents/issues/68)) ([43dbd87](https://github.com/Zetesis-Labs/PayloadAgents/commit/43dbd87481e1c4fe63bc6ae5c931dedffb258518))
* **metrics:** add payload-agents-metrics package + onRunCompleted hook ([#23](https://github.com/Zetesis-Labs/PayloadAgents/issues/23)) ([ff02b1a](https://github.com/Zetesis-Labs/PayloadAgents/commit/ff02b1a82a6222ff2bf05992f64140c9c2003052))
* **payload-agents-core:** decouple tenancy from session id ([4b371b1](https://github.com/Zetesis-Labs/PayloadAgents/commit/4b371b1824c5ed87991eacba99a144d295e3b698))
* **payload-agents-core:** realistic token estimation + cost calculator ([3a2e190](https://github.com/Zetesis-Labs/PayloadAgents/commit/3a2e1907653a447bf5a447dd1cd16a65cedf2f19))
* **payload-agents-core:** realistic token estimation + cost calculator ([9e18fdf](https://github.com/Zetesis-Labs/PayloadAgents/commit/9e18fdff2a213fcb738a54c30a4081dd869c9a91))
* replace chat-agent with AG-UI based @zetesis/agent-ui ([#64](https://github.com/Zetesis-Labs/PayloadAgents/issues/64)) ([adf5acd](https://github.com/Zetesis-Labs/PayloadAgents/commit/adf5acd9cf110bf0339389c215be2075bbf69e5e))


### Bug Fixes

* **agents-core:** fix drizzle execute call, add reasoning + tool protocol ([01c9196](https://github.com/Zetesis-Labs/PayloadAgents/commit/01c91960944ce9b3a84b234d5b35dfa4ecd48a13))
* **agents-core:** require mediaCollectionSlug and taxonomyCollectionSlug ([7b393c1](https://github.com/Zetesis-Labs/PayloadAgents/commit/7b393c1e4a4f78a169f8197521a477068addcf8c))
* authenticate all runtime requests with X-Internal-Secret ([74a6d3f](https://github.com/Zetesis-Labs/PayloadAgents/commit/74a6d3ffc4ab731bd45f533edcdc23de31a3c227))
* authenticate all runtime requests with X-Internal-Secret ([b622d37](https://github.com/Zetesis-Labs/PayloadAgents/commit/b622d37f7ecc738a1342d5942e553697b64c8c67))
* **core:** self-heal agno_sessions.metadata.tenant_id in validateSessionOwnership ([#40](https://github.com/Zetesis-Labs/PayloadAgents/issues/40)) ([df9703e](https://github.com/Zetesis-Labs/PayloadAgents/commit/df9703e8bf42b6abe9e38f76a47ec7dba0892188))
* linter issues ([61d9125](https://github.com/Zetesis-Labs/PayloadAgents/commit/61d912527ffe4ba8714ac0a07c5d297ce4b0d394))
* **payload-agents-core:** cap sessions list limit parameter to 100 ([1efcdb9](https://github.com/Zetesis-Labs/PayloadAgents/commit/1efcdb9756b7350f4b2ae5a05961318f3e1d0b4e))
* **payload-agents-core:** cap sessions list limit to 100 ([eb509b5](https://github.com/Zetesis-Labs/PayloadAgents/commit/eb509b510fe183c84b36451121a40c2ca72aede7))
* **payload-agents-core:** consistent effective tokens across daily usage and SSE run total ([0e0f448](https://github.com/Zetesis-Labs/PayloadAgents/commit/0e0f448587a5389198c9f35da7c974ac9e026ff8))
* **payload-agents-core:** enforce access.read on /agents and /chat endpoints ([9d1d4a2](https://github.com/Zetesis-Labs/PayloadAgents/commit/9d1d4a2edbc22183047faa5789ad56a2ad1a0ae5))
* **payload-agents-core:** pass req to extractTenantId ([46eba87](https://github.com/Zetesis-Labs/PayloadAgents/commit/46eba8763d704aee593945b789e5d2a18406d62d))
* **payload-agents-core:** pre-deploy hardening (runtimeSecret warning + token estimate) ([9f16277](https://github.com/Zetesis-Labs/PayloadAgents/commit/9f16277650bdea9b80eaed62d1f9549e6fc1af51))
* **payload-agents-core:** validate session ID ownership on all endpoints ([52bd9bb](https://github.com/Zetesis-Labs/PayloadAgents/commit/52bd9bb63547f58c031dcb074a6ff479eb4c277f))
* **payload-agents-core:** validate session ID ownership on all endpoints ([e075566](https://github.com/Zetesis-Labs/PayloadAgents/commit/e075566ba0c2a073311e415c649b0f75b7e16f87))
* **payload-agents-core:** validate tenant on active session lookup ([3924a81](https://github.com/Zetesis-Labs/PayloadAgents/commit/3924a817eeffe530f828932106fc0ddbb509258e))
* **payload-agents-core:** warn on empty runtimeSecret, improve token estimate ([de24471](https://github.com/Zetesis-Labs/PayloadAgents/commit/de24471d1826075e17a2e4a8011d67a5e1268a84))
* resolve lint errors (import order, formatting, unused param) ([d0d1ac7](https://github.com/Zetesis-Labs/PayloadAgents/commit/d0d1ac7622a24364702592c4de6897421d82ece7))
* **runtime:** fan out agent reloads via Postgres LISTEN/NOTIFY ([6beb12b](https://github.com/Zetesis-Labs/PayloadAgents/commit/6beb12b1040147b11182911b60ccf876d8ac202c))
* **runtime:** fan out agent reloads via Postgres LISTEN/NOTIFY ([5bfeab7](https://github.com/Zetesis-Labs/PayloadAgents/commit/5bfeab7103caca78633aa57d23e6f5c0267949d0))
* small issues ([f4db5af](https://github.com/Zetesis-Labs/PayloadAgents/commit/f4db5af8873cc36d3742f07cc3c4983c9b0cbc98))

## 0.4.2

### Patch Changes

- [`43dbd87`](https://github.com/Zetesis-Labs/PayloadAgents/commit/43dbd87481e1c4fe63bc6ae5c931dedffb258518) Thanks [@Fiser12](https://github.com/Fiser12)! - **Folder-scoped agents**: the auto-generated `agents` collection gets a
  new `folders` `relationship[hasMany]` field next to `taxonomies`.

  - `AgentPluginConfig` gains an optional `foldersCollectionSlug` (default
    `'payload-folders'`, matching Payload's auto-injected folders slug).
    Override it only if your `buildConfig({ folders: { slug } })` uses a
    different slug.
  - The `RAG Configuration` group on the agents admin form now exposes
    `Folders` so admins can scope an agent to one or more folders. Empty
    by default — the agent searches all available content unless a folder
    is selected.

  The agno-agent-builder runtime reads the new field and forwards each
  folder's breadcrumb slug chain via the `x-folder-slugs` header (handled
  by `@zetesis/mcp-typesense ≥ 0.4`).

## 0.4.1

### Patch Changes

- [#64](https://github.com/Zetesis-Labs/PayloadAgents/pull/64) [`adf5acd`](https://github.com/Zetesis-Labs/PayloadAgents/commit/adf5acd9cf110bf0339389c215be2075bbf69e5e) Thanks [@Fiser12](https://github.com/Fiser12)! - feat: replace `@zetesis/chat-agent` with `@zetesis/agent-ui` (AG-UI based)

  The chat surface is now built on top of the AG-UI protocol with assistant-ui:

  - New package `@zetesis/agent-ui` exposes `AgentChatProvider`, `AgentThread`, `AgentThreadList` and helper components (`MarkdownText`, `Sources`, `ToolCalls`, `TokenUsageBar`, `LimitAlert`).
  - The runtime endpoint `POST /agents/{slug}/runs` is replaced by an AG-UI compliant `POST /agents/{slug}/agui` (multi-agent dispatcher around Agno's built-in `agno.os.interfaces.agui`). `agno-agent-builder` now depends on `ag-ui-protocol`.
  - `payload-agents-core`'s `/chat` endpoint accepts a vanilla `RunAgentInput` body (portal-specific routing rides inside `forwardedProps.agentSlug`) and passes AG-UI events through unchanged. `translateAgnoStream` is removed; `passthroughAguiStream` replaces it.
  - `selectedDocuments` is removed end-to-end (BFF schema, RAG search handler, RAG query builder, plugin types, dashboard read-only thread).
  - `payload-agents-metrics` swaps the legacy `Thread` runtime in its session side panel for a static read-only renderer using `MarkdownText`/`Sources`/`ToolCalls` from the new package.

  The legacy `@zetesis/chat-agent` package is deleted.

## 0.4.0

### Minor Changes

- [#57](https://github.com/Zetesis-Labs/PayloadAgents/pull/57) [`25766b5`](https://github.com/Zetesis-Labs/PayloadAgents/commit/25766b57ed5912d97e3141e8f6d87b2a78c57445) Thanks [@Fiser12](https://github.com/Fiser12)! - Add the `internal/list` endpoint and migrate the apiKey decryption gate
  off the `X-Runtime-Secret` request header.

  **New endpoint** (registered on the agents collection):

  `GET /api/<collectionSlug>/internal/list` — gated by `X-Internal-Secret`,
  returns active agents with their tenant + taxonomies populated and the
  `apiKey` field decrypted. Calls Payload's local API with
  `overrideAccess: true` and `req.context.internalAgentRead = true` so the
  host's collection access (and any populated relations like `tenants`) can
  stay honestly user-scoped — the bypass branches that previously had to
  live in the host's access functions are no longer needed.

  **Hook change**: `createDecryptAfterReadHook` no longer checks for an
  `X-Runtime-Secret` request header. Decryption now keys off
  `req.context.internalAgentRead === true` (set by the new endpoint),
  plus the existing `payloadAPI === 'local'` and superadmin checks.

  **Migration for hosts**:

  1. Bump this package + the `agno-agent-builder` Python lib together. The
     Python source class (`PayloadAgentSource`) now hits the new endpoint
     automatically — no caller changes if you used keyword args.
  2. Drop the `X-Runtime-Secret` bypass branches from your `agents` and
     `tenants` collection `read` access functions; they're no longer
     reachable.

  The `runtimeSecret` plugin config field stays the same value (it's
  still the shared secret with the agent runtime); only the inbound
  header name and the decryption-gate mechanism change.

- [#57](https://github.com/Zetesis-Labs/PayloadAgents/pull/57) [`25766b5`](https://github.com/Zetesis-Labs/PayloadAgents/commit/25766b57ed5912d97e3141e8f6d87b2a78c57445) Thanks [@Fiser12](https://github.com/Fiser12)! - Add `Agent.allowGuestAccess` checkbox so hosts can mark agents as
  guest-accessible from external channels (e.g. Telegram users not yet
  bound to a CMS user). Defaults to `false` — backwards compatible.

  Pairs with the Telegram bot wiring in `agno-agent-builder` (same release).
  Hosts that wire a per-tenant `TelegramBotInstallations` collection and the
  matching internal endpoints can expose any active agent through Telegram;
  the `allowGuestAccess` flag lets them limit which agents the bot will
  serve to anonymous Telegram chats.

## 0.3.3

### Patch Changes

- [#40](https://github.com/Zetesis-Labs/PayloadAgents/pull/40) [`df9703e`](https://github.com/Zetesis-Labs/PayloadAgents/commit/df9703e8bf42b6abe9e38f76a47ec7dba0892188) Thanks [@Fiser12](https://github.com/Fiser12)! - Self-heal `agno_sessions.metadata.tenant_id` from `validateSessionOwnership`. Agno (>=2.5) only persists the agent's static `metadata` field on the session row and ignores the per-run `metadata=` kwarg, so the runtime's `X-Tenant-Id` forwarding never reached `agno_sessions.metadata` and every continuation/history/rename/delete on a multi-tenant deploy returned `Forbidden`. The strategy now back-fills `metadata.tenant_id` the first time it sees a session whose `user_id` matches but `metadata.tenant_id` is null. The UPDATE casts the bound parameter to `::text` (otherwise pg can't infer `jsonb_build_object`'s anyelement arg type) and normalizes `metadata` via `jsonb_typeof` before merging (otherwise `'null'::jsonb || object` wraps both into an array).

## 0.3.2

### Patch Changes

- [#36](https://github.com/Zetesis-Labs/PayloadAgents/pull/36) [`5c8a958`](https://github.com/Zetesis-Labs/PayloadAgents/commit/5c8a958d90237b0a8dcbee03b068e5fd1944e04c) Thanks [@Fiser12](https://github.com/Fiser12)! - **BREAKING**: `agentPlugin({...})` now requires `searchCollectionOptions` in its config.

  The agent's `searchCollections` field used to ship with the options hardcoded to `posts_chunk` and `books_chunk`. That silently broke any consumer indexing additional collections (e.g. `documents_chunk` once the documents plugin is wired up): chunks were indexed but the agent had no way to query them.

  The plugin now demands an explicit list and refuses to boot without one — same stance as `mediaCollectionSlug` and `taxonomyCollectionSlug`. Each consumer's set of indexed collections is project-specific, so silently defaulting would mask wiring mistakes.

  Migration:

  ```ts
  // Before (0.3.x)
  agentPlugin({
    runtimeUrl: "...",
    mediaCollectionSlug: "media",
    taxonomyCollectionSlug: "taxonomy",
    // ...
  });

  // After (0.4.x)
  agentPlugin({
    runtimeUrl: "...",
    mediaCollectionSlug: "media",
    taxonomyCollectionSlug: "taxonomy",
    searchCollectionOptions: [
      { label: "Posts", value: "posts_chunk" },
      { label: "Books", value: "books_chunk" },
      // add { label: 'Documents', value: 'documents_chunk' } if you index documents
    ],
    // ...
  });
  ```

  Empty arrays are rejected at boot: `agentPlugin` throws if the list has zero entries — an agent that can't search anything is almost certainly a misconfiguration.

  Existing agents in the database keep whatever was saved at creation. The new `defaultValue` (= every option you declare) only applies to brand-new agents.

## 0.3.1

### Patch Changes

- [#23](https://github.com/Zetesis-Labs/PayloadAgents/pull/23) [`ff02b1a`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ff02b1a82a6222ff2bf05992f64140c9c2003052) Thanks [@Fiser12](https://github.com/Fiser12)! - Replace hand-rolled Agno interfaces with shared Zod schemas at the boundaries.

  **Core**: new `lib/agno-schema.ts` exposes `AgnoMessageSchema`, `AgnoRunSchema`, `AgnoSessionDetailSchema`, the inferred TS types, and three helpers (`parseAgnoSession`, `parseAgnoRuns`, `extractMessagesFromRuns`). All exported from the package root so consumers parse Agno responses through one validated boundary instead of casting their own.

  - `chat.ts` validates the request body with a Zod schema (`ChatRequestSchema`) instead of `as ChatRequest`. Bad payloads get a typed 422 with `details` from `error.flatten()` rather than crashing later.
  - `session.ts` parses Agno's `/sessions/{id}` and `/sessions/{id}/runs` responses through `parseAgnoSession` / `parseAgnoRuns`. Drops the local `AgnoMessage` and `AgnoSessionDetail` interfaces that were duplicated against the metrics package.
  - Extracted `parseChatBody()` from `createChatHandler` to keep the handler under the cognitive-complexity ceiling.

  **Metrics**: drops its local `AgnoMessage` interface and consumes the shared one from core. `session-detail.ts` now resolves Agno runs through `extractMessagesFromRuns(parseAgnoRuns(rawRuns))` — the 17-line manual narrow + cast was replaced by a single validated boundary.

  **Resolved type degradation in `ResolvedMetricsConfig.checkAccess`**: was typed as `(payload: Payload, user: Record<string, unknown>) => …`, lowering the public `TypedUser` to a generic record at the resolved-config layer. That forced four `user as unknown as Record<string, unknown>` casts in the endpoints. Now both layers carry `TypedUser` and the casts are gone.

  `@zetesis/payload-agents-metrics` now declares `@zetesis/payload-agents-core` as a peer dependency so consumers install both at compatible versions.

  No behaviour change. 136/136 specs pass (124 metrics + 12 core).

- [#23](https://github.com/Zetesis-Labs/PayloadAgents/pull/23) [`ff02b1a`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ff02b1a82a6222ff2bf05992f64140c9c2003052) Thanks [@Fiser12](https://github.com/Fiser12)! - Final typing cleanup — closes the remaining gaps from the type-strict review.

  **Real bugs / safety holes:**

  - `getUserId` now validates the id at runtime and throws an explicit error (`TypedUser has no valid id — auth middleware misconfigured?`) instead of silently propagating `undefined.id` deep into the request flow.
  - `chat.ts` introduces a typed `AgentDoc` interface that documents what core actually reads from the agent collection (`slug`, `isActive`, `llmModel`, `apiKeyFingerprint`). Replaces `agents[0] as Record<string, unknown>` and `agent.slug as string` with one boundary cast at `payload.find` and a runtime check that the slug is actually a string.
  - `dashboard.tsx` validates the three fetch responses (`/sessions`, `/session`, `/aggregate`) through Zod schemas at runtime instead of soft-casting `res.json() as Promise<Foo>`. Schema/type are kept in lockstep via `z.infer`.
  - SSE translator no longer routes Agno frames through `Record<string, unknown>` casts. `agno-schema.ts` exports `AgnoSseFrame` / `AgnoSseTool` / `AgnoSseMetrics` interfaces with an index signature so the public `RunCompletedContext.metrics` keeps generic field access without a cast.

  **Type quality:**

  - `getDrizzle` parameter narrowed back to `BasePayload` (was widened to `{ db: unknown }` in the previous round).
  - `extractSources` (metrics) uses the `'hits' in data` operator instead of `as { hits?: unknown }`.
  - `extractAvatarUrl` (core agents-list) replaces the `media as Record<string, unknown>` cast chain with `'sizes' in avatar` narrowing and a `pickStringField` helper.
  - `reload-runtime.ts` reads `doc.slug` through a typed `docSlug()` helper, returning `null` and skipping notify if the field is absent or non-string.

  No behaviour change. 136/136 specs pass.

- [#23](https://github.com/Zetesis-Labs/PayloadAgents/pull/23) [`ff02b1a`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ff02b1a82a6222ff2bf05992f64140c9c2003052) Thanks [@Fiser12](https://github.com/Fiser12)! - Tighten typing across the metrics package and core endpoints.

  **Metrics**:

  - Extract shared `DrizzleLike` interface and `getDrizzle()` helper to `lib/db.ts` — was duplicated in three call sites.
  - Replace `buildWhere(): unknown` with `buildWhere(): SQL` (drizzle's typed result), so callers don't need to recast the return value into their own `sql\`\`` templates.
  - Extend `ModelDetail` interface with `input_tokens`, `output_tokens`, `cache_read_tokens` so we don't cast a typed value into `Record<string, unknown>` just to read declared-but-missing fields. Add a `num()` runtime guard so non-numeric metric values land as `undefined` instead of NaN propagating into cost calculations.
  - `session-detail.ts`: replace the degenerate `Array<{...}> | unknown` declaration (`T | unknown` collapses to `unknown`) with a plain `let runs: unknown` that's narrowed with a type guard at use site. Validate each run's `messages` is an array before spreading.
  - `extractSources()`: stop casting hits to `Record<string, string>`; values are validated as strings (or coerced from numbers) per-field via a `pickString()` helper, so DB rows with `null` values no longer silently produce `''`.
  - `dashboard.tsx`: type the JSON error body as `{ error?: string } | null` rather than implicitly any, across all three fetch error paths.

  **Core**:

  - Extract `getUserId(user)` and `getUserRecord(user)` helpers to `lib/user.ts` — pattern was duplicated 6× across `chat.ts`, `session.ts`, `sessions.ts`. Centralises the boundary cast so future TypedUser refinements only touch one place.

  No behaviour change. All existing specs (124 in metrics + 12 in core) pass without modification.

## 0.3.0

### Minor Changes

- [#21](https://github.com/Zetesis-Labs/PayloadAgents/pull/21) [`67b6f1b`](https://github.com/Zetesis-Labs/PayloadAgents/commit/67b6f1b404b445646028b481aaaaf1db89d0fd5c) Thanks [@Fiser12](https://github.com/Fiser12)! - Drop `reloadAgents` client and the chat endpoint's self-heal retry.

  The helper only reached a single replica via the K8s Service round-robin; the chat endpoint used it as a best-effort retry when the runtime returned 404 for an unknown slug. With the Agents collection hooks now broadcasting reloads via Postgres `NOTIFY agent_reload` (plus the 5-minute periodic resync), every replica stays fresh and the retry dance was solving a problem that no longer exists.

  Removed:

  - `reloadAgents(runtimeUrl, runtimeSecret)` client function and its `ReloadResult` type.
  - `callWithRetry` / `retryAfterReload` internals in the chat endpoint (replaced by `callRuntimeOnce`).

  `runtimeFetch` stays — still used by the chat endpoint to reach `/agents/{slug}/runs`. The runtime's `POST /internal/agents/reload` HTTP endpoint is also kept for manual `curl` debugging.

- [#21](https://github.com/Zetesis-Labs/PayloadAgents/pull/21) [`7b393c1`](https://github.com/Zetesis-Labs/PayloadAgents/commit/7b393c1e4a4f78a169f8197521a477068addcf8c) Thanks [@Fiser12](https://github.com/Fiser12)! - Make `mediaCollectionSlug` and `taxonomyCollectionSlug` required on `agentPlugin()`.

  The previous defaults (`'media'` and `'taxonomy'`) matched the conventions we use, but hid a footgun: if a consumer renamed either collection, the Agents' `avatar` upload and `taxonomies` relationship broke silently — no error at boot, just empty references on every write.

  Both fields are now required in `AgentPluginConfig`, and the plugin validates at registration time that each referenced slug is present in the Payload config, throwing with a clear `[agent-plugin] collection "…" referenced by …CollectionSlug is not registered` if you try to boot without them.

  **Migration** — set the slugs explicitly in your plugin config. If you were relying on the defaults the values stay the same:

  ```ts
  agentPlugin({
    runtimeUrl: "…",
    mediaCollectionSlug: "media",
    taxonomyCollectionSlug: "taxonomy",
    // …
  });
  ```

### Patch Changes

- [#21](https://github.com/Zetesis-Labs/PayloadAgents/pull/21) [`46eba87`](https://github.com/Zetesis-Labs/PayloadAgents/commit/46eba8763d704aee593945b789e5d2a18406d62d) Thanks [@Fiser12](https://github.com/Fiser12)! - `multiTenantSessionStrategy`: `extractTenantId` now receives `(user, req)` instead of `(user)`.

  The previous signature couldn't read request state (cookies, headers, subdomain), which made the helper unable to reflect a cookie-driven active tenant — it would silently fall back to `user.tenants[0]` and tag sessions with the wrong tenant.

  **Migration** — add the `req` parameter to your extractor. If you only need the user object, just ignore `req`:

  ```ts
  // before
  multiTenantSessionStrategy({
    extractTenantId: (user) => user.tenants?.[0]?.tenant,
  });

  // after
  multiTenantSessionStrategy({
    extractTenantId: (user, req) => user.tenants?.[0]?.tenant,
  });
  ```

  Apps that resolve the active tenant from the `payload-tenant` cookie can now do so directly:

  ```ts
  import { getTenantFromCookie } from "@payloadcms/plugin-multi-tenant/utilities";

  multiTenantSessionStrategy({
    extractTenantId: (user, req) =>
      getTenantFromCookie(req.headers, req.payload.db.defaultIDType) ??
      (
        user.tenants as Array<{ tenant: number | { id: number } }> | undefined
      )?.[0]?.tenant,
  });
  ```

- [#21](https://github.com/Zetesis-Labs/PayloadAgents/pull/21) [`5bfeab7`](https://github.com/Zetesis-Labs/PayloadAgents/commit/5bfeab7103caca78633aa57d23e6f5c0267949d0) Thanks [@Fiser12](https://github.com/Fiser12)! - Fan out agent reloads to every runtime replica via Postgres `LISTEN/NOTIFY`.

  The Agents collection hooks used to `POST /internal/agents/reload` at the runtime Service, which K8s round-robins to a single pod — other replicas kept serving stale config until their next restart. Now `afterChange`/`afterDelete` issue `pg_notify('agent_reload', slug)` via Payload's drizzle handle and the runtime service listens on the channel, so every pod refreshes in lockstep.

  The HTTP `/internal/agents/reload` endpoint and the `reloadAgents` client helper stay for manual triggering and for the chat endpoint's best-effort self-heal retry — the fan-out bug only affected the automatic hook path.

## 0.2.2

### Patch Changes

- [#18](https://github.com/Zetesis-Labs/PayloadAgents/pull/18) [`4b371b1`](https://github.com/Zetesis-Labs/PayloadAgents/commit/4b371b1824c5ed87991eacba99a144d295e3b698) Thanks [@Fiser12](https://github.com/Fiser12)! - Decouple tenancy from the plugin core. The plugin no longer assumes a specific multi-tenant shape — consumers now define how session IDs are built, validated, and how the Agents collection is filtered.

  **Breaking changes:**

  - Removed `extractTenantId` config option.
  - Removed `AgentsCollectionOverrides` type and the partial-merge semantics of `collectionOverrides`.
  - Removed `createSessionId`, `parseSessionId`, `validateSessionOwnership` exports and the `SessionIdParts` type. Removed `defaultExtractTenantId`.
  - `agentPlugin` no longer auto-filters agent queries by tenant. The default `/agents` list endpoint returns every active agent unless the consumer adds an `access.read` rule via `collectionOverrides`. Both `/agents` and `/chat` invoke the collection's `access.read` rule (calls use `overrideAccess: false` + `req`), so any rule added via `collectionOverrides` is enforced.

  **New API:**

  - `buildSessionId(ctx) => string | Promise<string>` — receives `{ user, agentSlug, chatId?, payload, req }` and returns the session id for the runtime. Default: `${agentSlug}:${userId}:${uuid}`.
  - `validateSessionOwnership(sessionId, ctx) => boolean | Promise<boolean>` — receives `{ user, payload, req }` and decides whether the current user owns the given session. Default: `sessionId.includes(`:${userId}:`)`.
  - `collectionOverrides(current) => CollectionConfig` — now a function that receives the fully generated collection and returns a new one. Spread the argument to keep the plugin's defaults and override only what you need.

  **Migration helper:**

  - Added `multiTenantSessionStrategy({ extractTenantId })` which returns `{ buildSessionId, validateSessionOwnership }` pre-wired so session identifiers embed the tenant boundary. Designed to pair with `@payloadcms/plugin-multi-tenant`, which already filters the Agents collection by tenant — the helper does not touch `collectionOverrides`.

  **Migration example:**

  ```ts
  // Before
  agentPlugin({
    extractTenantId: (user) =>
      String(user.tenants?.[0]?.tenant?.id ?? "default"),
    collectionOverrides: {
      access: { create: isAdmin, update: isAdmin, delete: isAdmin },
    },
  });

  // After
  agentPlugin({
    ...multiTenantSessionStrategy({
      extractTenantId: (user) => user.tenants?.[0]?.tenant?.id,
    }),
    collectionOverrides: (current) => ({
      ...current,
      access: {
        ...current.access,
        create: isAdmin,
        update: isAdmin,
        delete: isAdmin,
      },
    }),
  });
  ```

- [#17](https://github.com/Zetesis-Labs/PayloadAgents/pull/17) [`9e18fdf`](https://github.com/Zetesis-Labs/PayloadAgents/commit/9e18fdff2a213fcb738a54c30a4081dd869c9a91) Thanks [@Fiser12](https://github.com/Fiser12)! - Realistic token estimation using cost-weighted effective tokens (cached input at 25%, output weighted by model pricing ratio). Add cost-calculator module with per-model pricing tables, estimateRunCost, effectiveTokens, and costBreakdown functions.

## 0.2.1

### Patch Changes

- [#12](https://github.com/Zetesis-Labs/PayloadAgents/pull/12) [`b622d37`](https://github.com/Zetesis-Labs/PayloadAgents/commit/b622d37f7ecc738a1342d5942e553697b64c8c67) Thanks [@Fiser12](https://github.com/Fiser12)! - Add X-Internal-Secret authentication to all runtime requests. Previously only the reload endpoint was authenticated; now all proxy calls (chat, sessions) include the header and the Python runtime rejects unauthenticated requests.

- [#11](https://github.com/Zetesis-Labs/PayloadAgents/pull/11) [`a64978b`](https://github.com/Zetesis-Labs/PayloadAgents/commit/a64978bc45113f8363d68c820a7d247e46b51380) Thanks [@Fiser12](https://github.com/Fiser12)! - Validate session ID ownership on all chat endpoints. Prevents cross-tenant session access and session hijacking via user-controlled chatId.

- [#13](https://github.com/Zetesis-Labs/PayloadAgents/pull/13) [`1efcdb9`](https://github.com/Zetesis-Labs/PayloadAgents/commit/1efcdb9756b7350f4b2ae5a05961318f3e1d0b4e) Thanks [@Fiser12](https://github.com/Fiser12)! - Cap the `limit` query parameter on the sessions list endpoint to a maximum of 100, preventing unbounded upstream queries.

- [#15](https://github.com/Zetesis-Labs/PayloadAgents/pull/15) [`de24471`](https://github.com/Zetesis-Labs/PayloadAgents/commit/de24471d1826075e17a2e4a8011d67a5e1268a84) Thanks [@Fiser12](https://github.com/Fiser12)! - Warn on empty runtimeSecret at plugin init. Use conservative token estimate (message/3 + 2000 overhead) instead of message/4.

## 0.2.0

### Minor Changes

- [#10](https://github.com/Zetesis-Labs/PayloadAgents/pull/10) [`670062b`](https://github.com/Zetesis-Labs/PayloadAgents/commit/670062b0f4928a36db8f60b83ff584320d3b19ad) Thanks [@Fiser12](https://github.com/Fiser12)! - added use of agno as main agent system
