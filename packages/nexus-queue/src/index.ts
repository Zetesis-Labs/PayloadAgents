/**
 * TypeScript producer client for the Nexus-Queue standard.
 *
 * Publishes tasks straight to NATS JetStream (no HTTP kicker): the client
 * stamps the standard envelope (`nq_*` labels) itself and publishes to the
 * queue's work subject, so a TypeScript producer and the Python worker agree
 * on the same wire shape. The connection is lazy and reused across enqueues;
 * long-lived callers (a web server) should keep one client and `close()` it
 * on shutdown.
 */

import { connect, type JetStreamClient, type NatsConnection } from 'nats'

/** Wire-contract version — must match the Python runtime's `NQ_VERSION`. */
export const NQ_VERSION = '1'

/** Standard envelope label keys (mirror of `nexus_queue.naming`). */
export const LABELS = {
  version: 'nq_v',
  task: 'nq_task',
  tenant: 'nq_tenant',
  idem: 'nq_idem',
  trace: 'nq_trace',
  enqueuedAt: 'nq_enqueued_at',
  priority: 'nq_priority'
} as const

const SINGLE_TENANT = '_'

/** JetStream subject that carries a queue's work: `nq.{project}.{queue}`. */
export const workSubject = (project: string, queue: string): string => `nq.${project}.${queue}`

export interface NexusQueueClientOptions {
  /** NATS server URL, e.g. `nats://nats:4222`. */
  natsUrl: string
  /** Project slug that namespaces the subject, e.g. `zp`. */
  project: string
  /** Queue name that namespaces the subject, e.g. `documents`. */
  queue: string
  /** Optional connection name shown in NATS monitoring; defaults to `nexus-queue-producer`. */
  name?: string
}

export interface EnqueueOptions {
  /** Tenant id; defaults to the single-tenant sentinel `_`. */
  tenant?: string
  /** Idempotency key for dedup; also the broker-side `Nats-Msg-Id`. */
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
  constructor(message: string) {
    super(message)
    this.name = 'NexusQueueError'
  }
}

const randomId = (): string => globalThis.crypto.randomUUID().replace(/-/g, '')

export class NexusQueueClient {
  readonly #natsUrl: string
  readonly #project: string
  readonly #queue: string
  readonly #name: string
  readonly #subject: string
  #conn: Promise<{ nc: NatsConnection; js: JetStreamClient }> | null = null

  constructor(options: NexusQueueClientOptions) {
    this.#natsUrl = options.natsUrl
    this.#project = options.project
    this.#queue = options.queue
    this.#name = options.name ?? 'nexus-queue-producer'
    this.#subject = workSubject(options.project, options.queue)
  }

  /** Lazily open (and reuse) a single JetStream connection. */
  async #connection(): Promise<{ nc: NatsConnection; js: JetStreamClient }> {
    if (this.#conn) {
      // A connection that has permanently closed (its reconnects gave up, or it
      // was drained) must not be reused — every publish on it would throw
      // forever. Drop it and rebuild.
      const cached = await this.#conn
      if (cached.nc.isClosed()) this.#conn = null
    }
    if (!this.#conn) {
      const built = (async () => {
        try {
          const nc = await connect({
            servers: this.#natsUrl,
            name: this.#name,
            // Reconnect forever: an established connection must survive a NATS
            // outage of any length instead of closing for good and bricking
            // every later enqueue until the process restarts. The INITIAL
            // connect still fails fast (no waitOnFirstConnect) so a misconfigured
            // url surfaces loudly rather than hanging.
            maxReconnectAttempts: -1,
            reconnectTimeWait: 2000
          })
          // If it ever does close for good, drop the cache so the next enqueue
          // rebuilds rather than publishing on a dead connection.
          void nc.closed().then(() => {
            if (this.#conn === built) this.#conn = null
          })
          return { nc, js: nc.jetstream() }
        } catch (error) {
          // Don't cache a failed connect — the next enqueue should retry.
          if (this.#conn === built) this.#conn = null
          throw new NexusQueueError(
            `Nexus-Queue could not connect to NATS at ${this.#natsUrl}: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        }
      })()
      this.#conn = built
    }
    return this.#conn
  }

  async enqueue(task: string, payload: Record<string, unknown>, options: EnqueueOptions = {}): Promise<EnqueueResult> {
    const { js } = await this.#connection()

    const taskId = randomId()
    const tenant = options.tenant ?? SINGLE_TENANT
    const labels: Record<string, string> = {
      [LABELS.version]: NQ_VERSION,
      [LABELS.task]: task,
      [LABELS.tenant]: tenant,
      [LABELS.enqueuedAt]: new Date().toISOString(),
      [LABELS.priority]: options.priority ?? 'default'
    }
    if (options.idempotencyKey) labels[LABELS.idem] = options.idempotencyKey
    if (options.trace) labels[LABELS.trace] = options.trace

    const message = {
      task_id: taskId,
      task_name: task,
      labels,
      args: [] as unknown[],
      kwargs: payload
    }

    try {
      await js.publish(this.#subject, new TextEncoder().encode(JSON.stringify(message)), {
        // Broker-side publish dedup within the stream's window (D4: the
        // load-bearing dedup is still nq_idem in the worker).
        msgID: options.idempotencyKey ?? taskId
      })
    } catch (error) {
      throw new NexusQueueError(
        `Nexus-Queue failed to publish ${task} to ${this.#subject}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }

    return { status: 'queued', task, taskId }
  }

  /** Drain and close the connection. Call on shutdown; a new enqueue reopens it. */
  async close(): Promise<void> {
    if (this.#conn) {
      const conn = this.#conn
      this.#conn = null
      const { nc } = await conn
      await nc.drain()
    }
  }
}
