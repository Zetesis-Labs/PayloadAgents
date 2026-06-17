"""Prometheus counters for queue throughput.

Latency is measured in the handler wrapper (it needs an ``around`` scope that
middleware hooks can't give); here we keep the stateless counters.
"""

from __future__ import annotations

from typing import Any

from prometheus_client import Counter, Histogram
from taskiq.abc.middleware import TaskiqMiddleware
from taskiq.message import TaskiqMessage
from taskiq.result import TaskiqResult

from nexus_queue.config import RuntimeConfig
from nexus_queue.naming import LABEL_TASK

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


class MetricsMiddleware(TaskiqMiddleware):
    """Increment throughput counters around execution."""

    def __init__(self, config: RuntimeConfig) -> None:
        super().__init__()
        self._config = config

    def _task(self, message: TaskiqMessage) -> str:
        return str(message.labels.get(LABEL_TASK, message.task_name))

    def pre_execute(self, message: TaskiqMessage) -> TaskiqMessage:
        RECEIVED.labels(self._config.project, self._config.queue, self._task(message)).inc()
        return message

    def post_execute(self, message: TaskiqMessage, result: TaskiqResult[Any]) -> None:
        counter = FAILED if result.is_err else COMPLETED
        counter.labels(self._config.project, self._config.queue, self._task(message)).inc()
