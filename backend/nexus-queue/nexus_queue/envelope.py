"""The Nexus-Queue envelope: standard labels stamped on every message.

Producers build an :class:`Envelope` and turn it into the ``labels`` dict that
rides on the taskiq message; consumers validate the version on receipt.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from nexus_queue import naming
from nexus_queue.exceptions import NexusPermanentError


@dataclass(slots=True)
class Envelope:
    """Routing/metadata for a single enqueue. Carried in message labels, not args."""

    task: str
    tenant: str = naming.SINGLE_TENANT
    idempotency_key: str | None = None
    trace: str | None = None
    priority: str = "default"

    def to_labels(self) -> dict[str, str]:
        """Render the standard labels. ``nq_enqueued_at`` is stamped now (UTC)."""
        labels: dict[str, str] = {
            naming.LABEL_VERSION: naming.NQ_VERSION,
            naming.LABEL_TASK: self.task,
            naming.LABEL_TENANT: self.tenant,
            naming.LABEL_ENQUEUED_AT: datetime.now(UTC).isoformat(),
            naming.LABEL_PRIORITY: self.priority,
        }
        if self.idempotency_key:
            labels[naming.LABEL_IDEM] = self.idempotency_key
        if self.trace:
            labels[naming.LABEL_TRACE] = self.trace
        return labels


def require_supported_version(labels: Mapping[str, Any]) -> None:
    """Raise :class:`NexusPermanent` (→ DLQ) if the message is a version we
    don't speak. Keeps a future ``nq_v=2`` from being silently mishandled."""
    version = str(labels.get(naming.LABEL_VERSION, ""))
    if version != naming.NQ_VERSION:
        raise NexusPermanentError(
            f"Unsupported nq_v={version!r}; this worker speaks {naming.NQ_VERSION!r}"
        )


def missing_required_labels(labels: Mapping[str, Any]) -> tuple[str, ...]:
    """Return the required labels absent from ``labels`` (empty tuple if valid)."""
    return tuple(key for key in naming.REQUIRED_LABELS if not labels.get(key))
