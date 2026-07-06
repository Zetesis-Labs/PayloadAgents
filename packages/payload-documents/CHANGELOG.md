# @zetesis/payload-documents

## [0.5.5](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-documents-v0.5.4...payload-documents-v0.5.5) (2026-07-06)


### Features

* updated payload to version 3.85.2 ([0293c78](https://github.com/Zetesis-Labs/PayloadAgents/commit/0293c78f8e07dcc07e0b6f450960a30cf93dfce0))

## [0.5.4](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-documents-v0.5.3...payload-documents-v0.5.4) (2026-06-18)


### Bug Fixes

* **payload-documents:** constant-time internal-secret comparison ([fab824e](https://github.com/Zetesis-Labs/PayloadAgents/commit/fab824e7caf5e06ae1edefd709b1bbe70c630090))

## [0.5.3](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-documents-v0.5.2...payload-documents-v0.5.3) (2026-06-17)


### Bug Fixes

* **payload-documents:** per-attempt idempotency key for parse ([#104](https://github.com/Zetesis-Labs/PayloadAgents/issues/104)) ([a09c22b](https://github.com/Zetesis-Labs/PayloadAgents/commit/a09c22b1671f37e6127c4982f69b5a144389952e))

## [0.5.2](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-documents-v0.5.1...payload-documents-v0.5.2) (2026-06-17)


### Features

* introduce the Nexus-Queue standard (runtime + TS client) ([fa0672c](https://github.com/Zetesis-Labs/PayloadAgents/commit/fa0672c17f87ca76c2eaf7dd3295417c560b6d40))
* introduce the Nexus-Queue standard (runtime + TS client) ([73fce93](https://github.com/Zetesis-Labs/PayloadAgents/commit/73fce93fdc208efed95c573a1c89f69f1fc79d51))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @zetesis/nexus-queue bumped to 0.1.1

## [0.5.1](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-documents-v0.5.0...payload-documents-v0.5.1) (2026-05-17)


### Bug Fixes

* **security:** timing-safe internal-secret compare + LlamaParse upload limits ([77ac5c6](https://github.com/Zetesis-Labs/PayloadAgents/commit/77ac5c6954abb196b25f3cb3ef0fe120fa32ca28))

## [0.5.0](https://github.com/Zetesis-Labs/PayloadAgents/compare/payload-documents-v0.4.0...payload-documents-v0.5.0) (2026-05-09)


### ⚠ BREAKING CHANGES

* **indexer,typesense:** removes EmbeddingProviderConfig, EmbeddingService, EmbeddingResolver and their providers; removes IndexerFeatureConfig.embedding, TypesenseRAGPluginConfig.embeddingConfig, and FeatureFlags.embedding; EmbeddingTableConfig.autoEmbed is now required when embedding is set; removes per-table provider overrides, onEmbeddingFailure, reuseEmbeddingsWhenContentUnchanged. See changeset for full migration notes.

### Features

* **agno-agent-builder:** channel-agnostic loader + WhatsApp + Discord ([#57](https://github.com/Zetesis-Labs/PayloadAgents/issues/57)) ([25766b5](https://github.com/Zetesis-Labs/PayloadAgents/commit/25766b57ed5912d97e3141e8f6d87b2a78c57445))
* **indexer,typesense:** autoEmbed only + always-on content-hash skip ([#51](https://github.com/Zetesis-Labs/PayloadAgents/issues/51)) ([3ebb6c0](https://github.com/Zetesis-Labs/PayloadAgents/commit/3ebb6c0b297be36973c3c94876a8afdd3ebd9471))
* **payload-documents:** add plugin with LlamaParse-powered PDF parsing ([15ada08](https://github.com/Zetesis-Labs/PayloadAgents/commit/15ada08c596056c54396a6208c0d427d0b8cd748))
* **payload-documents:** align mode field with current LlamaParse parse_mode ([f93eb5f](https://github.com/Zetesis-Labs/PayloadAgents/commit/f93eb5fb581e7e5db91a48f20154c09a8d5388a6))
* **payload-documents:** host-resolved parse-file endpoint for binaries ([23069ae](https://github.com/Zetesis-Labs/PayloadAgents/commit/23069ae0a4be92d5dc04f9a7b7da63d553876abd))
* **payload-documents:** internal read endpoint to mirror parse-result ([99910e9](https://github.com/Zetesis-Labs/PayloadAgents/commit/99910e9fb4000a18fecec548fa9160d26ac8be2d))
* **payload-documents:** internal write endpoint for the documents worker ([af819b1](https://github.com/Zetesis-Labs/PayloadAgents/commit/af819b1c48ab1a5d0c422fbba2614d623993f01b))
* **payload-documents:** new plugin with LlamaParse-powered PDF parsing ([c0e8511](https://github.com/Zetesis-Labs/PayloadAgents/commit/c0e85111bf4d798a56eeea592402ff262247d009))
* replace chat-agent with AG-UI based @zetesis/agent-ui ([#64](https://github.com/Zetesis-Labs/PayloadAgents/issues/64)) ([adf5acd](https://github.com/Zetesis-Labs/PayloadAgents/commit/adf5acd9cf110bf0339389c215be2075bbf69e5e))


### Bug Fixes

* **payload-documents:** address Devin review findings + refresh lockfile ([507dac6](https://github.com/Zetesis-Labs/PayloadAgents/commit/507dac6aac85710adc5790bd82864c362f42b78f))
* **payload-documents:** always render Parse button at top of form ([277517f](https://github.com/Zetesis-Labs/PayloadAgents/commit/277517fe546daa319b3b1a197c40f52b608bc653))
* **payload-documents:** mount parse endpoints under the collection and simplify button ([bd86784](https://github.com/Zetesis-Labs/PayloadAgents/commit/bd8678460baf6d095f71ab1f41ec0536f33b9477))
* **payload-documents:** rewrite same-origin absolute doc.url to loopback ([5213061](https://github.com/Zetesis-Labs/PayloadAgents/commit/52130610d96c9cb48f4dbfcfd6627dc373c3ddf7))
* **payload-documents:** self-fetch uploaded file via localhost, not serverURL ([afb2fa8](https://github.com/Zetesis-Labs/PayloadAgents/commit/afb2fa8503b43fc134879e1dd590c150759dce34))

## 0.4.0

### Minor Changes

- [#52](https://github.com/Zetesis-Labs/PayloadAgents/pull/52) [`af819b1`](https://github.com/Zetesis-Labs/PayloadAgents/commit/af819b1c48ab1a5d0c422fbba2614d623993f01b) Thanks [@Fiser12](https://github.com/Fiser12)! - Add internal read + binary + write endpoints for the documents worker.

  In worker mode the plugin now exposes three dedicated endpoints the worker
  calls instead of going through the standard REST API for the document:

  - `GET /:id/parse-context` — returns a hardcoded projection of the fields
    the worker needs to drive the parse: `id, url, filename, mimeType,
language, parsing_instruction, mode`.
  - `GET /:id/parse-file` — streams the upload binary back to the worker.
    Storage knowledge stays in the host: the plugin defers the actual fetch
    to a `worker.resolveFileBinary` callback supplied at plugin construction
    (S3/R2 hosts wire it to `s3.send(new GetObjectCommand(...))`; local-fs
    hosts read from disk; etc.). Endpoint is only registered when the
    resolver is provided.
  - `POST /:id/parse-result` — accepts a hardcoded whitelist of writeable
    fields: `parsed_text, parse_status, parse_error, parse_job_id,
parsed_at`.

  All three are only registered when `worker: { url, internalSecret }` is
  configured (parse-file additionally needs `resolveFileBinary`), all three
  authenticate with `X-Internal-Secret` (matched against the same
  `worker.internalSecret` the kicker validates), and all three call Payload's
  local API with `overrideAccess: true`.

  This lets host apps keep the documents collection's read + update access
  honestly locked down (multi-tenant filters, admin-only writes, etc.) AND
  keep upload URLs gated by Payload — no service-account bypass needs to be
  poked into collection access, no public/signed file URLs need to be
  exposed to bypass it. Trust between the two services lives in three small,
  auditable handlers instead of being scattered across collection access
  controls.

  Pairs with `payload-documents-worker-builder`'s new `fetch_parse_context()`,
  `fetch_parse_file()`, and `submit_parse_result()` client methods. Hosts
  on worker mode that want the secure binary path bump the package and the
  worker library together AND wire `worker.resolveFileBinary` in their
  plugin config; hosts that opt to leave it unset keep the previous behavior
  (worker fetches `doc.url` directly with its API token, which only works
  when the host's storage adapter exposes the upload via a URL the worker
  can reach without Payload-side access control).

### Patch Changes

- [#57](https://github.com/Zetesis-Labs/PayloadAgents/pull/57) [`25766b5`](https://github.com/Zetesis-Labs/PayloadAgents/commit/25766b57ed5912d97e3141e8f6d87b2a78c57445) Thanks [@Fiser12](https://github.com/Fiser12)! - Cleanup pass on the documents-worker code paths introduced in 0.4.0.

  Plugin (TypeScript):

  - Extracts the `requireInternalSecret` helper to `endpoints/shared.ts` so the
    three internal endpoints (`parse-context`, `parse-result`, `parse-file`)
    share one definition instead of three verbatim copies.
  - Adds `fetchInternalDocument` for the `findByID` + `overrideAccess: true` +
    try/catch pattern the read endpoints all repeat; consolidated into one
    `loadDocument` underneath `fetchDocument` and `fetchInternalDocument`.
  - Moves `fetchUploadedFile` and `getLlamaParseClient` out of `shared.ts` into
    a new `endpoints/inline-helpers.ts` — they're only used by the inline
    parse + parse-status paths, not by the worker endpoints.
  - `DocumentRecord` moves to `plugin/types.ts` so `ResolveFileBinary.doc` can
    use it instead of `Record<string, unknown>` (host callbacks now get
    autocompletion). Drops the duplicate internal `WorkerEndpointConfig` in
    favour of the public `DocumentsWorkerConfig`.
  - `parse-endpoint.ts` no longer ships the now-invalid `'default'` mode
    fallback to LlamaParse; passes `undefined` (the API picks its own default).
  - Drops a dead JSDoc-density block on the loopback URL rewrite by extracting
    it to a private helper in `inline-helpers.ts`.

  No behavioural changes for the public surface (`createDocumentsPlugin`,
  `buildDocumentsCollection`, the published types).

- [#52](https://github.com/Zetesis-Labs/PayloadAgents/pull/52) [`f93eb5f`](https://github.com/Zetesis-Labs/PayloadAgents/commit/f93eb5fb581e7e5db91a48f20154c09a8d5388a6) Thanks [@Fiser12](https://github.com/Fiser12)! - Update the documents collection's `mode` field to LlamaParse's current
  `parse_mode` enum.

  LlamaParse renamed the `fast` / `default` / `premium` enum to:

  - `parse_page_without_llm` (no LLM, OCR only — replaces `fast`)
  - `parse_page_with_llm` (balanced — replaces `default`, new default value)
  - `parse_page_with_lvm` (vision — replaces `premium`)
  - `parse_page_with_agent` / `parse_page_with_layout_agent` (per-page agentic)
  - `parse_document_with_llm` / `parse_document_with_lvm` / `parse_document_with_agent`
    (whole-document context)

  The plugin's collection schema, `LlamaParseMode` type, and the inline LlamaParse
  client (`parse_mode` form field instead of the old `fast_mode` / `premium_mode`
  booleans) all switch to the new enum together.

  Hosts on Postgres need a one-shot data migration to rewrite existing rows
  with the legacy values onto the new enum before the column type can be
  swapped. ZetesisPortal ships such a migration alongside the bump
  (`20260504_*_rename_documents_mode_llamaparse.ts`); other hosts should
  mirror that mapping (`fast → parse_page_without_llm`, `default →
parse_page_with_llm`, `premium → parse_page_with_lvm`).

- [#57](https://github.com/Zetesis-Labs/PayloadAgents/pull/57) [`25766b5`](https://github.com/Zetesis-Labs/PayloadAgents/commit/25766b57ed5912d97e3141e8f6d87b2a78c57445) Thanks [@Fiser12](https://github.com/Fiser12)! - Re-export the `ResolveFileBinary` type from the package root and from
  `./plugin`. It was declared in `src/plugin/types.ts` but never re-exported,
  so consumers couldn't type their `resolveFileBinary` callback against it.

## 0.3.0

### Minor Changes

- [`d8912b9`](https://github.com/Zetesis-Labs/PayloadAgents/commit/d8912b9bc46a4f7e0378085486b4d936446a548d) - Add opt-in `worker` config to off-load LlamaParse to a queue worker.

  When the new `worker: { url, internalSecret }` option is provided, the parse endpoint stops calling LlamaParse inline and instead `POST`s to `${url}/tasks/parse-document` with `{ document_id }` and an `X-Internal-Secret` header. The downstream worker (e.g. `backend/payload-worker` from `payload-worker-builder`) is responsible for downloading the upload, running the parse, polling LlamaCloud, and writing `parsed_text` / `parse_status` back via Payload REST. The `parse-status` endpoint becomes a passive read of the document's current status when worker mode is on, since the worker stamps the result directly.

  When `worker` is omitted the legacy inline behavior is unchanged: `POST /:id/parse` uploads to LlamaParse from the Next.js process and `GET /:id/parse-status` polls LlamaCloud and updates the doc.

  Exports a new `DocumentsWorkerConfig` type for consumers wiring the option from env.

## 0.2.2

### Patch Changes

- [`5213061`](https://github.com/Zetesis-Labs/PayloadAgents/commit/52130610d96c9cb48f4dbfcfd6627dc373c3ddf7) - Fix Parse endpoint when `doc.url` is absolute with a host that differs from
  the loopback (browser-facing `serverURL`).

  0.2.1 only rewrote **relative** URLs to `http://localhost:${PORT}`, but
  Payload prefixes `serverURL` to every upload URL when it's configured, so
  `doc.url` is virtually always absolute — e.g.
  `https://nexus.localhost/api/documents/file/foo.pdf` under docker-compose,
  or the public ingress host inside a Kubernetes pod. The plugin still
  fetched that absolute URL as-is and failed with `fetch failed`
  (ENOTFOUND / ECONNREFUSED) because the browser-facing host doesn't resolve
  from inside the server container.

  `fetchUploadedFile` now compares `doc.url`'s origin against
  `req.payload.config.serverURL`:

  - **Same origin** (relative URL, or absolute with the same host as
    `serverURL`) → rewrite to `http://localhost:${PORT}${pathname}${search}`.
    Same-process loopback = always reachable.
  - **Different origin** (e.g. direct S3/R2/MinIO links when a storage
    adapter is configured with `disablePayloadAccessControl: true`) →
    fetched as-is. No change to that path.

  No configuration change required — the correct behaviour is inferred from
  the existing `serverURL`.

## 0.2.1

### Patch Changes

- [`afb2fa8`](https://github.com/Zetesis-Labs/PayloadAgents/commit/afb2fa8503b43fc134879e1dd590c150759dce34) - Fix Parse endpoint self-fetch so it works regardless of the public server
  URL.

  `fetchUploadedFile` used to build the file URL by concatenating
  `req.payload.config.serverURL` with the document's relative URL. That
  `serverURL` is the browser-facing URL (admin panel, email links, etc.) and
  is usually unreachable from inside the server container itself —
  `https://nexus.localhost` under docker-compose, or the public ingress host
  inside a Kubernetes pod — which caused the Parse button to fail with an
  ECONNREFUSED wrapped in a 502.

  The upload is served by Payload's own HTTP handler in the same Node
  process, so the fetch is now directed at `http://localhost:${PORT}`
  (defaulting to 3000). Same-process → always reachable, no dependency on
  `serverURL` or any other deploy-specific hostname. Absolute URLs returned
  by storage adapters (public S3/R2/MinIO buckets) continue to be fetched
  directly as before.

## 0.2.0

### Minor Changes

- [#24](https://github.com/Zetesis-Labs/PayloadAgents/pull/24) [`15ada08`](https://github.com/Zetesis-Labs/PayloadAgents/commit/15ada08c596056c54396a6208c0d427d0b8cd748) Thanks [@Fiser12](https://github.com/Fiser12)! - Add new `@zetesis/payload-documents` package: a Payload CMS plugin that registers an upload-enabled `documents` collection and wires a LlamaParse (LlamaIndex Cloud) flow to parse uploaded PDFs into editable markdown.

  The plugin is configuration-driven — parsing parameters (`language`, `mode`, `parsing_instruction`) live on the document itself so each upload can be tuned independently. `result_type` is fixed to markdown so downstream consumers get a stable shape.

  - **Admin UX**: a `ParseButtonField` (client boundary at `@zetesis/payload-documents/client`) posts to the plugin's REST endpoints and polls until the job settles, then reloads so the parsed markdown appears in the document.
  - **Endpoints**: `POST /api/{slug}/:id/parse` kicks off a job and stores `parse_job_id`; `GET /api/{slug}/:id/parse-status` polls LlamaParse and writes the resulting markdown into a `parsed_text` code field when `SUCCESS`.
  - **Multitenancy & storage** are intentionally not hardcoded — host apps add the collection slug to their existing `@payloadcms/plugin-multi-tenant` and `@payloadcms/storage-s3` configurations.

  ```ts
  import { createDocumentsPlugin } from "@zetesis/payload-documents";

  export default buildConfig({
    plugins: [createDocumentsPlugin().plugin],
  });
  ```

### Patch Changes

- [#24](https://github.com/Zetesis-Labs/PayloadAgents/pull/24) [`507dac6`](https://github.com/Zetesis-Labs/PayloadAgents/commit/507dac6aac85710adc5790bd82864c362f42b78f) Thanks [@Fiser12](https://github.com/Fiser12)! - Address three issues raised in the Devin review of PR #24:

  - **Treat `CANCELED` LlamaParse jobs as terminal.** `resolveJob` in the parse-status endpoint previously fell through to `handleProcessing` for any status other than `SUCCESS`/`ERROR`, including `CANCELED`. Canceled jobs never transition to `SUCCESS` or `ERROR`, so the document stayed in `processing` and the client polled forever. Canceled jobs now surface as `parse_status='error'` with the message "LlamaParse job was canceled" (overridable by the API's own `error_message`).
  - **Fail-fast when the uploaded file URL cannot be resolved.** `fetchUploadedFile` used to fall back to an empty `serverURL`, which turned a relative upload URL into a path-only string and blew up Node's `fetch` with a cryptic `TypeError: Invalid URL`. It now returns a clear 500 (`"Payload serverURL is not configured and the uploaded file URL is relative"`) when the URL is relative and no `serverURL` is set.
  - **Clean up the polling interval on unmount.** `ParseButtonField` started a `setInterval` via `startPolling` but never cleared it when the component unmounted. If the user navigated away mid-parse, the interval kept firing, called `setState` on an unmounted component, and could trigger `window.location.reload()` after navigation. Added a `useEffect` cleanup that always clears the interval on unmount.

- [#24](https://github.com/Zetesis-Labs/PayloadAgents/pull/24) [`277517f`](https://github.com/Zetesis-Labs/PayloadAgents/commit/277517fe546daa319b3b1a197c40f52b608bc653) Thanks [@Fiser12](https://github.com/Fiser12)! - Make the **Parse with LlamaParse** button always visible in the admin.

  Previously the button was declared as a UI field inside a `Parsing` tab and was conditionally hidden while the document had no `id` (i.e. before the first save). Users could not find the button after uploading a PDF because it only appeared if they remembered to click the `Parsing` tab _after_ saving.

  Now:

  - The `parse_action` UI field is rendered at the top of the form, outside the tabs, so it shows up as soon as the document is opened.
  - The button is always rendered — when the document has not been saved yet, it is disabled with the hint "Upload a PDF and save the document to enable parsing." This makes the flow discoverable without relying on users knowing they need to save first.
  - Status, job id, parsed-at and the error textarea are still on the form but at top-level (status/job/date in the sidebar) so the remaining `tabs` (`Params`, `Output`) only group things that actually belong together.
  - `toast.info` is replaced with `toast.success` for the "Parsing started" notification to avoid a possible runtime mismatch with the subset of toast methods re-exported from `@payloadcms/ui`.

  No config or behavior changes on the server side — only how the admin surfaces the existing flow.
