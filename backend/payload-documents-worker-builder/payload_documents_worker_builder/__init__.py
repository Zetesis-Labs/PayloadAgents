"""Public API for `payload-documents-worker-builder`.

A thin, ZP-flavoured layer over the `nexus-queue` runtime: the LlamaParse
parse-document handler, its Payload adapters, the config, and the clients.
"""

from nexus_queue import WorkerApp

from payload_documents_worker_builder.adapters import PayloadJobState, ZpDocumentsAdapters
from payload_documents_worker_builder.app import create_app
from payload_documents_worker_builder.clients import (
    LlamaParseClient,
    LlamaParseError,
    LlamaParseJob,
    LlamaParseStatus,
    PayloadClient,
    PayloadError,
)
from payload_documents_worker_builder.config import RuntimeConfig
from payload_documents_worker_builder.tasks import (
    PARSE_DOCUMENT_TASK_NAME,
    ParsePayload,
    parse_document,
)

__all__ = [
    "PARSE_DOCUMENT_TASK_NAME",
    "LlamaParseClient",
    "LlamaParseError",
    "LlamaParseJob",
    "LlamaParseStatus",
    "ParsePayload",
    "PayloadClient",
    "PayloadError",
    "PayloadJobState",
    "RuntimeConfig",
    "WorkerApp",
    "ZpDocumentsAdapters",
    "create_app",
    "parse_document",
]

__version__ = "0.1.3"
