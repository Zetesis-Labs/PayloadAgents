"""Dead-letter semantics (spec §7.5): exhaustion and permanent errors land in
the DLQ with full failure metadata — never an ack-and-drop."""

from __future__ import annotations

from nexus_queue import HandlerSpec, NexusPermanentError
from pydantic import BaseModel

from .harness import Scratch, TransportHarness


class EchoPayload(BaseModel):
    id: str


async def test_transient_failure_exhausts_to_dlq(
    harness: TransportHarness, scratch: Scratch
) -> None:
    """A transient error that never recovers must exhaust max_retries and land
    in the DLQ (permanent=False), not loop forever nor get ack-and-dropped."""
    config = harness.make_config("q8")  # max_retries=2

    async def always_fails(payload: EchoPayload, deps: Scratch) -> None:
        deps.incr(f"tries:{payload.id}")
        raise RuntimeError("still broken")

    async with harness.running_worker(
        config, scratch, [HandlerSpec("test.fail", always_fails, EchoPayload)]
    ) as publisher:
        await publisher.enqueue("test.fail", EchoPayload(id="x1"), idempotency_key="test-x1")
        record = await harness.wait_dlq_record("test", "q8")
        assert record["permanent"] is False
        assert record["task_name"] == "test.fail"
        assert int(record["attempts"]) == config.max_retries
        assert record["error"], "the DLQ record must carry the failure"
        assert scratch.count("tries:x1") == config.max_retries


async def test_permanent_error_dead_letters_without_retry(
    harness: TransportHarness, scratch: Scratch
) -> None:
    config = harness.make_config("q6")

    async def boom(payload: EchoPayload, deps: Scratch) -> None:
        deps.incr(f"tries:{payload.id}")
        raise NexusPermanentError("nope")

    async with harness.running_worker(
        config, scratch, [HandlerSpec("test.boom", boom, EchoPayload)]
    ) as publisher:
        await publisher.enqueue("test.boom", EchoPayload(id="b1"), idempotency_key="test-b1")
        record = await harness.wait_dlq_record("test", "q6")
        assert record["permanent"] is True
        assert record["task_name"] == "test.boom"
        # permanent -> straight to DLQ without burning the retry budget
        assert scratch.count("tries:b1") == 1
