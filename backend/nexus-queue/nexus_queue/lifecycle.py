"""Worker lifecycle: logging, dependency injection, and the idempotency store.

``register_lifecycle`` wires the project's adapters and a Redis-backed
idempotency store into the worker ``state`` on startup, where the handler
wrapper (see :mod:`nexus_queue.handlers`) reads them.
"""

from __future__ import annotations

import logging

import redis.asyncio as aioredis
import structlog
from taskiq import AsyncBroker, TaskiqEvents, TaskiqState

from nexus_queue.config import RuntimeConfig
from nexus_queue.naming import idempotency_redis_key


class IdempotencyStore:
    """Redis ``SET NX`` dedup keyed by the message's ``nq_idem`` label."""

    def __init__(self, config: RuntimeConfig) -> None:
        self._config = config
        self._redis: aioredis.Redis | None = None

    async def startup(self) -> None:
        self._redis = aioredis.from_url(self._config.redis_url)

    async def shutdown(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()

    async def claim(self, idem: str) -> bool:
        """Return True if this is the first time we see ``idem`` (proceed),
        False if it was already claimed within the TTL (skip as duplicate)."""
        if self._config.idempotency_ttl_s <= 0 or self._redis is None:
            return True
        claimed = await self._redis.set(
            idempotency_redis_key(idem),
            "1",
            nx=True,
            ex=self._config.idempotency_ttl_s,
        )
        return bool(claimed)


def configure_logging(config: RuntimeConfig) -> None:
    """Idempotent structlog setup so taskiq + FastAPI share one JSON sink."""
    level = getattr(logging, config.log_level.upper(), logging.INFO)
    logging.basicConfig(level=level, format="%(message)s")
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        cache_logger_on_first_use=True,
    )


def register_lifecycle(
    broker: AsyncBroker,
    config: RuntimeConfig,
    adapters: object,
) -> None:
    """Register startup/shutdown hooks that expose config, adapters and the
    idempotency store on the worker ``state``.

    ``adapters`` is whatever container the project chooses — the runtime only
    stashes it on ``state`` for the handler wrapper to hand back as ``deps``.
    The package contributes the *ports* (see :mod:`nexus_queue.ports`); the
    *container* is the project's, so a handler can depend on exactly the ports
    it needs."""

    @broker.on_event(TaskiqEvents.WORKER_STARTUP)
    async def _startup(state: TaskiqState) -> None:  # pyright: ignore[reportUnusedFunction]
        state.nexus_config = config
        state.nexus_adapters = adapters
        store = IdempotencyStore(config)
        await store.startup()
        state.nexus_idempotency = store

    @broker.on_event(TaskiqEvents.WORKER_SHUTDOWN)
    async def _shutdown(state: TaskiqState) -> None:  # pyright: ignore[reportUnusedFunction]
        store: IdempotencyStore = state.nexus_idempotency
        await store.shutdown()
