"""Wire contract (spec §4): naming, envelope labels, typed payload."""

from __future__ import annotations

from nexus_queue.naming import REQUIRED_LABELS
from pydantic import BaseModel

from .harness import TransportHarness

TRACEPARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"


class EchoPayload(BaseModel):
    id: str


async def test_publisher_stamps_envelope(harness: TransportHarness) -> None:
    config = harness.make_config("q1")
    async with harness.publisher(config) as publisher:
        await publisher.enqueue(
            "test.echo",
            EchoPayload(id="abc"),
            tenant="t1",
            idempotency_key="test-k1",
            priority="high",
            trace=TRACEPARENT,
        )
        messages = await harness.read_work_messages("test", "q1")
        assert len(messages) == 1
        message = messages[0]
        # typed payload travels in kwargs; routing/meta travels in labels
        assert message["task_name"] == "test.echo"
        assert message["kwargs"] == {"id": "abc"}
        labels = message["labels"]
        assert labels["nq_v"] == "1"
        assert labels["nq_task"] == "test.echo"
        assert labels["nq_tenant"] == "t1"
        assert labels["nq_idem"] == "test-k1"
        assert labels["nq_priority"] == "high"
        assert labels["nq_trace"] == TRACEPARENT
        assert "nq_enqueued_at" in labels
        missing = [key for key in REQUIRED_LABELS if not labels.get(key)]
        assert not missing, f"required labels missing from the wire: {missing}"


async def test_default_stream_never_used(harness: TransportHarness) -> None:
    """Spec §4.2: the transport's default/global queue name is prohibited."""
    config = harness.make_config("q1")
    async with harness.publisher(config) as publisher:
        await publisher.enqueue("test.echo", EchoPayload(id="ns1"), idempotency_key="test-ns1")
        assert len(await harness.read_work_messages("test", "q1")) == 1
        await harness.assert_default_stream_unused()
