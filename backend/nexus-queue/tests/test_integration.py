"""Integration tests for the nexus-queue runtime against a real Redis.

Run: uv run pytest nexus-queue/tests -v
Requires REDIS_URL (defaults to redis://redis:6379 in the devcontainer).
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import pytest
import redis.asyncio as aioredis
from fastapi.testclient import TestClient
from nexus_queue import (
    HandlerSpec,
    NexusPermanentError,
    Publisher,
    RuntimeConfig,
    create_broker,
    create_kicker,
    create_worker,
)
from nexus_queue.lifecycle import IdempotencyStore
from nexus_queue.naming import dlq_stream, work_stream
from pydantic import BaseModel, SecretStr
from taskiq.api import run_receiver_task

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379")
SECRET = "test-secret"


class EchoPayload(BaseModel):
    id: str


@dataclass
class _Deps:
    redis: aioredis.Redis


def _config(queue: str) -> RuntimeConfig:
    return RuntimeConfig(
        app_name="nexus-queue-test",
        project="test",
        queue=queue,
        redis_url=REDIS_URL,
        internal_secret=SecretStr(SECRET),
        max_retries=2,
    )


async def _wipe(client: aioredis.Redis) -> None:
    async for key in client.scan_iter("nq:test*"):
        await client.delete(key)
    async for key in client.scan_iter("nq:idem:test-*"):
        await client.delete(key)


@pytest.fixture
async def redis_client() -> AsyncIterator[aioredis.Redis]:
    client: aioredis.Redis = aioredis.from_url(REDIS_URL)
    await _wipe(client)
    yield client
    await _wipe(client)
    await client.aclose()


async def _read_one(client: aioredis.Redis, stream: str) -> dict[str, Any]:
    entries = await client.xrange(stream)
    assert len(entries) == 1, f"expected 1 entry in {stream}, got {len(entries)}"
    result: dict[str, Any] = json.loads(entries[0][1][b"data"])
    return result


async def _wait_for_key(client: aioredis.Redis, key: str, tries: int = 50) -> None:
    for _ in range(tries):
        if await client.get(key):
            return
        await asyncio.sleep(0.1)
    raise AssertionError(f"key {key} never appeared")


async def _wait_for_stream(client: aioredis.Redis, stream: str, tries: int = 50) -> dict[str, Any]:
    for _ in range(tries):
        entries = await client.xrange(stream)
        if entries:
            payload: dict[str, Any] = json.loads(entries[0][1][b"data"])
            return payload
        await asyncio.sleep(0.1)
    raise AssertionError(f"stream {stream} stayed empty")


async def test_publisher_stamps_envelope(redis_client: aioredis.Redis) -> None:
    config = _config("q1")
    broker = create_broker(config)
    await broker.startup()
    try:
        await Publisher(broker, config).enqueue(
            "test.echo", EchoPayload(id="abc"), tenant="t1", idempotency_key="test-k1"
        )
        message = await _read_one(redis_client, work_stream("test", "q1"))
        assert message["task_name"] == "test.echo"
        assert message["kwargs"] == {"id": "abc"}
        labels = message["labels"]
        assert labels["nq_v"] == "1"
        assert labels["nq_task"] == "test.echo"
        assert labels["nq_tenant"] == "t1"
        assert labels["nq_idem"] == "test-k1"
        assert "nq_enqueued_at" in labels
    finally:
        await broker.shutdown()


def test_kicker_auth_and_enqueue() -> None:
    import redis as redis_sync

    config = _config("q2")
    broker = create_broker(config)
    app = create_kicker(broker, config)
    sync = redis_sync.from_url(REDIS_URL)
    sync.delete(work_stream("test", "q2"))
    with TestClient(app) as client:
        denied = client.post("/enqueue/test.echo", json={"payload": {"id": "x"}})
        assert denied.status_code == 403
        ok = client.post(
            "/enqueue/test.echo",
            json={"payload": {"id": "x"}, "idempotency_key": "test-k2"},
            headers={"X-Nexus-Secret": SECRET},
        )
        assert ok.status_code == 202
        assert ok.json()["task"] == "test.echo"
    entries = sync.xrange(work_stream("test", "q2"))
    assert len(entries) == 1
    sync.close()


async def test_idempotency_store(redis_client: aioredis.Redis) -> None:
    store = IdempotencyStore(_config("q3"))
    await store.startup()
    try:
        assert await store.claim("test-idem") is True
        assert await store.claim("test-idem") is False
    finally:
        await store.shutdown()


async def test_roundtrip_and_idempotent_consume(redis_client: aioredis.Redis) -> None:
    config = _config("q5")

    async def echo(payload: EchoPayload, deps: _Deps) -> None:
        await deps.redis.incr(f"nq:test:runs:{payload.id}")
        await deps.redis.set(f"nq:test:done:{payload.id}", "1")

    worker = create_worker(
        config, _Deps(redis=redis_client), [HandlerSpec("test.echo", echo, EchoPayload)]
    )
    client_broker = create_broker(config)
    await client_broker.startup()
    receiver = asyncio.create_task(run_receiver_task(worker.broker, run_startup=True))
    try:
        await asyncio.sleep(0.5)  # let the consumer group form + start listening
        publisher = Publisher(client_broker, config)
        await publisher.enqueue("test.echo", EchoPayload(id="rt1"), idempotency_key="test-rt1")
        await _wait_for_key(redis_client, "nq:test:done:rt1")
        # second enqueue, same idempotency key -> handler must be skipped
        await publisher.enqueue("test.echo", EchoPayload(id="rt1"), idempotency_key="test-rt1")
        await asyncio.sleep(0.8)
        assert await redis_client.get("nq:test:runs:rt1") == b"1"
    finally:
        receiver.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await receiver
        await client_broker.shutdown()
        await worker.broker.shutdown()


async def test_permanent_error_dead_letters(redis_client: aioredis.Redis) -> None:
    config = _config("q6")

    async def boom(payload: EchoPayload, deps: object) -> None:
        raise NexusPermanentError("nope")

    worker = create_worker(config, object(), [HandlerSpec("test.boom", boom, EchoPayload)])
    client_broker = create_broker(config)
    await client_broker.startup()
    receiver = asyncio.create_task(run_receiver_task(worker.broker, run_startup=True))
    try:
        await asyncio.sleep(0.5)
        await Publisher(client_broker, config).enqueue(
            "test.boom", EchoPayload(id="b1"), idempotency_key="test-b1"
        )
        record = await _wait_for_stream(redis_client, dlq_stream("test", "q6"))
        assert record["permanent"] is True
        assert record["task_name"] == "test.boom"
    finally:
        receiver.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await receiver
        await client_broker.shutdown()
        await worker.broker.shutdown()
