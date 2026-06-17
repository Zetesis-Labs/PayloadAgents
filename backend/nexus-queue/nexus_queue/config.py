"""Runtime configuration consumed by the worker runtime.

A single pydantic model filled in by the consumer. No env loading inside the
library (mirrors `agno-agent-builder` / `payload-documents-worker-builder`) so a
multi-tenant deploy can build several `RuntimeConfig` instances from one env.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, SecretStr, ValidationInfo, field_validator

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
    redis_url: str = Field(
        description="Redis URL for the taskiq-redis stream broker (e.g. redis://redis:6379).",
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
    retry_poll_interval_s: float = Field(
        default=1.0,
        gt=0,
        description="How often the delayed-retry poller drains due retries back onto the work stream.",
    )
    idempotency_ttl_s: int = Field(
        default=86_400,
        ge=0,
        description="TTL of the dedup key; 0 disables the idempotency middleware.",
    )
    dlq_maxlen: int = Field(
        default=100_000,
        ge=0,
        description="Approx MAXLEN for the dead-letter stream; 0 = unbounded.",
    )

    # ── Observability ──────────────────────────────────────────────────────
    metrics_port: int | None = Field(
        default=None,
        gt=0,
        lt=65_536,
        description=(
            "If set, the worker serves Prometheus metrics on this port via an "
            "in-process HTTP server (scrape target for a ServiceMonitor). The "
            "taskiq worker has no HTTP server otherwise, so its consume counters "
            "are invisible without this. Run the worker single-process "
            "(taskiq --workers 1) and scale by pods, or the port will collide. "
            "None disables it."
        ),
    )

    # ── Logging ────────────────────────────────────────────────────────────
    log_level: str = Field(default="INFO")

    @field_validator("project", "queue")
    @classmethod
    def _validate_slug(cls, value: str, info: ValidationInfo) -> str:
        return naming.validate_slug(value, kind=info.field_name or "slug")

    @property
    def work_stream(self) -> str:
        return naming.work_stream(self.project, self.queue)

    @property
    def consumer_group(self) -> str:
        return naming.consumer_group(self.project, self.queue)

    @property
    def dlq_stream(self) -> str:
        return naming.dlq_stream(self.project, self.queue)

    @property
    def delayed_set(self) -> str:
        return naming.delayed_set(self.project, self.queue)

    @property
    def status_stream(self) -> str:
        return naming.status_stream(self.project)
