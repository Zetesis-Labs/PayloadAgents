/**
 * TypeScript producer client for the Nexus-Queue standard.
 *
 * Enqueues a task by POSTing to the worker's HTTP kicker (`POST /enqueue/{task}`).
 * The kicker stamps the standard envelope labels (`nq_*`) server-side, so a
 * TypeScript producer and a Python producer put the same shape on the wire.
 */

export interface NexusQueueClientOptions {
  /** Base URL of the Nexus-Queue HTTP kicker (e.g. `http://worker:8001`). */
  kickerUrl: string
  /** Shared secret sent as `X-Nexus-Secret`; must match the worker's `internal_secret`. */
  secret: string
  /** Optional `fetch` override (tests / custom agents). Defaults to the global `fetch`. */
  fetch?: typeof fetch
}

export interface EnqueueOptions {
  /** Tenant id; defaults to the single-tenant sentinel `_`. */
  tenant?: string
  /** Idempotency key for dedup; the worker skips a duplicate within its TTL. */
  idempotencyKey?: string
  priority?: 'default' | 'high'
  /** W3C `traceparent` for end-to-end tracing into the worker. */
  trace?: string
}

export interface EnqueueResult {
  status: string
  task: string
  taskId: string
}

export class NexusQueueError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'NexusQueueError'
    this.status = status
  }
}

const NEXUS_SECRET_HEADER = 'X-Nexus-Secret'
const SINGLE_TENANT = '_'

export class NexusQueueClient {
  readonly #kickerUrl: string
  readonly #secret: string
  readonly #fetch: typeof fetch

  constructor(options: NexusQueueClientOptions) {
    this.#kickerUrl = options.kickerUrl.replace(/\/$/, '')
    this.#secret = options.secret
    this.#fetch = options.fetch ?? fetch
  }

  async enqueue(task: string, payload: Record<string, unknown>, options: EnqueueOptions = {}): Promise<EnqueueResult> {
    const response = await this.#fetch(`${this.#kickerUrl}/enqueue/${encodeURIComponent(task)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [NEXUS_SECRET_HEADER]: this.#secret
      },
      body: JSON.stringify({
        payload,
        tenant: options.tenant ?? SINGLE_TENANT,
        idempotency_key: options.idempotencyKey ?? null,
        priority: options.priority ?? 'default',
        trace: options.trace ?? null
      })
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new NexusQueueError(
        `Nexus-Queue kicker rejected ${task} (HTTP ${response.status}): ${detail.slice(0, 200)}`,
        response.status
      )
    }

    const json = (await response.json()) as { status?: string; task?: string; task_id?: string }
    return {
      status: json.status ?? 'queued',
      task: json.task ?? task,
      taskId: json.task_id ?? ''
    }
  }
}
