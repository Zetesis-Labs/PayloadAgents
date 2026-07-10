"""Probes/metrics HTTP surface for the worker: ``/health``, ``/ready``,
``/metrics``.

Producers publish to the broker directly (:class:`~nexus_queue.NatsPublisher`
or the ``@zetesis/nexus-queue`` TypeScript client) — there is no HTTP enqueue
facade. The v2 kicker (``POST /enqueue/{task}`` for producers that can't speak
NATS) was removed until a consumer actually needs one; spec §8.3 records the
removal.
"""

from __future__ import annotations

from fastapi import FastAPI, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from nexus_queue.config import RuntimeConfig


def create_probes_app(config: RuntimeConfig) -> FastAPI:
    """Kubernetes probes + the Prometheus scrape endpoint.

    Probes (decision D3): liveness/readiness report process health only.
    Broker connectivity is a metric + alert, never a probe that kills pods.
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
