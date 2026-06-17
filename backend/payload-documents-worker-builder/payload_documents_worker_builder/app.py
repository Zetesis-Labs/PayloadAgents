"""Top-level factory.

``create_app(config)`` returns a ``WorkerApp`` (``app, broker = create_app(config)``).
The broker + retry/DLQ/idempotency/tracing/kicker all come from ``nexus-queue``;
this package only contributes the ZP adapters and the parse-document handler.
"""

from __future__ import annotations

from nexus_queue import HandlerSpec, WorkerApp, create_worker

from payload_documents_worker_builder.adapters import ZpDocumentsAdapters
from payload_documents_worker_builder.config import RuntimeConfig
from payload_documents_worker_builder.tasks.parse_document import (
    PARSE_DOCUMENT_TASK_NAME,
    ParsePayload,
    parse_document,
)


def create_app(config: RuntimeConfig) -> WorkerApp:
    """Build the Nexus-Queue worker for ZP documents."""
    adapters = ZpDocumentsAdapters.from_config(config)
    return create_worker(
        config.to_nexus_config(),
        adapters,
        [
            HandlerSpec(
                task_name=PARSE_DOCUMENT_TASK_NAME,
                handler=parse_document,
                payload_model=ParsePayload,
            )
        ],
    )
