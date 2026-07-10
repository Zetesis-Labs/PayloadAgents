from __future__ import annotations

from collections.abc import AsyncIterator

import pytest

from .harness import NatsHarness, Scratch, TransportHarness


@pytest.fixture
async def harness() -> AsyncIterator[TransportHarness]:
    instance: TransportHarness = NatsHarness()
    await instance.wipe()
    yield instance
    await instance.wipe()
    await instance.close()


@pytest.fixture
def scratch() -> Scratch:
    return Scratch()
