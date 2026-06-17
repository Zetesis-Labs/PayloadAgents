# nexus-queue

Portable worker runtime for the **Nexus-Queue** standard: taskiq + Redis Streams,
domain-agnostic, ports-and-adapters. One project builds queues the same way as
the next, and a worker's handlers move between projects unchanged.

What this package owns (the parts that are the *same* across projects):

- **Namespaced streams** — `nq:{project}:{queue}` (+ `:cg`, `:dlq`) and
  `nq:{project}:status`, so multiple projects/queues coexist on one Redis
  (the default global `"taskiq"` stream is never used).
- **Versioned envelope** — standard labels (`nq_v`, `nq_task`, `nq_tenant`,
  `nq_idem`, `nq_trace`, `nq_enqueued_at`, `nq_priority`) on top of taskiq's
  message, plus typed pydantic payloads.
- **Ports** — `JobStatePort`, `BlobStorePort`, `IndexPort`, `StatusEventPort`.
  Handlers depend only on these; each project supplies the adapters
  (e.g. Payload vs Postgres/MinIO).
- **Middleware stack** (broker-level): idempotency (dedup on `nq_idem`),
  DLQ (dead-letter on retry-exhaustion instead of silent drop), retries with
  exponential backoff + jitter, OTel tracing (`nq_trace` propagation), and
  Prometheus metrics.
- **Producer + kicker** — a Python `Publisher` and a generic HTTP kicker for
  non-Python producers. The TypeScript producer client ships as
  `@zetesis/nexus-queue`.

Spec: `nexus-queue-spec.md`.

Released via release-please on every conventional commit to `main`
(scope `nexus-queue`).
