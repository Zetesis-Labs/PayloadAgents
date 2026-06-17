"""Top-level factory. Consumers call ``create_worker(config, adapters, handlers)``
and expose the returned ``broker`` to the taskiq CLI and ``app`` to uvicorn.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from dataclasses import dataclass

from fastapi import FastAPI
from taskiq import AsyncBroker

from nexus_queue.broker import create_broker
from nexus_queue.config import RuntimeConfig
from nexus_queue.handlers import HandlerSpec, register
from nexus_queue.kicker import create_kicker
from nexus_queue.lifecycle import configure_logging, register_lifecycle
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
