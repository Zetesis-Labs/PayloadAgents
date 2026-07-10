"""Worker lifecycle: logging, dependency injection, and the idempotency store.

``register_lifecycle`` wires the project's adapters and the configured
idempotency store into the worker ``state`` on startup, where the handler
wrapper (see :mod:`nexus_queue.handlers`) reads them. Two claim backends
implement the same contract (D15): Redis ``SET NX EX`` (v1 default) and
JetStream KV ``create`` + bucket max-age (M10) — ``create_idempotency_store``
picks by ``config.idempotency_backend``.
"""

from __future__ import annotations

import contextlib
import logging
import time
from collections.abc import Awaitable
from enum import Enum
from typing import Protocol, cast

import nats
import redis.asyncio as aioredis
import structlog
from nats.aio.client import Client as NatsClient
from nats.js.api import KeyValueConfig
from nats.js.errors import (
    APIError,
    KeyDeletedError,
    KeyNotFoundError,
    KeyWrongLastSequenceError,
    NotFoundError,
)
from nats.js.kv import KeyValue
from prometheus_client import start_http_server
from taskiq import AsyncBroker, TaskiqEvents, TaskiqState

from nexus_queue.config import RuntimeConfig
from nexus_queue.delayed import DelayedRetryPoller
from nexus_queue.naming import idempotency_kv_bucket, idempotency_kv_key, idempotency_redis_key

logger = structlog.get_logger("nexus_queue.lifecycle")


class ClaimOutcome(Enum):
    """Result of claiming an ``nq_idem`` key — see :class:`IdempotencyStorePort`."""

    CLAIMED = "claimed"  # we own the claim; run the handler
    DONE = "done"  # a prior attempt completed; skip as a genuine duplicate
    IN_PROGRESS = "in_progress"  # another live attempt holds it; defer (NAK)


# Claim values on the wire. A completed attempt marks ``done``; an in-flight one
# writes ``P:<lease-expiry-epoch>`` so a *crashed* holder (which never releases)
# can be detected by an expired lease and taken over, instead of its claim
# masquerading as a completion and getting the message ACK-and-dropped.
_DONE = b"done"


def _pending(expiry: float) -> bytes:
    return f"P:{expiry:.3f}".encode()


def _pending_expiry(value: bytes | None) -> float | None:
    """Lease expiry from a pending marker, or None if not an in-progress claim."""
    if value is None or not value.startswith(b"P:"):
        return None
    try:
        return float(value[2:])
    except ValueError:
        return None


class IdempotencyStorePort(Protocol):
    """What the handler wrapper needs from a claims backend.

    The claim is atomic (one winner among concurrent redeliveries) and carries
    a *state*: an in-progress claim leases the key for ``idempotency_lease_s``
    (refreshed while the handler runs); ``mark_done`` turns it into a completion
    marker that dedups later duplicates for ``idempotency_ttl_s``; ``release``
    frees it after a failed attempt so a legitimate retry can re-claim. The
    lease is what stops a crashed holder's claim from being read as "done" and
    silently dropping the message.
    """

    async def startup(self) -> None: ...

    async def shutdown(self) -> None: ...

    async def claim(self, idem: str, tenant: str) -> ClaimOutcome: ...

    async def refresh(self, idem: str, tenant: str) -> None: ...

    async def mark_done(self, idem: str, tenant: str) -> None: ...

    async def release(self, idem: str, tenant: str) -> None: ...


# CAS take-over of a stale (expired-lease) claim: overwrite ONLY if the value is
# still the exact stale marker we read, so two racing take-overs can't both win.
_REDIS_TAKEOVER = (
    "if redis.call('get', KEYS[1]) == ARGV[1] then "
    "redis.call('set', KEYS[1], ARGV[2], 'EX', ARGV[3]); return 1 else return 0 end"
)
# Extend our own lease ONLY while the key is still a pending marker (never clobber
# a 'done' written by someone else, nor a fresh take-over's value).
_REDIS_REFRESH = (
    "local v = redis.call('get', KEYS[1]); "
    "if v and string.sub(v, 1, 2) == 'P:' then "
    "redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[2]); return 1 end; return 0"
)


