from __future__ import annotations

from collections.abc import AsyncIterator

import pytest

from .harness import NatsHarness, RedisHarness, Scratch, TransportHarness

TRANSPORTS = ["redis", "nats"]


@pytest.fixture(params=TRANSPORTS)
async def harness(request: pytest.FixtureRequest) -> AsyncIterator[TransportHarness]:
    instance: TransportHarness
    if request.param == "redis":
        instance = RedisHarness()
    elif request.param == "nats":
        instance = NatsHarness()
    else:  # pragma: no cover - guard for future transports
        raise ValueError(f"unknown transport {request.param!r}")
    await instance.wipe()
    yield instance
    await instance.wipe()
    await instance.close()


@pytest.fixture
def scratch() -> Scratch:
    return Scratch()
