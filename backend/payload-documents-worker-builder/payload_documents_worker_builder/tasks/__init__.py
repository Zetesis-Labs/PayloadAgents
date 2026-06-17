"""Built-in tasks.

Exposes the LlamaParse parse-document handler and its payload model. The
handler is registered with the broker by ``create_app`` via a
``nexus_queue.HandlerSpec``.
"""

from payload_documents_worker_builder.tasks.parse_document import (
    PARSE_DOCUMENT_TASK_NAME,
    ParsePayload,
    parse_document,
)

__all__ = ["PARSE_DOCUMENT_TASK_NAME", "ParsePayload", "parse_document"]
