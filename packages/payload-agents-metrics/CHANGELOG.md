# @zetesis/payload-agents-metrics

## [1.2.2](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-agents-metrics-v1.2.1...payload-agents-metrics-v1.2.2) (2026-05-21)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zetesis/payload-agents-core bumped to 0.6.0
  * peerDependencies
    * @zetesis/payload-agents-core bumped to 0.6.0

## [1.2.1](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-agents-metrics-v1.2.0...payload-agents-metrics-v1.2.1) (2026-05-17)


### Bug Fixes

* **security:** timing-safe internal-secret compare + LlamaParse upload limits ([77ac5c6](https://github.com/Zetesis-Labs/PayloadAgents/commit/77ac5c6954abb196b25f3cb3ef0fe120fa32ca28))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zetesis/agent-ui bumped to 0.1.4
    * @zetesis/payload-agents-core bumped to 0.5.2
  * peerDependencies
    * @zetesis/agent-ui bumped to 0.1.4
    * @zetesis/payload-agents-core bumped to 0.5.2

## [1.2.0](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-agents-metrics-v1.1.0...payload-agents-metrics-v1.2.0) (2026-05-13)


### Features

* **agno-agent-builder:** add Teams channel support ([c937a81](https://github.com/Zetesis-Labs/PayloadAgents/commit/c937a81615b56b70350bae9b0a84d8cfffd8bc6f))
* **agno-agent-builder:** Microsoft Teams channel + attachment intake (Teams + Discord) ([f0dd9af](https://github.com/Zetesis-Labs/PayloadAgents/commit/f0dd9afd2de75e8ae87180da70faedf80351dd53))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zetesis/payload-agents-core bumped to 0.5.1
  * peerDependencies
    * @zetesis/payload-agents-core bumped to 0.5.1

## [1.1.0](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-agents-metrics-v1.0.3...payload-agents-metrics-v1.1.0) (2026-05-09)


### Features

* **metrics:** add payload-agents-metrics package + onRunCompleted hook ([#23](https://github.com/Zetesis-Labs/PayloadAgents/issues/23)) ([ff02b1a](https://github.com/Zetesis-Labs/PayloadAgents/commit/ff02b1a82a6222ff2bf05992f64140c9c2003052))
* replace chat-agent with AG-UI based @zetesis/agent-ui ([#64](https://github.com/Zetesis-Labs/PayloadAgents/issues/64)) ([adf5acd](https://github.com/Zetesis-Labs/PayloadAgents/commit/adf5acd9cf110bf0339389c215be2075bbf69e5e))


### Bug Fixes

* **metrics:** batchFetchFirstMessages binds text[] correctly via IN list ([#34](https://github.com/Zetesis-Labs/PayloadAgents/issues/34)) ([7636261](https://github.com/Zetesis-Labs/PayloadAgents/commit/763626164d176eae2603ef2780b110ee949d29f6))
* **metrics:** re-export MetricsPluginResult (lost in 0.1.0 rebase) ([#32](https://github.com/Zetesis-Labs/PayloadAgents/issues/32)) ([419c5c7](https://github.com/Zetesis-Labs/PayloadAgents/commit/419c5c77a4e8c2145cebd9cb41564a43678d9b94))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zetesis/agent-ui bumped to 0.1.3
    * @zetesis/payload-agents-core bumped to 0.5.0
  * peerDependencies
    * @zetesis/agent-ui bumped to 0.1.3
    * @zetesis/payload-agents-core bumped to 0.5.0

## 1.0.3

### Patch Changes

- Updated dependencies [[`43dbd87`](https://github.com/Zetesis-Labs/PayloadAgents/commit/43dbd87481e1c4fe63bc6ae5c931dedffb258518)]:
  - @zetesis/payload-agents-core@0.4.2

## 1.0.2

### Patch Changes

- Updated dependencies [[`8396a55`](https://github.com/Zetesis-Labs/PayloadAgents/commit/8396a55ec848dac034bb797b52d43ddef573c649)]:
  - @zetesis/agent-ui@0.1.2

## 1.0.1

### Patch Changes

- [#64](https://github.com/Zetesis-Labs/PayloadAgents/pull/64) [`adf5acd`](https://github.com/Zetesis-Labs/PayloadAgents/commit/adf5acd9cf110bf0339389c215be2075bbf69e5e) Thanks [@Fiser12](https://github.com/Fiser12)! - feat: replace `@zetesis/chat-agent` with `@zetesis/agent-ui` (AG-UI based)

  The chat surface is now built on top of the AG-UI protocol with assistant-ui:

  - New package `@zetesis/agent-ui` exposes `AgentChatProvider`, `AgentThread`, `AgentThreadList` and helper components (`MarkdownText`, `Sources`, `ToolCalls`, `TokenUsageBar`, `LimitAlert`).
  - The runtime endpoint `POST /agents/{slug}/runs` is replaced by an AG-UI compliant `POST /agents/{slug}/agui` (multi-agent dispatcher around Agno's built-in `agno.os.interfaces.agui`). `agno-agent-builder` now depends on `ag-ui-protocol`.
  - `payload-agents-core`'s `/chat` endpoint accepts a vanilla `RunAgentInput` body (portal-specific routing rides inside `forwardedProps.agentSlug`) and passes AG-UI events through unchanged. `translateAgnoStream` is removed; `passthroughAguiStream` replaces it.
  - `selectedDocuments` is removed end-to-end (BFF schema, RAG search handler, RAG query builder, plugin types, dashboard read-only thread).
  - `payload-agents-metrics` swaps the legacy `Thread` runtime in its session side panel for a static read-only renderer using `MarkdownText`/`Sources`/`ToolCalls` from the new package.

  The legacy `@zetesis/chat-agent` package is deleted.

- Updated dependencies [[`adf5acd`](https://github.com/Zetesis-Labs/PayloadAgents/commit/adf5acd9cf110bf0339389c215be2075bbf69e5e)]:
  - @zetesis/agent-ui@0.1.1
  - @zetesis/payload-agents-core@0.4.1

## 1.0.0

### Patch Changes

- Updated dependencies [[`25766b5`](https://github.com/Zetesis-Labs/PayloadAgents/commit/25766b57ed5912d97e3141e8f6d87b2a78c57445), [`25766b5`](https://github.com/Zetesis-Labs/PayloadAgents/commit/25766b57ed5912d97e3141e8f6d87b2a78c57445)]:
  - @zetesis/payload-agents-core@0.4.0

## 0.1.5

### Patch Changes

- Updated dependencies [[`e2d24b0`](https://github.com/Zetesis-Labs/PayloadAgents/commit/e2d24b04fb6d79e51d93f36345dc7e6cb7493632), [`df9703e`](https://github.com/Zetesis-Labs/PayloadAgents/commit/df9703e8bf42b6abe9e38f76a47ec7dba0892188)]:
  - @zetesis/chat-agent@0.2.4
  - @zetesis/payload-agents-core@0.3.3

## 0.1.4

### Patch Changes

- Updated dependencies [[`5c8a958`](https://github.com/Zetesis-Labs/PayloadAgents/commit/5c8a958d90237b0a8dcbee03b068e5fd1944e04c)]:
  - @zetesis/payload-agents-core@0.3.2

## 0.1.3

### Patch Changes

- [#34](https://github.com/Zetesis-Labs/PayloadAgents/pull/34) [`7636261`](https://github.com/Zetesis-Labs/PayloadAgents/commit/763626164d176eae2603ef2780b110ee949d29f6) Thanks [@Fiser12](https://github.com/Fiser12)! - Fix `/llm-usage/sessions` 500 caused by a malformed `text[]` parameter.

  `batchFetchFirstMessages` was rewritten in 0.1.1 to use `session_id = ANY($1::text[])`. With drizzle-orm + node-postgres the JS array is bound as a single string parameter, so Postgres receives e.g. `"af571d36-..."` and fails the `::text[]` cast with "malformed array literal". Switched to `session_id IN (...)` expanded via `sql.join`, which emits one parameterised placeholder per id and uses the session_id index just as well as the original OR list.

## 0.1.2

### Patch Changes

- [#32](https://github.com/Zetesis-Labs/PayloadAgents/pull/32) [`419c5c7`](https://github.com/Zetesis-Labs/PayloadAgents/commit/419c5c77a4e8c2145cebd9cb41564a43678d9b94) Thanks [@Fiser12](https://github.com/Fiser12)! - Re-export `MetricsPluginResult` (the inferred return type of `metricsPlugin()`) from the package root. Without it, downstream packages that re-export `metricsPlugin(...)` fail with TS4023 ("Exported variable has or is using name from external module but cannot be named"). Same fix that landed in `76a92c1` and was lost in a rebase before the 0.1.0 release.

## 0.1.1

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

- [#23](https://github.com/Zetesis-Labs/PayloadAgents/pull/23) [`ff02b1a`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ff02b1a82a6222ff2bf05992f64140c9c2003052) Thanks [@Fiser12](https://github.com/Fiser12)! - Address Devin review on PR #23:

  - **`multiTenant` default fix** (HIGH): `metricsPlugin({})` previously resolved to `multiTenant: true` paired with `resolveTenantId: async () => null`, silently discarding every metric event. `MetricsPluginConfig` is now a discriminated union — `multiTenant: true` makes both `checkAccess` and `resolveTenantId` required at the type level; omitting `multiTenant` defaults to single-tenant mode where the callbacks aren't needed. Existing consumers that explicitly pass `multiTenant: true` with both callbacks (e.g. zetesis-portal) are unaffected at runtime; new consumers can no longer enable multi-tenant without providing a real resolver.
  - **`batchFetchFirstMessages` query** (MEDIUM): replaced the chained `OR session_id = ?` predicate (one per item) with a single `session_id = ANY($1::text[])`. Keeps the index lookup efficient as `PAGE_SIZE` grows.

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

- Updated dependencies [[`ff02b1a`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ff02b1a82a6222ff2bf05992f64140c9c2003052), [`ff02b1a`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ff02b1a82a6222ff2bf05992f64140c9c2003052), [`ff02b1a`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ff02b1a82a6222ff2bf05992f64140c9c2003052)]:
  - @zetesis/payload-agents-core@0.3.1
