"""Top-level factories.

v1 (taskiq/Redis): ``create_worker(config, adapters, handlers)`` — expose the
returned ``broker`` to the taskiq CLI and ``app`` to uvicorn (two processes,
or the in-process ``--workers 1`` pattern).

v2 (JetStream, D14): ``run_nats_worker(config, adapters, handlers)`` — the
standard single-process entrypoint the worker chart expects: receiver +
kicker/probes/metrics HTTP in one process, SIGTERM drains gracefully.
"""

from __future__ import annotations

import asyncio
from collections.abc import Iterator, Sequence
from dataclasses import dataclass

import uvicorn
from fastapi import FastAPI
from taskiq import AsyncBroker

from nexus_queue.broker import create_broker
from nexus_queue.config import RuntimeConfig
from nexus_queue.handlers import HandlerSpec, register
from nexus_queue.kicker import create_kicker, create_nats_kicker
from nexus_queue.lifecycle import configure_logging, register_lifecycle
from nexus_queue.nats_runtime import NatsWorker
from nexus_queue.tracing import configure_tracing


@dataclass(slots=True, frozen=True)
class WorkerApp:
    """Bundle returned by :func:`create_worker`: ``app, broker = create_worker(...)``."""

    app: FastAPI
    broker: AsyncBroker

    def __iter__(self) -> Iterator[FastAPI | AsyncBroker]:
        yield self.app
        yield self.broker


def create_worker(
    config: RuntimeConfig,
    adapters: object,
    handlers: Sequence[HandlerSpec],
) -> WorkerApp:
    """Build the broker (namespaced + middleware), register lifecycle + handlers,
    and wrap a FastAPI kicker."""
    configure_logging(config)
    configure_tracing(config)
    broker = create_broker(config)
    register_lifecycle(broker, config, adapters)
    for spec in handlers:
        register(broker, spec, config)
    app = create_kicker(broker, config)
    return WorkerApp(app=app, broker=broker)


async def run_nats_worker(
    config: RuntimeConfig,
    adapters: object,
    handlers: Sequence[HandlerSpec],
    *,
    host: str = "0.0.0.0",  # noqa: S104 — a worker pod binds all interfaces by design
    port: int = 8000,
    ensure_topology: bool = True,
) -> None:
    """Standard v2 worker entrypoint (single process): JetStream receiver +
    kicker/probes/metrics HTTP server.

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
    app = create_nats_kicker(config, ensure_topology=False)  # worker already ensured
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
