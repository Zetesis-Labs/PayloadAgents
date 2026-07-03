"""Transport harness + test doubles for the conformance suite.

``TransportHarness`` is the seam that keeps the suite transport-agnostic:
tests never touch the broker's wire directly, they go through the harness.
Adding a transport (NATS JetStream in M3) means adding a harness class and
one entry to the ``harness`` fixture params — the assertions don't change.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
from collections.abc import AsyncIterator, Sequence
from typing import Any, Protocol

import redis.asyncio as aioredis
from nexus_queue import HandlerSpec, Publisher, RuntimeConfig, create_broker, create_worker
from nexus_queue.naming import dlq_stream, work_stream
from pydantic import SecretStr
from taskiq.api import run_receiver_task

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379")
SECRET = "test-secret"
DEFAULT_TASKIQ_STREAM = "taskiq"


def make_config(queue: str, **overrides: Any) -> RuntimeConfig:
    """The suite's standard RuntimeConfig: project ``test``, fast retries."""
    params: dict[str, Any] = {
        "app_name": "nexus-queue-conformance",
        "project": "test",
        "queue": queue,
        "redis_url": REDIS_URL,
        "internal_secret": SecretStr(SECRET),
        "max_retries": 2,
        "retry_base_delay_s": 0.2,
        "retry_poll_interval_s": 0.05,
    }
    params.update(overrides)
    return RuntimeConfig(**params)


class Scratch:
    """In-memory stand-in for a project's adapters.

    Keeps test-side state (counters, completion events) out of the transport
    under test, so handlers look the same no matter the broker.
    """

    def __init__(self) -> None:
        self._counts: dict[str, int] = {}
        self._events: dict[str, asyncio.Event] = {}

    def incr(self, key: str) -> int:
        self._counts[key] = self._counts.get(key, 0) + 1
        return self._counts[key]

    def count(self, key: str) -> int:
        return self._counts.get(key, 0)

    def done(self, key: str) -> None:
        self._events.setdefault(key, asyncio.Event()).set()

    async def wait_done(self, key: str, timeout: float = 8.0) -> None:
        event = self._events.setdefault(key, asyncio.Event())
        await asyncio.wait_for(event.wait(), timeout)


class TransportHarness(Protocol):
    """What the suite needs from a transport to verify conformance."""

    transport: str

    async def wipe(self) -> None: ...

    async def close(self) -> None: ...

    async def read_work_messages(self, project: str, queue: str) -> list[dict[str, Any]]:
        """Decoded wire messages sitting on the work queue (envelope shape)."""
        ...

    async def wait_dlq_record(self, project: str, queue: str, tries: int = 50) -> dict[str, Any]:
        """Block until a dead-letter record appears; return it decoded."""
        ...

    async def assert_default_stream_unused(self) -> None:
        """The standard prohibits the transport's default/global queue name."""
        ...


class RedisHarness:
    """Redis Streams implementation of the harness (the v1 transport)."""

    transport = "redis"

    def __init__(self) -> None:
        self._client: aioredis.Redis = aioredis.from_url(REDIS_URL)

    async def wipe(self) -> None:
        async for key in self._client.scan_iter("nq:test*"):
            await self._client.delete(key)
        async for key in self._client.scan_iter("nq:idem:test-*"):
            await self._client.delete(key)
        await self._client.delete(DEFAULT_TASKIQ_STREAM)

    async def close(self) -> None:
        await self._client.aclose()

    async def read_work_messages(self, project: str, queue: str) -> list[dict[str, Any]]:
        entries = await self._client.xrange(work_stream(project, queue))
        return [json.loads(fields[b"data"]) for _, fields in entries]

    async def wait_dlq_record(self, project: str, queue: str, tries: int = 50) -> dict[str, Any]:
        stream = dlq_stream(project, queue)
        for _ in range(tries):
            entries = await self._client.xrange(stream)
            if entries:
                record: dict[str, Any] = json.loads(entries[0][1][b"data"])
                return record
            await asyncio.sleep(0.1)
        raise AssertionError(f"DLQ {stream} stayed empty")

    async def assert_default_stream_unused(self) -> None:
        assert await self._client.xlen(DEFAULT_TASKIQ_STREAM) == 0, (
            "a message landed on the default 'taskiq' stream — naming contract broken"
        )


@contextlib.asynccontextmanager
async def running_worker(
    config: RuntimeConfig, deps: Any, specs: Sequence[HandlerSpec]
) -> AsyncIterator[Publisher]:
    """A live worker consuming ``specs`` plus a Publisher pointed at its queue.

    Uses the current (taskiq) runtime API; when the v2 runtime lands (M3) the
    NATS path swaps the internals here without touching the tests.
    """
    worker = create_worker(config, deps, list(specs))
    client_broker = create_broker(config)
    await client_broker.startup()
    receiver = asyncio.create_task(run_receiver_task(worker.broker, run_startup=True))
    await asyncio.sleep(0.5)  # let the consumer group form + start listening
    try:
        yield Publisher(client_broker, config)
    finally:
        receiver.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await receiver
        await client_broker.shutdown()
        await worker.broker.shutdown()
