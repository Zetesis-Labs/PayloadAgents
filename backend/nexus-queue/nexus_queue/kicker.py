"""Generic HTTP kicker for producers that can't speak NATS directly (e.g. a
webhook or serverless caller). ``POST /enqueue/{task}`` gated by
``X-Nexus-Secret``, plus ``/health``/``/ready``/``/metrics``.

Built by :func:`create_nats_kicker`; :func:`create_probes_app` is the
probes/metrics-only variant for workers whose producers publish to NATS
directly.
"""

from __future__ import annotations

import hmac
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from typing import Any, Protocol

import structlog
from fastapi import FastAPI, Request, Response, status
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel, Field

from nexus_queue.config import RuntimeConfig
from nexus_queue.naming import SINGLE_TENANT

logger = structlog.get_logger("nexus_queue.kicker")


class EnqueueRequest(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)
    tenant: str = SINGLE_TENANT
    idempotency_key: str | None = None
    priority: str = "default"
    trace: str | None = None


class _PublisherLike(Protocol):
    async def enqueue_raw(
        self,
        task: str,
        payload: dict[str, Any],
        *,
        tenant: str,
        idempotency_key: str | None,
        priority: str,
        trace: str | None,
    ) -> str: ...


def create_nats_kicker(config: RuntimeConfig, *, ensure_topology: bool = True) -> FastAPI:
    """Build the FastAPI kicker for JetStream (D14).

    Owns its NATS connection through the app lifespan. ``ensure_topology``
    creates the work/DLQ streams if absent (tests/local dev; prod = NACK CRDs).
    """

    @asynccontextmanager
    async def publisher_ctx() -> AsyncIterator[_PublisherLike]:
        import nats

        from nexus_queue.nats_runtime import NatsPublisher, ensure_streams

        if config.nats_url is None:  # unreachable: the config validator enforces it
            raise RuntimeError("nats_url is required")
        nc = await nats.connect(config.nats_url)
        js = nc.jetstream()
        if ensure_topology:
            await ensure_streams(js, config)
        try:
            yield NatsPublisher(js, config)
        finally:
            await nc.close()

    return _build_kicker(config, publisher_ctx)


def create_probes_app(config: RuntimeConfig) -> FastAPI:
    """HTTP surface for a worker that does NOT accept enqueues — only the
    Kubernetes probes and the Prometheus scrape endpoint.

    Used when producers publish to the broker directly (no HTTP kicker), so the
    worker still needs ``/health``, ``/ready`` and ``/metrics`` but not
    ``/enqueue`` — and therefore no publisher connection of its own.
    """
    app = FastAPI(title=config.app_name)

    @app.get("/health")
    async def health() -> dict[str, str]:  # pyright: ignore[reportUnusedFunction]
        return {"status": "ok"}

    @app.get("/ready")
    async def ready() -> dict[str, str]:  # pyright: ignore[reportUnusedFunction]
        return {"status": "ok"}

    @app.get("/metrics")
    async def metrics() -> Response:  # pyright: ignore[reportUnusedFunction]
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    return app


def _build_kicker(
    config: RuntimeConfig,
    publisher_ctx: Callable[[], AbstractAsyncContextManager[_PublisherLike]],
) -> FastAPI:
    """The transport-independent HTTP surface around a publisher context."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Fail-open is allowed (some deploys front the kicker with a mesh), but it
        # must never be silent: an empty secret leaves /enqueue unauthenticated.
        if not config.internal_secret.get_secret_value():
            logger.warning(
                "kicker-auth-disabled",
                detail="internal_secret is empty; /enqueue is unauthenticated",
            )
        async with publisher_ctx() as publisher:
            app.state.publisher = publisher
            yield

    app = FastAPI(title=config.app_name, lifespan=lifespan)

    @app.middleware("http")
    async def _auth(request: Request, call_next: Any) -> Any:  # pyright: ignore[reportUnusedFunction]
        if request.url.path in config.public_paths:
            return await call_next(request)
        secret = config.internal_secret.get_secret_value()
        if secret:
            provided = request.headers.get("x-nexus-secret", "")
            if not hmac.compare_digest(provided, secret):
                return JSONResponse(
                    {"error": "Forbidden"},
                    status_code=status.HTTP_403_FORBIDDEN,
                )
        return await call_next(request)

    @app.get("/health")
    async def health() -> dict[str, str]:  # pyright: ignore[reportUnusedFunction]
        return {"status": "ok"}

    @app.get("/ready")
    async def ready() -> dict[str, str]:  # pyright: ignore[reportUnusedFunction]
        return {"status": "ok"}

    @app.get("/metrics")
    async def metrics() -> Response:  # pyright: ignore[reportUnusedFunction]
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    @app.post("/enqueue/{task}", status_code=status.HTTP_202_ACCEPTED)
    async def enqueue(  # pyright: ignore[reportUnusedFunction]
        task: str,
        body: EnqueueRequest,
        request: Request,
    ) -> dict[str, str]:
        publisher: _PublisherLike = request.app.state.publisher
        task_id = await publisher.enqueue_raw(
            task,
            body.payload,
            tenant=body.tenant,
            idempotency_key=body.idempotency_key,
            priority=body.priority,
            trace=body.trace,
        )
        return {"status": "queued", "task": task, "task_id": task_id}

    return app
