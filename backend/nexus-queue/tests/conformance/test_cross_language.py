"""Cross-language round-trip (spec §14.5): the REAL TypeScript producer
(@zetesis/nexus-queue) publishes STRAIGHT TO NATS and the Python worker
consumes it — envelope intact end to end.

This is the wire-contract test proper: it is what catches drift between the
TS client and the Python runtime. The TS client is NATS-only, so these skip on
the Redis transport. Skips (with a clear reason) if node or the built TS dist
are unavailable; CI must build the package first.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import shutil
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
import uvicorn
from nexus_queue import HandlerSpec
from pydantic import BaseModel

from .harness import NATS_URL, Scratch, TransportHarness

REPO_ROOT = Path(__file__).resolve().parents[4]
TS_DIST = REPO_ROOT / "packages" / "nexus-queue" / "dist" / "index.mjs"
MJS = Path(__file__).parent / "ts_roundtrip.mjs"
TRACEPARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"


class EchoPayload(BaseModel):
    id: str


needs_node = pytest.mark.skipif(shutil.which("node") is None, reason="node not on PATH")
needs_dist = pytest.mark.skipif(
    not TS_DIST.exists(),
    reason="TS client not built — run: pnpm --filter @zetesis/nexus-queue build",
)


@contextlib.asynccontextmanager
async def _serving(app: Any) -> AsyncIterator[int]:
    """uvicorn on an ephemeral port; yields the bound port."""
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning"))
    task = asyncio.create_task(server.serve())
    try:
        while not server.started:
            await asyncio.sleep(0.05)
        yield server.servers[0].sockets[0].getsockname()[1]
    finally:
        server.should_exit = True
        await task


async def _run_ts_producer(queue: str) -> str:
    """Drive the real TS client publishing directly to NATS; returns its stdout."""
    proc = await asyncio.create_subprocess_exec(
        "node",
        str(MJS),
        env={
            **os.environ,
            "NEXUS_DIST": str(TS_DIST),
            "NATS_URL": NATS_URL,
            "NQ_PROJECT": "test",
            "NQ_QUEUE": queue,
        },
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
    assert proc.returncode == 0, f"TS producer failed: {stderr.decode()[:500]}"
    assert stdout.decode().strip(), "TS producer must report the task id"
    return stdout.decode()


@needs_node
@needs_dist
async def test_ts_producer_to_python_worker_roundtrip(
    harness: TransportHarness, scratch: Scratch
) -> None:
    if harness.transport != "nats":
        pytest.skip("the TS client publishes to NATS directly; not applicable on redis")
    config = harness.make_config("qx")
    consumed: dict[str, str] = {}

    async def xlang(payload: EchoPayload, deps: Scratch) -> None:
        consumed["id"] = payload.id
        deps.done(payload.id)

    # Worker first, so the consumer (and its stream) exist before the TS enqueue.
    async with harness.running_worker(
        config, scratch, [HandlerSpec("test.xlang", xlang, EchoPayload)]
    ):
        await _run_ts_producer("qx")
        # The Python worker consumes what TypeScript enqueued — payload intact.
        await scratch.wait_done("xl1")
        assert consumed["id"] == "xl1"


@needs_node
@needs_dist
async def test_ts_producer_envelope_on_the_wire(harness: TransportHarness) -> None:
    """Same enqueue, but asserting the raw wire message: the TS client must stamp
    the full envelope for a TS-originated task exactly like the Python producer."""
    if harness.transport != "nats":
        pytest.skip("the TS client publishes to NATS directly; not applicable on redis")
    config = harness.make_config("qy")
    # No worker here — create the stream so the direct publish lands.
    await harness.ensure_topology(config)
    await _run_ts_producer("qy")

    messages = await harness.read_work_messages("test", "qy")
    assert len(messages) == 1
    message = messages[0]
    assert message["task_name"] == "test.xlang"
    assert message["kwargs"] == {"id": "xl1"}
    labels = message["labels"]
    assert labels["nq_v"] == "1"
    assert labels["nq_task"] == "test.xlang"
    assert labels["nq_tenant"] == "t9"
    assert labels["nq_idem"] == "test-xl1"
    assert labels["nq_priority"] == "high"
    assert labels["nq_trace"] == TRACEPARENT
    assert "nq_enqueued_at" in labels
