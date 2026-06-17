"""Delayed-retry queue: hold a failed message until its backoff elapses, then
re-enqueue it.

Redis Streams deliver immediately, so a backed-off retry can't ride the work
stream. :class:`~nexus_queue.middleware.retry_dlq.RetryDlqMiddleware` parks the
message in a sorted set scored by its due time; the :class:`DelayedRetryPoller`
(started by the worker lifecycle) drains due messages back onto the broker. The
atomic ``ZREM`` makes the move safe across worker replicas — only the one that
removes a member re-enqueues it.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import time
from typing import Any

import redis.asyncio as aioredis
import structlog
from taskiq import AsyncBroker
from taskiq.kicker import AsyncKicker
from taskiq.message import TaskiqMessage

from nexus_queue.config import RuntimeConfig

logger = structlog.get_logger("nexus_queue.delayed")


def pack_retry(message: TaskiqMessage, labels: dict[str, Any]) -> str:
    """Serialize a message (with its updated labels) for the delayed-retry set."""
    return json.dumps(
        {
            "task_name": message.task_name,
            "task_id": message.task_id,
            "labels": labels,
            "args": message.args,
            "kwargs": message.kwargs,
        }
    )


class DelayedRetryPoller:
    """Moves due retries from the delayed sorted set back onto the broker."""

    def __init__(self, broker: AsyncBroker, config: RuntimeConfig) -> None:
        self._broker = broker
        self._config = config
        self._redis: aioredis.Redis | None = None
        self._task: asyncio.Task[None] | None = None

    async def startup(self) -> None:
        self._redis = aioredis.from_url(self._config.redis_url)
        self._task = asyncio.create_task(self._run())

    async def shutdown(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        if self._redis is not None:
            await self._redis.aclose()

    async def _run(self) -> None:
        while True:
            try:
                await self._drain_due()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("delayed-poll-failed")
            await asyncio.sleep(self._config.retry_poll_interval_s)

    async def _drain_due(self) -> None:
        if self._redis is None:
            return
        due = await self._redis.zrangebyscore(self._config.delayed_set, "-inf", time.time())
        for record in due:
            # Atomic claim: only the replica that removes the member re-enqueues it.
            if await self._redis.zrem(self._config.delayed_set, record) == 1:
                await self._reenqueue(json.loads(record))

    async def _reenqueue(self, data: dict[str, Any]) -> None:
        kicker: AsyncKicker[Any, Any] = AsyncKicker(
            task_name=data["task_name"],
            broker=self._broker,
            labels=data["labels"],
        ).with_task_id(data["task_id"])
        await kicker.kiq(*data["args"], **data["kwargs"])
        logger.info("retry-reenqueued", task=data["task_name"])
