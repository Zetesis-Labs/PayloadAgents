"""Prometheus counters for the NATS receiver's throughput and connectivity.

Stateless module-level counters incremented directly by the receiver loop
(:mod:`nexus_queue.nats_runtime`).
"""

from __future__ import annotations

from prometheus_client import Counter, Histogram

_LABELNAMES = ("project", "queue", "task")

RECEIVED = Counter(
    "nexus_queue_received_total",
    "Messages pulled from the stream for execution.",
    _LABELNAMES,
)
COMPLETED = Counter(
    "nexus_queue_completed_total",
    "Messages whose handler returned successfully.",
    _LABELNAMES,
)
FAILED = Counter(
    "nexus_queue_failed_total",
    "Messages whose handler raised (before retry/DLQ resolution).",
    _LABELNAMES,
)
CONSUME_SECONDS = Histogram(
    "nexus_queue_consume_seconds",
    "Handler execution wall-time (measured in the handler wrapper).",
    _LABELNAMES,
)

# Broker-connectivity signals for the NATS receiver. D3 keeps connectivity out
# of the liveness/readiness probes (a broker blip must not kill pods) and makes
# it a metric + alert instead — these are that metric.
_CONN_LABELNAMES = ("project", "queue")

FETCH_ERRORS = Counter(
    "nexus_queue_fetch_errors_total",
    "Pull-fetch failures in the NATS receiver loop (broker connectivity).",
    _CONN_LABELNAMES,
)
NATS_DISCONNECTS = Counter(
    "nexus_queue_nats_disconnects_total",
    "NATS connection disconnect events observed by the worker.",
    _CONN_LABELNAMES,
)
