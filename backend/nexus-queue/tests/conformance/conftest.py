from __future__ import annotations

from collections.abc import AsyncIterator

import pytest

from .harness import NatsHarness, RedisHarness, Scratch, TransportHarness

# (transport, idempotency_backend) — the claims store is a second conformance
# dimension (D15): the same asserts must hold on Redis SET NX EX and on
# JetStream KV create. transport='redis' with a KV store is not a supported
# combination (zero-Redis only makes sense on the NATS transport).
MATRIX = [
    ("redis", "redis"),
    ("nats", "redis"),
    ("nats", "nats-kv"),
]


@pytest.fixture(params=MATRIX, ids=["redis", "nats", "nats+kv"])
async def harness(request: pytest.FixtureRequest) -> AsyncIterator[TransportHarness]:
    transport, store = request.param
    instance: TransportHarness
    if transport == "redis":
        instance = RedisHarness()
    elif transport == "nats":
        instance = NatsHarness(idempotency_backend=store)
    else:  # pragma: no cover - guard for future transports
        raise ValueError(f"unknown transport {transport!r}")
    await instance.wipe()
    yield instance
    await instance.wipe()
    await instance.close()


@pytest.fixture
def scratch() -> Scratch:
    return Scratch()
