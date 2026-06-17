"""Generic HTTP kicker for producers that can't speak Redis directly
(e.g. a TypeScript/Payload caller). One standard contract for every project:
``POST /enqueue/{task}`` gated by ``X-Nexus-Secret``, plus ``/health``/``/ready``.
"""

from __future__ import annotations

import hmac
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import FastAPI, Request, Response, status
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel, Field
from taskiq import AsyncBroker

from nexus_queue.config import RuntimeConfig
from nexus_queue.naming import SINGLE_TENANT
from nexus_queue.publisher import Publisher

logger = structlog.get_logger("nexus_queue.kicker")


class EnqueueRequest(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)
    tenant: str = SINGLE_TENANT
    idempotency_key: str | None = None
    priority: str = "default"
    trace: str | None = None


def create_kicker(broker: AsyncBroker, config: RuntimeConfig) -> FastAPI:
    """Build the FastAPI kicker the consumer hands to uvicorn."""

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        # Fail-open is allowed (some deploys front the kicker with a mesh), but it
        # must never be silent: an empty secret leaves /enqueue unauthenticated.
        if not config.internal_secret.get_secret_value():
            logger.warning(
                "kicker-auth-disabled",
                detail="internal_secret is empty; /enqueue is unauthenticated",
            )
        # The kicker connects the broker; the worker process owns its own lifecycle.
        if not broker.is_worker_process:
            await broker.startup()
        yield
        if not broker.is_worker_process:
            await broker.shutdown()

    app = FastAPI(title=config.app_name, lifespan=lifespan)
    publisher = Publisher(broker, config)

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
    ) -> dict[str, str]:
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
