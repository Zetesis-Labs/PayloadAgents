"""Worker lifecycle: logging, dependency injection, and the idempotency store.

``register_lifecycle`` wires the project's adapters and the configured
idempotency store into the worker ``state`` on startup, where the handler
wrapper (see :mod:`nexus_queue.handlers`) reads them. Two claim backends
implement the same contract (D15): Redis ``SET NX EX`` (v1 default) and
JetStream KV ``create`` + bucket max-age (M10) — ``create_idempotency_store``
picks by ``config.idempotency_backend``.
"""

from __future__ import annotations

import logging
from typing import Protocol

import nats
import redis.asyncio as aioredis
import structlog
from nats.aio.client import Client as NatsClient
from nats.js.api import KeyValueConfig
from nats.js.errors import APIError, KeyWrongLastSequenceError, NotFoundError
from nats.js.kv import KeyValue
from prometheus_client import start_http_server
from taskiq import AsyncBroker, TaskiqEvents, TaskiqState

from nexus_queue.config import RuntimeConfig
from nexus_queue.delayed import DelayedRetryPoller
from nexus_queue.naming import idempotency_kv_bucket, idempotency_kv_key, idempotency_redis_key

logger = structlog.get_logger("nexus_queue.lifecycle")


class IdempotencyStorePort(Protocol):
    """What the handler wrapper needs from a claims backend.

    The claim must be atomic (one winner among concurrent redeliveries) and
    expire after ``idempotency_ttl_s``; ``release`` frees it after a failed
    attempt so a legitimate retry can re-claim.
    """

    async def startup(self) -> None: ...

    async def shutdown(self) -> None: ...

    async def claim(self, idem: str, tenant: str) -> bool: ...

    async def release(self, idem: str, tenant: str) -> None: ...


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
        if self._config.redis_url is None:  # unreachable: the config validator enforces it
            return
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


class NatsKvIdempotencyStore:
    """JetStream KV claim-based dedup — same contract as :class:`IdempotencyStore`.

    The claim is KV ``create``: atomic (the loser of a concurrent race gets
    ``KeyWrongLastSequenceError``) and valid again after a ``delete``
    tombstone, so claim → release → re-claim survives. The TTL is the bucket's
    ``max-age``: each claim expires ``idempotency_ttl_s`` after it was written,
    mirroring the Redis ``EX`` semantics. With ``transport='nats'`` this
    backend removes the worker's Redis dependency entirely (D15/M10).
    """

    def __init__(self, config: RuntimeConfig) -> None:
        self._config = config
        self._nc: NatsClient | None = None
        self._kv: KeyValue | None = None

    async def startup(self) -> None:
        if self._config.idempotency_ttl_s <= 0 or self._config.nats_url is None:
            return
        # Reconnect forever (see NatsWorker.startup): a terminal close here would
        # make every claim() raise and NAK its message to exhaustion.
        self._nc = await nats.connect(self._config.nats_url, max_reconnect_attempts=-1)
        js = self._nc.jetstream()
        bucket = idempotency_kv_bucket(self._config.project)
        try:
            self._kv = await js.key_value(bucket)
        except NotFoundError:
            try:
                self._kv = await js.create_key_value(
                    KeyValueConfig(bucket=bucket, ttl=self._config.idempotency_ttl_s)
                )
            except APIError:
                # Lost the create race against another worker: the bucket exists now.
                self._kv = await js.key_value(bucket)

    async def shutdown(self) -> None:
        if self._nc is not None:
            await self._nc.close()

    async def claim(self, idem: str, tenant: str) -> bool:
        """Atomically claim the key. True -> claimed (run the handler); False ->
        a prior claim exists (skip as a duplicate)."""
        if self._kv is None:
            return True
        try:
            await self._kv.create(idempotency_kv_key(idem, tenant=tenant), b"1")
        except KeyWrongLastSequenceError:
            return False
        return True

    async def release(self, idem: str, tenant: str) -> None:
        """Release a claim after a failed attempt so a retry can re-claim."""
        if self._kv is None:
            return
        await self._kv.delete(idempotency_kv_key(idem, tenant=tenant))


def create_idempotency_store(config: RuntimeConfig) -> IdempotencyStorePort:
    """Pick the claims backend (D15). Both no-op when ``idempotency_ttl_s`` is 0."""
    if config.idempotency_backend == "nats-kv":
        return NatsKvIdempotencyStore(config)
    return IdempotencyStore(config)


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
        store = create_idempotency_store(config)
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
