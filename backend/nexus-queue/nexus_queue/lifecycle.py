"""Worker lifecycle: logging, dependency injection, and the idempotency store.

``register_lifecycle`` wires the project's adapters and a Redis-backed
idempotency store into the worker ``state`` on startup, where the handler
wrapper (see :mod:`nexus_queue.handlers`) reads them.
"""

from __future__ import annotations

import logging

import redis.asyncio as aioredis
import structlog
from prometheus_client import start_http_server
from taskiq import AsyncBroker, TaskiqEvents, TaskiqState

from nexus_queue.config import RuntimeConfig
from nexus_queue.delayed import DelayedRetryPoller
from nexus_queue.naming import idempotency_redis_key

logger = structlog.get_logger("nexus_queue.lifecycle")


class IdempotencyStore:
    """Redis claim-based dedup keyed by the message's ``nq_idem`` label.

    The claim is taken up front with ``SET NX`` so two concurrent in-flight
    redeliveries (Redis Streams pending-entry reclaim, a racing replica) can't
    both run the handler — the loser of the atomic SET short-circuits. A failed
    handler ``release``s the claim so a legitimate retry can re-claim; a
    successful handler leaves the claim for the TTL to skip later duplicates.
    Keys are namespaced per project + tenant."""

    def __init__(self, config: RuntimeConfig) -> None:
        self._config = config
        self._redis: aioredis.Redis | None = None

    async def startup(self) -> None:
        self._redis = aioredis.from_url(self._config.redis_url)

    async def shutdown(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()

    def _key(self, idem: str, tenant: str) -> str:
        return idempotency_redis_key(idem, project=self._config.project, tenant=tenant)

    async def claim(self, idem: str, tenant: str) -> bool:
        """Atomically claim the key. True -> claimed (run the handler); False ->
        a prior claim exists (skip as a duplicate)."""
        if self._config.idempotency_ttl_s <= 0 or self._redis is None:
            return True
        claimed = await self._redis.set(
            self._key(idem, tenant), "1", nx=True, ex=self._config.idempotency_ttl_s
        )
        return bool(claimed)

    async def release(self, idem: str, tenant: str) -> None:
        """Release a claim after a failed attempt so a retry can re-claim."""
        if self._config.idempotency_ttl_s <= 0 or self._redis is None:
            return
        await self._redis.delete(self._key(idem, tenant))


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


def _start_metrics_server(config: RuntimeConfig) -> None:
    """Serve the Prometheus registry over HTTP from the worker process.

    The consume counters/histogram live in this process; the kicker is a
    separate pod with its own registry, so without this the worker's metrics
    have no scrape endpoint. Best-effort: a metrics-server failure (e.g. a
    port collision when mistakenly run multi-process) must never take the
    worker down."""
    if config.metrics_port is None:
        return
    try:
        start_http_server(config.metrics_port)
        logger.info("metrics-server-started", port=config.metrics_port)
    except OSError as exc:
        logger.warning(
            "metrics-server-failed",
            port=config.metrics_port,
            error=str(exc),
            hint="run the worker single-process (taskiq --workers 1)",
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
        _start_metrics_server(config)
        store = IdempotencyStore(config)
        await store.startup()
        state.nexus_idempotency = store
        poller = DelayedRetryPoller(broker, config)
        await poller.startup()
        state.nexus_delayed = poller

    @broker.on_event(TaskiqEvents.WORKER_SHUTDOWN)
    async def _shutdown(state: TaskiqState) -> None:  # pyright: ignore[reportUnusedFunction]
        store: IdempotencyStore = state.nexus_idempotency
        await store.shutdown()
        poller: DelayedRetryPoller = state.nexus_delayed
        await poller.shutdown()
