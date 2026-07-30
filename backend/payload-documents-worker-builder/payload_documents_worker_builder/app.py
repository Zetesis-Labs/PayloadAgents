"""Top-level worker factory.

``run_worker(config)`` / ``main_worker(config)`` — the standard single-process
JetStream entrypoint: receiver + probes/metrics HTTP, SIGTERM drains gracefully.

The runtime (retry/DLQ, KV idempotency, tracing, probes) all comes from
``nexus-queue``; this package only contributes the ZP adapters and the
parse-document handler.
"""

from __future__ import annotations

import asyncio

from nexus_queue import HandlerSpec, run_nats_worker

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


async def run_worker(
    config: RuntimeConfig,
    *,
    host: str = "0.0.0.0",  # noqa: S104 — a worker pod binds all interfaces by design
    port: int = 8000,
    ensure_topology: bool = True,
) -> None:
    """Standard worker entrypoint for ZP documents.

    The web publishes parse jobs to NATS directly (via ``@zetesis/nexus-queue``),
    so the worker's HTTP surface is probes and metrics only.
    """
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
