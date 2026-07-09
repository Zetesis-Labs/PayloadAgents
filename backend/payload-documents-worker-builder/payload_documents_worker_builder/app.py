"""Top-level factories.

v1 (taskiq/Redis): ``create_app(config)`` returns a ``WorkerApp``
(``app, broker = create_app(config)``) — expose ``broker`` to the taskiq CLI
and ``app`` to uvicorn.

v2 (JetStream, D14): ``run_worker(config)`` / ``main_worker(config)`` — the
standard single-process entrypoint: receiver + kicker/probes/metrics HTTP,
SIGTERM drains gracefully. Requires ``transport='nats'``.

The broker + retry/DLQ/idempotency/tracing/kicker all come from ``nexus-queue``;
this package only contributes the ZP adapters and the parse-document handler.
"""

from __future__ import annotations

import asyncio

from nexus_queue import HandlerSpec, WorkerApp, create_worker, run_nats_worker

from payload_documents_worker_builder.adapters import ZpDocumentsAdapters
from payload_documents_worker_builder.config import RuntimeConfig
from payload_documents_worker_builder.tasks.parse_document import (
    PARSE_DOCUMENT_TASK_NAME,
    ParsePayload,
    parse_document,
)


def _handler_specs() -> list[HandlerSpec]:
    return [
        HandlerSpec(
            task_name=PARSE_DOCUMENT_TASK_NAME,
            handler=parse_document,
            payload_model=ParsePayload,
        )
    ]


def create_app(config: RuntimeConfig) -> WorkerApp:
    """Build the Nexus-Queue worker for ZP documents (v1, taskiq/Redis)."""
    adapters = ZpDocumentsAdapters.from_config(config)
    return create_worker(config.to_nexus_config(), adapters, _handler_specs())


async def run_worker(
    config: RuntimeConfig,
    *,
    host: str = "0.0.0.0",  # noqa: S104 — a worker pod binds all interfaces by design
    port: int = 8000,
    ensure_topology: bool = True,
) -> None:
    """Standard v2 worker entrypoint for ZP documents (``transport='nats'``)."""
    if config.transport != "nats":
        raise ValueError(
            "run_worker requires transport='nats'; transport='redis' runs via "
            "the taskiq CLI + uvicorn over create_app()"
        )
    adapters = ZpDocumentsAdapters.from_config(config)
    await run_nats_worker(
        config.to_nexus_config(),
        adapters,
        _handler_specs(),
        host=host,
        port=port,
        ensure_topology=ensure_topology,
    )


def main_worker(config: RuntimeConfig, **kwargs: object) -> None:
    """Sync wrapper for console entrypoints: ``main_worker(config)``."""
    asyncio.run(run_worker(config, **kwargs))  # type: ignore[arg-type]
