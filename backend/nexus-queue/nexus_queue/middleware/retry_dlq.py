"""Retry + dead-letter middleware.

Unifies retry and DLQ in one place so the two decisions stay consistent:

* transient error and attempts remain → park the message in the delayed-retry
  sorted set scored by its due time (``now + exponential backoff``). Redis
  Streams deliver immediately, so the backoff can't ride the work stream; the
  :class:`~nexus_queue.delayed.DelayedRetryPoller` moves the message back onto
  the broker once its delay elapses.
* attempts exhausted, or a :class:`NexusPermanentError` → ``XADD`` to the
  ``nq:{project}:{queue}:dlq`` stream with failure metadata, instead of the
  silent ack-and-drop that both reference projects do today.
"""

from __future__ import annotations

import json
import random
import time
from datetime import UTC, datetime
from typing import Any

import redis.asyncio as aioredis
import structlog
from taskiq.abc.middleware import TaskiqMiddleware
from taskiq.exceptions import NoResultError
from taskiq.message import TaskiqMessage
from taskiq.result import TaskiqResult

from nexus_queue.config import RuntimeConfig
from nexus_queue.delayed import pack_retry
from nexus_queue.exceptions import NexusPermanentError

logger = structlog.get_logger("nexus_queue.retry_dlq")

# SystemRandom keeps ruff's bandit check (S311) happy without a noqa: jitter is
# not security-sensitive, but a CSPRNG is a fine source for it.
_jitter = random.SystemRandom()

_MAX_BACKOFF_S = 60.0


class RetryDlqMiddleware(TaskiqMiddleware):
    """Re-enqueue transient failures with backoff; dead-letter the rest."""

    def __init__(self, config: RuntimeConfig) -> None:
        super().__init__()
        self._config = config
        self._redis: aioredis.Redis | None = None

    async def startup(self) -> None:
        if self._config.redis_url is None:  # unreachable: the config validator enforces it
            raise RuntimeError("the retry/DLQ middleware requires redis_url")
        self._redis = aioredis.from_url(self._config.redis_url)

    async def shutdown(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()

    def _backoff_delay(self, attempt: int) -> float:
        base = self._config.retry_base_delay_s * (2.0 ** max(attempt - 1, 0))
        return min(base, _MAX_BACKOFF_S) + _jitter.random()

    async def on_error(
        self,
        message: TaskiqMessage,
        result: TaskiqResult[Any],
        exception: BaseException,
    ) -> None:
        if isinstance(exception, NoResultError):
            return

        permanent = isinstance(exception, NexusPermanentError)
        attempt = int(message.labels.get("_retries", 0)) + 1
        max_retries = int(message.labels.get("max_retries", self._config.max_retries))

        if not permanent and attempt < max_retries:
            delay = self._backoff_delay(attempt)
            labels = {**message.labels, "_retries": attempt}
            record = pack_retry(message, labels)
            if self._redis is not None:
                await self._redis.zadd(self._config.delayed_set, {record: time.time() + delay})
            result.error = NoResultError()
            logger.info(
                "retry-scheduled",
                task=message.task_name,
                attempt=attempt,
                max_retries=max_retries,
                delay_s=round(delay, 2),
            )
            return

        await self._dead_letter(message, exception, attempts=attempt, permanent=permanent)

    async def _dead_letter(
        self,
        message: TaskiqMessage,
        exception: BaseException,
        *,
        attempts: int,
        permanent: bool,
    ) -> None:
        record: dict[str, Any] = {
            "task_id": message.task_id,
            "task_name": message.task_name,
            "labels": message.labels,
            "args": message.args,
            "kwargs": message.kwargs,
            "error": repr(exception),
            "permanent": permanent,
            "attempts": attempts,
            "failed_at": datetime.now(UTC).isoformat(),
        }
        if self._redis is not None:
            await self._redis.xadd(
                self._config.dlq_stream,
                {"data": json.dumps(record, default=str)},
                maxlen=self._config.dlq_maxlen or None,
                approximate=True,
            )
        logger.warning(
            "dead-letter",
            task=message.task_name,
            stream=self._config.dlq_stream,
            permanent=permanent,
            attempts=attempts,
        )
