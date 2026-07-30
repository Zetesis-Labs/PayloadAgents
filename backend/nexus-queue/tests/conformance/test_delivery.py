"""Delivery semantics (spec §6, §10): idempotent consume, retry with backoff."""

from __future__ import annotations

import asyncio
import time

from nexus_queue import HandlerSpec
from nexus_queue.lifecycle import ClaimOutcome, create_idempotency_store
from pydantic import BaseModel

from .harness import Scratch, TransportHarness


class EchoPayload(BaseModel):
    id: str


async def test_idempotency_store_claims(harness: TransportHarness) -> None:
    store = create_idempotency_store(harness.make_config("q3"))
    await store.startup()
    try:
        # First claim wins; a second, concurrent claim of the same live key is
        # deferred (the holder hasn't finished), not treated as a completion.
        assert await store.claim("test-idem", "_") is ClaimOutcome.CLAIMED
        assert await store.claim("test-idem", "_") is ClaimOutcome.IN_PROGRESS
        # A failed attempt releases the claim so a legitimate retry can re-claim.
        await store.release("test-idem", "_")
        assert await store.claim("test-idem", "_") is ClaimOutcome.CLAIMED
        # Once marked done, a later claim of the same key is a genuine duplicate.
        await store.mark_done("test-idem", "_")
        assert await store.claim("test-idem", "_") is ClaimOutcome.DONE
        # A different tenant is namespaced apart, so it never collides.
        assert await store.claim("test-idem", "other") is ClaimOutcome.CLAIMED
    finally:
        await store.shutdown()


async def test_idempotency_stale_lease_is_taken_over(harness: TransportHarness) -> None:
    """A crashed holder never releases its claim; once the lease expires a later
    delivery must be able to take it over (not be skipped forever)."""
    config = harness.make_config("q3b", idempotency_lease_s=0.3)
    store = create_idempotency_store(config)
    await store.startup()
    try:
        assert await store.claim("stale-idem", "_") is ClaimOutcome.CLAIMED
        # Simulated crash: no refresh, no release. While the lease is live the
        # claim is deferred; once it expires it can be taken over.
        assert await store.claim("stale-idem", "_") is ClaimOutcome.IN_PROGRESS
        await asyncio.sleep(0.5)
        assert await store.claim("stale-idem", "_") is ClaimOutcome.CLAIMED
    finally:
        await store.shutdown()


async def test_roundtrip_and_idempotent_consume(
    harness: TransportHarness, scratch: Scratch
) -> None:
    config = harness.make_config("q5")

    async def echo(payload: EchoPayload, deps: Scratch) -> None:
        deps.incr(f"runs:{payload.id}")
        deps.done(payload.id)

    async with harness.running_worker(
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
    config = harness.make_config("q7")  # max_retries=2

    async def flaky(payload: EchoPayload, deps: Scratch) -> None:
        if deps.incr(f"attempts:{payload.id}") < 2:
            raise RuntimeError("transient")
        deps.done(payload.id)

    async with harness.running_worker(
        config, scratch, [HandlerSpec("test.flaky", flaky, EchoPayload)]
    ) as publisher:
        await publisher.enqueue("test.flaky", EchoPayload(id="fk1"), idempotency_key="test-fk1")
        await scratch.wait_done("fk1")
        assert scratch.count("attempts:fk1") == 2


async def test_retry_waits_for_backoff(harness: TransportHarness, scratch: Scratch) -> None:
    """The redelivery must be deferred by the backoff delay, not eager: the gap
    between the failing attempt and the retry must be at least the base delay."""
    base_delay = 0.5
    config = harness.make_config("q9", max_retries=3, retry_base_delay_s=base_delay)
    stamps: list[float] = []

    async def flaky(payload: EchoPayload, deps: Scratch) -> None:
        stamps.append(time.monotonic())
        if len(stamps) < 2:
            raise RuntimeError("transient")
        deps.done(payload.id)

    async with harness.running_worker(
        config, scratch, [HandlerSpec("test.bk", flaky, EchoPayload)]
    ) as publisher:
        await publisher.enqueue("test.bk", EchoPayload(id="bk1"), idempotency_key="test-bk1")
        await scratch.wait_done("bk1", timeout=12.0)
        assert len(stamps) == 2
        assert stamps[1] - stamps[0] >= base_delay - 0.1
