"""nexus-queue — portable taskiq + Redis Streams worker runtime.

Public API is intentionally small and stable: the config, the ports, the
envelope, and the error taxonomy. The runtime pieces (broker, middleware,
publisher, kicker) are added on top of these and re-exported as they land.
"""

from __future__ import annotations

from nexus_queue.app import WorkerApp, create_worker, main_nats_worker, run_nats_worker
from nexus_queue.broker import create_broker
from nexus_queue.config import RuntimeConfig
from nexus_queue.delayed import DelayedRetryPoller
from nexus_queue.envelope import (
    Envelope,
    missing_required_labels,
    require_supported_version,
)
from nexus_queue.exceptions import (
    NexusPermanentError,
    NexusQueueError,
    NexusRetryableError,
)
from nexus_queue.handlers import HandlerSpec, register
from nexus_queue.kicker import create_kicker, create_nats_kicker, create_probes_app
from nexus_queue.lifecycle import (
    IdempotencyStore,
    IdempotencyStorePort,
    NatsKvIdempotencyStore,
    configure_logging,
    create_idempotency_store,
    register_lifecycle,
)
from nexus_queue.naming import (
    NQ_VERSION,
    SINGLE_TENANT,
    consumer_group,
    delayed_set,
    dlq_stream,
    dlq_subject,
    status_stream,
    work_stream,
    work_subject,
)
from nexus_queue.nats_runtime import NatsPublisher, NatsWorker
from nexus_queue.pipeline import PipelineRouter
from nexus_queue.ports import (
    BlobStorePort,
    IndexPort,
    JobStatePort,
    JobStatus,
    StatusEvent,
    StatusEventPort,
)
from nexus_queue.publisher import Publisher
from nexus_queue.tracing import configure_tracing

__all__ = [
    "NQ_VERSION",
    "SINGLE_TENANT",
    "BlobStorePort",
    "DelayedRetryPoller",
    "Envelope",
    "HandlerSpec",
    "IdempotencyStore",
    "IdempotencyStorePort",
    "IndexPort",
    "JobStatePort",
    "JobStatus",
    "NatsKvIdempotencyStore",
    "NatsPublisher",
    "NatsWorker",
    "NexusPermanentError",
    "NexusQueueError",
    "NexusRetryableError",
    "PipelineRouter",
    "Publisher",
    "RuntimeConfig",
    "StatusEvent",
    "StatusEventPort",
    "WorkerApp",
    "configure_logging",
    "configure_tracing",
    "consumer_group",
    "create_broker",
    "create_idempotency_store",
    "create_kicker",
    "create_nats_kicker",
    "create_probes_app",
    "create_worker",
    "delayed_set",
    "dlq_stream",
    "dlq_subject",
    "main_nats_worker",
    "missing_required_labels",
    "register",
    "register_lifecycle",
    "require_supported_version",
    "run_nats_worker",
    "status_stream",
    "work_stream",
    "work_subject",
]
