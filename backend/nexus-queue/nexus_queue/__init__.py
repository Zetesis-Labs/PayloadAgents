"""nexus-queue — portable NATS JetStream worker runtime.

Public API: the config, the ports, the envelope, the error taxonomy, and the
JetStream runtime (worker, publisher). Producers publish to NATS directly via
:class:`NatsPublisher` (or the TypeScript client); workers run via
:func:`run_nats_worker`.
"""

from __future__ import annotations

from nexus_queue.app import main_nats_worker, run_nats_worker
from nexus_queue.config import RuntimeConfig
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
from nexus_queue.handlers import HandlerSpec
from nexus_queue.lifecycle import (
    ClaimOutcome,
    IdempotencyStorePort,
    NatsKvIdempotencyStore,
    configure_logging,
    create_idempotency_store,
)
from nexus_queue.naming import (
    NQ_VERSION,
    SINGLE_TENANT,
    dlq_subject,
    work_subject,
)
from nexus_queue.nats_runtime import NatsPublisher, NatsWorker
from nexus_queue.ports import (
    BlobStorePort,
    IndexPort,
    JobStatePort,
    JobStatus,
    StatusEvent,
    StatusEventPort,
)
from nexus_queue.probes import create_probes_app
from nexus_queue.tracing import configure_tracing

__all__ = [
    "NQ_VERSION",
    "SINGLE_TENANT",
    "BlobStorePort",
    "ClaimOutcome",
    "Envelope",
    "HandlerSpec",
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
    "RuntimeConfig",
    "StatusEvent",
    "StatusEventPort",
    "configure_logging",
    "configure_tracing",
    "create_idempotency_store",
    "create_probes_app",
    "dlq_subject",
    "main_nats_worker",
    "missing_required_labels",
    "require_supported_version",
    "run_nats_worker",
    "work_subject",
]
