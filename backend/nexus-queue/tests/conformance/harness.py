"""Transport harness + test doubles for the conformance suite.

``TransportHarness`` is the seam that keeps the suite transport-agnostic:
tests never touch the broker's wire directly, they go through the harness.
Each transport implements config building, a producer context, a live-worker
context and the wire-level reads; the assertions are shared.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
from collections.abc import AsyncIterator, Sequence
from typing import Any, Protocol

import nats
from nexus_queue import (
    HandlerSpec,
    NatsPublisher,
    NatsWorker,
    RuntimeConfig,
)
from nexus_queue.naming import nats_dlq_stream_name, nats_stream_name
from nexus_queue.nats_runtime import ensure_streams
from pydantic import BaseModel

NATS_URL = os.environ.get("NATS_URL", "nats://127.0.0.1:4222")


class PublisherLike(Protocol):
    """What tests need from a producer, satisfied by both transports."""

    async def enqueue(
        self,
        task: str,
        payload: BaseModel,
        *,
        tenant: str = ...,
        idempotency_key: str | None = ...,
        priority: str = ...,
        trace: str | None = ...,
    ) -> str: ...


def make_config(queue: str, **overrides: Any) -> RuntimeConfig:
    """The suite's standard RuntimeConfig: project ``test``, fast retries."""
    params: dict[str, Any] = {
        "app_name": "nexus-queue-conformance",
        "project": "test",
        "queue": queue,
        "nats_url": NATS_URL,
        "max_retries": 2,
        "retry_base_delay_s": 0.2,
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

    def make_config(self, queue: str, **overrides: Any) -> RuntimeConfig: ...

    def publisher(self, config: RuntimeConfig) -> contextlib.AbstractAsyncContextManager[Any]:
        """A producer for the queue, without a worker consuming it."""
        ...

    def running_worker(
        self, config: RuntimeConfig, deps: Any, specs: Sequence[HandlerSpec]
    ) -> contextlib.AbstractAsyncContextManager[Any]:
        """A live worker consuming ``specs`` plus a producer for its queue."""
        ...

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


class NatsHarness:
    """NATS JetStream implementation — the runtime."""

    transport = "nats"

    def __init__(self) -> None:
        self._nc: nats.NATS | None = None

    async def _js(self) -> Any:
        if self._nc is None:
            self._nc = await nats.connect(NATS_URL)
        return self._nc.jetstream()

    def make_config(self, queue: str, **overrides: Any) -> RuntimeConfig:
        return make_config(queue, **overrides)

    async def ensure_topology(self, config: RuntimeConfig) -> None:
        """Create the work/DLQ streams so a direct producer can publish before
        any worker exists (the worker would otherwise create them on startup)."""
        js = await self._js()
        await ensure_streams(js, config)

    @contextlib.asynccontextmanager
    async def publisher(self, config: RuntimeConfig) -> AsyncIterator[NatsPublisher]:
        nc = await nats.connect(NATS_URL)
        js = nc.jetstream()
        await ensure_streams(js, config)
        try:
            yield NatsPublisher(js, config)
        finally:
            await nc.close()

    @contextlib.asynccontextmanager
    async def running_worker(
        self, config: RuntimeConfig, deps: Any, specs: Sequence[HandlerSpec]
    ) -> AsyncIterator[NatsPublisher]:
        worker = NatsWorker(config, deps, list(specs))
        await worker.startup()
        await asyncio.sleep(0.2)
        try:
            yield NatsPublisher(worker.js, config)
        finally:
            await worker.shutdown()

    async def wipe(self) -> None:
        js = await self._js()
        with contextlib.suppress(Exception):
            for info in await js.streams_info():
                name = info.config.name or ""
                if name.startswith("NQ_TEST") or name == "KV_nq-idem-test":
                    await js.delete_stream(name)

    async def close(self) -> None:
        if self._nc is not None:
            await self._nc.close()

    async def read_work_messages(self, project: str, queue: str) -> list[dict[str, Any]]:
        js = await self._js()
        name = nats_stream_name(project, queue)
        try:
            info = await js.stream_info(name)
        except Exception:
            return []
        state = info.state
        messages: list[dict[str, Any]] = []
        for seq in range(state.first_seq, state.last_seq + 1):
            with contextlib.suppress(Exception):
                raw = await js.get_msg(name, seq)
                messages.append(json.loads(raw.data))
        return messages

    async def wait_dlq_record(self, project: str, queue: str, tries: int = 50) -> dict[str, Any]:
        js = await self._js()
        name = nats_dlq_stream_name(project, queue)
        for _ in range(tries):
            with contextlib.suppress(Exception):
                info = await js.stream_info(name)
                if info.state.messages:
                    raw = await js.get_msg(name, info.state.first_seq)
                    record: dict[str, Any] = json.loads(raw.data)
                    return record
            await asyncio.sleep(0.1)
        raise AssertionError(f"DLQ stream {name} stayed empty")

    async def assert_default_stream_unused(self) -> None:
        js = await self._js()
        names: list[str] = []
        with contextlib.suppress(Exception):
            names = [info.config.name or "" for info in await js.streams_info()]
        offenders = [n for n in names if n.lower().startswith("taskiq")]
        assert not offenders, f"default-named streams present: {offenders}"
