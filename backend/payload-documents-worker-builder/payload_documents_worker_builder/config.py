"""Runtime configuration consumed by the worker library.

Mirrors the shape of `agno_agent_builder.RuntimeConfig`: one pydantic model
populated by the consumer, no env loading inside the lib so multi-tenant
deploys can build several `RuntimeConfig` instances from a single env file.
"""

from __future__ import annotations

from nexus_queue import RuntimeConfig as NexusRuntimeConfig
from pydantic import BaseModel, Field, HttpUrl, SecretStr


class RuntimeConfig(BaseModel):
    """All knobs the consumer needs to fill in to run a worker.

    The attribute split mirrors the surface area of the upstream
    `agno-agent-builder` so consumers using both libraries see the same
    shape twice (just with `database_url`/`payload_url`/`llama_cloud_api_key`
    instead of an `agent_source`).
    """

    app_name: str = Field(
        description="FastAPI title and structlog identity. Shows up in logs and /health.",
    )

    # ── Broker ─────────────────────────────────────────────────────────────
    redis_url: str = Field(
        description="Redis connection URL used by taskiq-redis as the broker (e.g. redis://redis:6379).",
    )

    # ── Payload CMS ────────────────────────────────────────────────────────
    payload_url: HttpUrl = Field(
        description="Base URL for the Payload REST API (e.g. http://app:3000).",
    )
    documents_collection_slug: str = Field(
        default="documents",
        description="Payload collection slug for documents. Must expose the `parse_*` fields shipped by `@zetesis/payload-documents`.",
    )

    # ── LlamaParse ─────────────────────────────────────────────────────────
    llama_cloud_api_key: SecretStr = Field(
        description="LlamaCloud API key used to upload + poll parsing jobs.",
    )
    llama_parse_base_url: HttpUrl = Field(
        default=HttpUrl("https://api.cloud.llamaindex.ai"),
        description="Override only if you point to a self-hosted LlamaCloud-compatible service.",
    )
    llama_parse_poll_interval_s: float = Field(
        default=5.0,
        description="Seconds between successive LlamaCloud status polls.",
    )
    llama_parse_poll_timeout_s: float = Field(
        default=600.0,
        description="Hard cap on how long a single parse task waits before failing.",
    )

    # ── Internal HTTP kicker ──────────────────────────────────────────────
    internal_secret: SecretStr = Field(
        description="Shared secret required by every `POST /tasks/*` request (X-Internal-Secret header).",
    )
    public_paths: tuple[str, ...] = Field(
        default=("/health", "/ready", "/docs", "/openapi.json"),
        description="Paths the InternalAuthMiddleware lets through without the secret.",
    )

    # ── Observability ─────────────────────────────────────────────────────
    metrics_port: int | None = Field(
        default=None,
        description="If set, the worker serves Prometheus metrics on this port. None disables it.",
    )

    # ── Logging ───────────────────────────────────────────────────────────
    log_level: str = Field(default="INFO")

    def to_nexus_config(self) -> NexusRuntimeConfig:
        """Derive the runtime config: ZP documents land on stream nq:zp:documents."""
        return NexusRuntimeConfig(
            app_name=self.app_name,
            project="zp",
            queue="documents",
            redis_url=self.redis_url,
            internal_secret=self.internal_secret,
            public_paths=self.public_paths,
            max_retries=2,
            metrics_port=self.metrics_port,
            log_level=self.log_level,
        )
