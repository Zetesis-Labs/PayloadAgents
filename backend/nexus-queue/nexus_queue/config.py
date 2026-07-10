"""Runtime configuration consumed by the worker runtime.

A single pydantic model filled in by the consumer. No env loading inside the
library (mirrors `agno-agent-builder` / `payload-documents-worker-builder`) so a
multi-tenant deploy can build several `RuntimeConfig` instances from one env.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, SecretStr, ValidationInfo, field_validator, model_validator

from nexus_queue import naming


class RuntimeConfig(BaseModel):
    """Everything the runtime needs that is not a port adapter or a handler."""

    app_name: str = Field(
        description="FastAPI title and structlog identity; shows up in logs and /health.",
    )

    # ── Identity / namespacing ─────────────────────────────────────────────
    project: str = Field(
        description="Stable short project slug used to namespace streams, e.g. 'zp', 'nixon'.",
    )
    queue: str = Field(
        description="Logical queue/pipeline name, e.g. 'documents', 'jobs'.",
    )

    # ── Broker ─────────────────────────────────────────────────────────────
    nats_url: str | None = Field(
        default=None,
        description="NATS server URL, e.g. nats://nats:4222 (required).",
    )

    # ── HTTP kicker ────────────────────────────────────────────────────────
    internal_secret: SecretStr = Field(
        default=SecretStr(""),
        description="Shared secret required by the kicker (X-Nexus-Secret). Empty disables the kicker auth gate.",
    )
    public_paths: tuple[str, ...] = Field(
        default=("/health", "/ready", "/metrics", "/docs", "/openapi.json"),
        description="Kicker paths served without the secret.",
    )

    # ── Retry / DLQ / idempotency ──────────────────────────────────────────
    max_retries: int = Field(
        default=3,
        ge=0,
        description="Retry attempts before a message is dead-lettered.",
    )
    retry_base_delay_s: float = Field(
        default=2.0,
        gt=0,
        description="Base delay for the exponential backoff applied between retries.",
    )
    idempotency_ttl_s: int = Field(
        default=86_400,
        ge=0,
        description="TTL of the dedup key; 0 disables the idempotency claim.",
    )
    idempotency_lease_s: float = Field(
        default=30.0,
        gt=0,
        description=(
            "Lease on an in-progress claim, refreshed while the handler runs "
            "(via the ack_wait heartbeat). If the holder dies, the lease "
            "expires after this many seconds and a later delivery takes the "
            "claim over — bounding how long a crashed attempt blocks its idem "
            "key (vs the full idempotency_ttl_s). Must exceed the heartbeat "
            "interval; short handlers never reach it."
        ),
    )
    # ── Logging ────────────────────────────────────────────────────────────
    log_level: str = Field(default="INFO")

    @field_validator("project", "queue")
    @classmethod
    def _validate_slug(cls, value: str, info: ValidationInfo) -> str:
        return naming.validate_slug(value, kind=info.field_name or "slug")

    @model_validator(mode="after")
    def _require_nats_url(self) -> RuntimeConfig:
        if not self.nats_url:
            raise ValueError("nats_url is required")
        return self

    # ── NATS JetStream names ───────────────────────────────────────────────

    @property
    def work_subject(self) -> str:
        return naming.work_subject(self.project, self.queue)

    @property
    def dlq_subject(self) -> str:
        return naming.dlq_subject(self.project, self.queue)

    @property
    def nats_stream(self) -> str:
        return naming.nats_stream_name(self.project, self.queue)

    @property
    def nats_dlq_stream(self) -> str:
        return naming.nats_dlq_stream_name(self.project, self.queue)

    @property
    def nats_durable(self) -> str:
        return naming.nats_durable_name(self.project, self.queue)

    @property
    def advisory_subject(self) -> str:
        return naming.max_deliveries_advisory_subject(self.nats_stream, self.nats_durable)

    @property
    def nats_advisory_stream(self) -> str:
        return naming.nats_advisory_stream_name(self.project, self.queue)

    @property
    def nats_advisory_durable(self) -> str:
        return naming.nats_advisory_durable_name(self.project, self.queue)