class IdempotencyStore:
    """Redis claim-based dedup keyed by the message's ``nq_idem`` label.

    ``claim`` is ``SET NX`` of a leased pending marker; the loser reads the
    current value to tell a completion (``done`` → skip) from a live claim
    (defer) from a *crashed* one (expired lease → CAS take-over). ``mark_done``
    writes the completion marker; ``release`` deletes on failure. Keys are
    namespaced per project + tenant."""

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

    async def claim(self, idem: str, tenant: str) -> ClaimOutcome:
        if self._config.idempotency_ttl_s <= 0 or self._redis is None:
            return ClaimOutcome.CLAIMED
        key = self._key(idem, tenant)
        ttl = self._config.idempotency_ttl_s
        now = time.time()
        pending = _pending(now + self._config.idempotency_lease_s)
        if await self._redis.set(key, pending, nx=True, ex=ttl):
            return ClaimOutcome.CLAIMED
        current = await self._redis.get(key)
        if current is None:  # expired between SET NX and GET — one more try
            if await self._redis.set(key, pending, nx=True, ex=ttl):
                return ClaimOutcome.CLAIMED
            return ClaimOutcome.IN_PROGRESS
        if current == _DONE:
            return ClaimOutcome.DONE
        expiry = _pending_expiry(current)
        if expiry is not None and now >= expiry:
            won = await cast(
                "Awaitable[int]", self._redis.eval(_REDIS_TAKEOVER, 1, key, current, pending, ttl)
            )
            if won:
                return ClaimOutcome.CLAIMED
        return ClaimOutcome.IN_PROGRESS

    async def refresh(self, idem: str, tenant: str) -> None:
        if self._config.idempotency_ttl_s <= 0 or self._redis is None:
            return
        pending = _pending(time.time() + self._config.idempotency_lease_s)
        await cast(
            "Awaitable[int]",
            self._redis.eval(
                _REDIS_REFRESH, 1, self._key(idem, tenant), pending, self._config.idempotency_ttl_s
            ),
        )

    async def mark_done(self, idem: str, tenant: str) -> None:
        if self._config.idempotency_ttl_s <= 0 or self._redis is None:
            return
        await self._redis.set(self._key(idem, tenant), _DONE, ex=self._config.idempotency_ttl_s)

    async def release(self, idem: str, tenant: str) -> None:
        if self._config.idempotency_ttl_s <= 0 or self._redis is None:
            return
        await self._redis.delete(self._key(idem, tenant))


class NatsKvIdempotencyStore:
    """JetStream KV claim-based dedup — same contract as :class:`IdempotencyStore`.

    ``claim`` is KV ``create`` of a leased pending marker: atomic (the loser of
    a concurrent race gets ``KeyWrongLastSequenceError``) and valid again after
    a ``delete`` tombstone. The loser reads the live value to tell ``done`` from
    a live lease from a crashed one (expired lease → CAS take-over via
    ``update(last=revision)``). The bucket ``max-age`` bounds every key at
    ``idempotency_ttl_s``. With ``transport='nats'`` this removes the worker's
    Redis dependency entirely (D15/M10).
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

    async def claim(self, idem: str, tenant: str) -> ClaimOutcome:
        if self._kv is None:
            return ClaimOutcome.CLAIMED
        key = idempotency_kv_key(idem, tenant=tenant)
        now = time.time()
        pending = _pending(now + self._config.idempotency_lease_s)
        try:
            await self._kv.create(key, pending)
            return ClaimOutcome.CLAIMED
        except KeyWrongLastSequenceError:
            pass
        try:
            entry = await self._kv.get(key)
        except (KeyNotFoundError, KeyDeletedError):
            # Released/expired between create and get — try to grab it once more.
            try:
                await self._kv.create(key, pending)
                return ClaimOutcome.CLAIMED
            except KeyWrongLastSequenceError:
                return ClaimOutcome.IN_PROGRESS
        if entry.value == _DONE:
            return ClaimOutcome.DONE
        expiry = _pending_expiry(entry.value)
        if expiry is not None and now >= expiry:
            try:
                await self._kv.update(key, pending, last=entry.revision)
                return ClaimOutcome.CLAIMED
            except KeyWrongLastSequenceError:
                return ClaimOutcome.IN_PROGRESS
        return ClaimOutcome.IN_PROGRESS

    async def refresh(self, idem: str, tenant: str) -> None:
        if self._kv is None:
            return
        key = idempotency_kv_key(idem, tenant=tenant)
        try:
            entry = await self._kv.get(key)
        except (KeyNotFoundError, KeyDeletedError):
            return
        # Only extend while it's still our pending marker; never clobber a 'done'
        # or a take-over. CAS on the revision so a racing take-over wins cleanly.
        if _pending_expiry(entry.value) is None:
            return
        with contextlib.suppress(KeyWrongLastSequenceError):
            await self._kv.update(
                key, _pending(time.time() + self._config.idempotency_lease_s), last=entry.revision
            )

    async def mark_done(self, idem: str, tenant: str) -> None:
        if self._kv is None:
            return
        await self._kv.put(idempotency_kv_key(idem, tenant=tenant), _DONE)

    async def release(self, idem: str, tenant: str) -> None:
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
