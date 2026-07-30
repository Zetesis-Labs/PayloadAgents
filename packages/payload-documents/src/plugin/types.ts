import type { CollectionConfig, PayloadRequest } from 'payload'
import type { LlamaParseMode } from '../llama-parse/types'

export interface DocumentsPluginOverrides {
  collection?: (collection: CollectionConfig) => CollectionConfig
}

/**
 * Shape of a document as exposed by the plugin's collection. Matches the
 * upload-enabled fields Payload returns plus the parse_* fields the plugin
 * adds. Hosts get autocompletion when receiving this in callbacks.
 */
export interface DocumentRecord {
  id: string | number
  /** Payload's row version timestamp; used to key a parse job for idempotency. */
  updatedAt?: string | null
  /** Owning tenant id (multi-tenant deploys); stamped on the parse job for
   * per-tenant idempotency namespacing and tracing. */
  tenant?: string | number | null
  filename?: string | null
  url?: string | null
  mimeType?: string | null
  language?: string | null
  parsing_instruction?: string | null
  mode?: LlamaParseMode | null
  parse_status?: 'idle' | 'pending' | 'processing' | 'done' | 'error' | null
  parse_job_id?: string | null
  parse_error?: string | null
  parsed_at?: string | null
  parsed_text?: string | null
}

/**
 * Resolves the binary contents of a document's attached upload. The plugin
 * stays storage-agnostic by deferring this to the host: hosts using S3/R2 wire
 * this to an `s3.send(new GetObjectCommand(...))` call against their bucket;
 * hosts on the local filesystem stream from disk; etc.
 *
 * Return any payload that the Web Fetch `Response` constructor accepts as a
 * body (`Uint8Array`, `Buffer`, `ReadableStream`, `Blob`, …). When unset, the
 * `parse-file` endpoint isn't registered and the worker has no way to fetch
 * binaries through the plugin.
 */
export type ResolveFileBinary = (args: { doc: DocumentRecord; req: PayloadRequest }) => Promise<{
  body: BodyInit
  contentType?: string
  contentLength?: number
}>

/**
 * When set, the parse endpoint publishes a task straight to NATS JetStream
 * (via `@zetesis/nexus-queue`) instead of calling LlamaParse inline. The worker
 * downloads the upload, runs the parse, and writes `parsed_text` / `parse_status`
 * back via Payload REST. The parse-status endpoint becomes a passive read in
 * this mode (it returns the document's current `parse_status`).
 */
export interface DocumentsWorkerConfig {
  /**
   * NATS server URL the producer publishes to (e.g. `nats://nats:4222` or
   * `nats://nats.nats.svc.cluster.local:4222`).
   */
  natsUrl: string
  /**
   * Project slug that namespaces the subject (`nq.{project}.{queue}`), e.g. `zp`.
   * Must match the worker's `RuntimeConfig.project`.
   */
  project: string
  /**
   * Queue name that namespaces the subject, e.g. `documents`. Must match the
   * worker's `RuntimeConfig.queue`.
   */
  queue: string
  /**
   * Shared secret the WORKER sends back as `X-Internal-Secret` when it calls
   * this app's `/parse-file` / `/parse-context` endpoints. Must match the value
   * `payload-documents-worker-builder` / `nexus-queue` `RuntimeConfig.internal_secret`
   * was built with. (Enqueue no longer uses it — the producer talks NATS directly.)
   */
  internalSecret: string
  /**
   * Nexus-Queue task name to enqueue (namespaced, e.g. `zp.documents.parse`).
   * Defaults to `documents.parse`.
   */
  taskName?: string
  /**
   * Optional resolver for the binary contents of a document's attached upload.
   * When provided, the plugin registers `GET /:id/parse-file` and the worker
   * fetches the binary through that endpoint instead of touching `doc.url`.
   * The host owns the storage knowledge (S3 client, bucket, prefix, etc.); the
   * plugin only provides the auth boundary (`X-Internal-Secret` validation +
   * `findByID` with `overrideAccess: true` to load the doc).
   *
   * When unset, the worker falls back to fetching `doc.url` directly with its
   * API token — only works when the host's storage adapter exposes the upload
   * via a URL the worker can reach without Payload-side access control.
   */
  resolveFileBinary?: ResolveFileBinary
}

export interface DocumentsPluginConfig {
  /**
   * Slug of the collection to register. Defaults to `documents`.
   */
  collectionSlug?: string
  /**
   * LlamaParse (LlamaIndex Cloud) API key. Defaults to `process.env.LLAMA_CLOUD_API_KEY`.
   * Ignored when `worker` is set: the worker holds its own credentials.
   */
  llamaParseApiKey?: string
  /**
   * Override the base URL of the LlamaParse API. Defaults to the public LlamaIndex Cloud endpoint.
   * Ignored when `worker` is set.
   */
  llamaParseBaseUrl?: string
  /**
   * Optional async-worker mode. When provided, `POST /:id/parse` queues a job
   * on the worker via HTTP and returns immediately; LlamaParse upload + polling
   * + writeback all happen in the worker process. When absent, the plugin runs
   * the parse inline (legacy behavior, useful for small deploys + tests).
   */
  worker?: DocumentsWorkerConfig
  /**
   * Hooks to let host apps customize the generated collection
   * (access, admin group, tenant wiring, etc.) without forking the plugin.
   */
  overrides?: DocumentsPluginOverrides
}

export interface DocumentsPluginResult {
  plugin: (config: import('payload').Config) => import('payload').Config
}

export const DEFAULT_COLLECTION_SLUG = 'documents'
