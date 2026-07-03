"""Delivery semantics (spec §6, §10): idempotent consume, retry with backoff."""

from __future__ import annotations

import asyncio
import time

from nexus_queue import HandlerSpec
from nexus_queue.lifecycle import IdempotencyStore
from pydantic import BaseModel

from .harness import Scratch, TransportHarness, make_config, running_worker


class EchoPayload(BaseModel):
    id: str


async def test_idempotency_store_claims(harness: TransportHarness) -> None:
    store = IdempotencyStore(make_config("q3"))
    await store.startup()
    try:
        # First claim wins; a concurrent re-delivery of the same key is skipped.
        assert await store.claim("test-idem", "_") is True
        assert await store.claim("test-idem", "_") is False
        # A failed attempt releases the claim so a legitimate retry can re-claim.
        await store.release("test-idem", "_")
        assert await store.claim("test-idem", "_") is True
        # A different tenant is namespaced apart, so it never collides.
        assert await store.claim("test-idem", "other") is True
    finally:
        await store.shutdown()


async def test_roundtrip_and_idempotent_consume(
    harness: TransportHarness, scratch: Scratch
) -> None:
    config = make_config("q5")

    async def echo(payload: EchoPayload, deps: Scratch) -> None:
        deps.incr(f"runs:{payload.id}")
        deps.done(payload.id)

    async with running_worker(
        config, scratch, [HandlerSpec("test.echo", echo, EchoPayload)]
    ) as publisher:
        await publisher.enqueue("test.echo", EchoPayload(id="rt1"), idempotency_key="test-rt1")
        await scratch.wait_done("rt1")
        # second enqueue, same idempotency key -> handler must be skipped
        await publisher.enqueue("test.echo", EchoPayload(id="rt1"), idempotency_key="test-rt1")
        await asyncio.sleep(0.8)
        assert scratch.count("runs:rt1") == 1


async def test_transient_failure_retries_with_idempotency_key(
    harness: TransportHarness, scratch: Scratch
) -> None:
    """A transient failure must not let the idempotency key suppress the retry:
    the redelivered message carries the same nq_idem, so dedup that claimed the
    key up front would skip the retry and silently drop the job."""
    config = make_config("q7")  # max_retries=2

    async def flaky(payload: EchoPayload, deps: Scratch) -> None:
        if deps.incr(f"attempts:{payload.id}") < 2:
            raise RuntimeError("transient")
        deps.done(payload.id)

    async with running_worker(
        config, scratch, [HandlerSpec("test.flaky", flaky, EchoPayload)]
    ) as publisher:
        await publisher.enqueue("test.flaky", EchoPayload(id="fk1"), idempotency_key="test-fk1")
        await scratch.wait_done("fk1")
        assert scratch.count("attempts:fk1") == 2


async def test_retry_waits_for_backoff(harness: TransportHarness, scratch: Scratch) -> None:
    """The redelivery must be deferred by the backoff delay, not eager: the gap
    between the failing attempt and the retry must be at least the base delay."""
    base_delay = 0.5
    config = make_config("q9", max_retries=3, retry_base_delay_s=base_delay)
    stamps: list[float] = []

    async def flaky(payload: EchoPayload, deps: Scratch) -> None:
        stamps.append(time.monotonic())
        if len(stamps) < 2:
            raise RuntimeError("transient")
        deps.done(payload.id)

    async with running_worker(
        config, scratch, [HandlerSpec("test.bk", flaky, EchoPayload)]
    ) as publisher:
        await publisher.enqueue("test.bk", EchoPayload(id="bk1"), idempotency_key="test-bk1")
        await scratch.wait_done("bk1", timeout=12.0)
        assert len(stamps) == 2
        assert stamps[1] - stamps[0] >= base_delay - 0.1
