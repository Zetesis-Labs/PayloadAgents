from __future__ import annotations

from collections.abc import AsyncIterator

import pytest

from .harness import RedisHarness, Scratch, TransportHarness

# "nats" joins this list with the v2 runtime (migration plan, phase M3).
TRANSPORTS = ["redis"]


@pytest.fixture(params=TRANSPORTS)
async def harness(request: pytest.FixtureRequest) -> AsyncIterator[TransportHarness]:
    if request.param == "redis":
        instance: TransportHarness = RedisHarness()
    else:  # pragma: no cover - guard for future transports
        raise ValueError(f"unknown transport {request.param!r}")
    await instance.wipe()
    yield instance
    await instance.wipe()
    await instance.close()


@pytest.fixture
def scratch() -> Scratch:
    return Scratch()
