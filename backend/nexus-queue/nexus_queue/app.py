"""Top-level worker entrypoint (JetStream, D14).

``run_nats_worker(config, adapters, handlers)`` is the standard single-process
entrypoint the worker chart expects: receiver + kicker/probes/metrics HTTP in
one process, SIGTERM drains gracefully.
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence

import uvicorn

from nexus_queue.config import RuntimeConfig
from nexus_queue.handlers import HandlerSpec
from nexus_queue.kicker import create_nats_kicker, create_probes_app
from nexus_queue.lifecycle import configure_logging
from nexus_queue.nats_runtime import NatsWorker
from nexus_queue.tracing import configure_tracing


async def run_nats_worker(
    config: RuntimeConfig,
    adapters: object,
    handlers: Sequence[HandlerSpec],
    *,
    host: str = "0.0.0.0",  # noqa: S104 — a worker pod binds all interfaces by design
    port: int = 8000,
    ensure_topology: bool = True,
    enable_kicker: bool = True,
) -> None:
    """Standard v2 worker entrypoint (single process): JetStream receiver +
    an HTTP server for probes/metrics (and, when ``enable_kicker``, the
    ``/enqueue`` endpoint).

    ``enable_kicker=False`` is for deployments whose producers publish to NATS
    directly (e.g. a TypeScript app using ``@zetesis/nexus-queue``): the worker
    then serves only ``/health``, ``/ready`` and ``/metrics`` — no publisher
    connection of its own. Leave it ``True`` for producers that can't speak the
    broker (a webhook, a serverless caller) and need the HTTP kicker.

    uvicorn owns the signal handling: SIGTERM/SIGINT stop the HTTP server,
    then the worker drains — stops fetching, finishes in-flight handlers,
    acks, and exits. ``terminationGracePeriodSeconds`` in the chart must
    cover the slowest handler.

    Probes (decision D3): ``/health`` is process liveness only. Broker
    connectivity is a metric + alert, never a probe that kills pods.
    """
    configure_logging(config)
    configure_tracing(config)
    worker = NatsWorker(config, adapters, list(handlers))
    await worker.startup(ensure_topology=ensure_topology)
    app = (
        create_nats_kicker(config, ensure_topology=False)  # worker already ensured
        if enable_kicker
        else create_probes_app(config)
    )
    server = uvicorn.Server(
        uvicorn.Config(app, host=host, port=port, log_level=config.log_level.lower())
    )
    try:
        await server.serve()
    finally:
        await worker.shutdown()


def main_nats_worker(
    config: RuntimeConfig,
    adapters: object,
    handlers: Sequence[HandlerSpec],
    **kwargs: object,
) -> None:
    """Sync wrapper for console entrypoints: ``main_nats_worker(cfg, deps, specs)``."""
    asyncio.run(run_nats_worker(config, adapters, handlers, **kwargs))  # type: ignore[arg-type]
