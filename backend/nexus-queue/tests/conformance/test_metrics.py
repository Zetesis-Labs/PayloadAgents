"""Standard metric names (spec §12): the fleet dashboard/alerts depend on
these exact names existing with (project, queue, task) labels."""

from __future__ import annotations

from nexus_queue import HandlerSpec
from prometheus_client import REGISTRY, generate_latest
from pydantic import BaseModel

from .harness import Scratch, TransportHarness

STANDARD_COUNTERS = (
    "nexus_queue_received_total",
    "nexus_queue_completed_total",
)
STANDARD_HISTOGRAM_COUNT = "nexus_queue_consume_seconds_count"


class EchoPayload(BaseModel):
    id: str


async def test_standard_metric_names_after_consume(
    harness: TransportHarness, scratch: Scratch
) -> None:
    config = harness.make_config("qm")

    async def echo(payload: EchoPayload, deps: Scratch) -> None:
        deps.done(payload.id)

    async with harness.running_worker(
        config, scratch, [HandlerSpec("test.echo", echo, EchoPayload)]
    ) as publisher:
        await publisher.enqueue("test.echo", EchoPayload(id="m1"), idempotency_key="test-m1")
        await scratch.wait_done("m1")

    labels = {"project": "test", "queue": "qm", "task": "test.echo"}
    for name in STANDARD_COUNTERS:
        value = REGISTRY.get_sample_value(name, labels)
        assert value is not None and value >= 1, f"{name}{labels} missing or zero"
    # latency histogram observed at least one consume
    observed = REGISTRY.get_sample_value(STANDARD_HISTOGRAM_COUNT, labels)
    assert observed is not None and observed >= 1

    # failure counter is registered under the standard name (no samples until a
    # failure happens, but the metric family must exist for dashboards/alerts)
    exposition = generate_latest(REGISTRY).decode()
    assert "nexus_queue_failed_total" in exposition
