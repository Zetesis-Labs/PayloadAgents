# nexus-queue

Portable worker runtime for the **Nexus-Queue** standard: NATS JetStream,
domain-agnostic, ports-and-adapters. One project builds queues the same way as
the next, and a worker's handlers move between projects unchanged.

What this package owns (the parts that are the *same* across projects):

- **Namespaced subjects/streams** — `nq.{project}.{queue}` on stream
  `NQ_{PROJECT}_{QUEUE}` (+ DLQ and advisory streams), so multiple
  projects/queues coexist on one NATS (a transport's default/global queue
  name is never used).
- **Versioned envelope** — standard labels (`nq_v`, `nq_task`, `nq_tenant`,
  `nq_idem`, `nq_trace`, `nq_enqueued_at`, `nq_priority`) plus typed pydantic
  payloads.
- **Ports** — `JobStatePort`, `BlobStorePort`, `IndexPort`, `StatusEventPort`.
  Handlers depend only on these; each project supplies the adapters
  (e.g. Payload vs Postgres/MinIO).
- **Runtime semantics** — idempotency claims on NATS KV (dedup on `nq_idem`),
  retries with exponential backoff + jitter, DLQ on retry exhaustion (durable
  `MAX_DELIVERIES` advisory capture — never a silent drop), OTel tracing
  (`nq_trace` propagation), and Prometheus metrics.
- **Producer** — a Python `NatsPublisher`; the TypeScript producer client
  ships as `@zetesis/nexus-queue`. Both publish to NATS directly — there is
  no HTTP enqueue facade; the worker's HTTP surface is probes/metrics only
  (`create_probes_app`).

Spec: `nexus-queue-spec.md`.

Released via release-please on every conventional commit to `main`
(scope `nexus-queue`).
