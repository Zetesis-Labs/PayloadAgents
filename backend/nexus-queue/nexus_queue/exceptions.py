"""Error taxonomy that drives the runtime's retry vs dead-letter decision."""

from __future__ import annotations


class NexusQueueError(Exception):
    """Base class for every error raised by nexus-queue."""


class NexusRetryableError(NexusQueueError):
    """Transient failure — retry until attempts are exhausted, then dead-letter."""


class NexusPermanentError(NexusQueueError):
    """Non-retryable failure — route straight to the DLQ, skip remaining retries."""
