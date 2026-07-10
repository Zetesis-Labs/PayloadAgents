"""Worker lifecycle: logging and the idempotency store.

The claim store is the load-bearing dedup wall (D4/D15): a JetStream KV
``create`` + bucket max-age, keyed by the message's ``nq_idem`` label.
"""

from __future__ import annotations

import contextlib
import logging
import time
from enum import Enum
from typing import Protocol

import nats
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

from nexus_queue.config import RuntimeConfig
from nexus_queue.naming import idempotency_kv_bucket, idempotency_kv_key

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
    """What the receiver needs from the claims backend.

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


class NatsKvIdempotencyStore:
    """JetStream KV claim-based dedup.

    ``claim`` is KV ``create`` of a leased pending marker: atomic (the loser of
    a concurrent race gets ``KeyWrongLastSequenceError``) and valid again after
    a ``delete`` tombstone. The loser reads the live value to tell ``done`` from
    a live lease from a crashed one (expired lease → CAS take-over via
    ``update(last=revision)``). The bucket ``max-age`` bounds every key at
    ``idempotency_ttl_s``.
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
    """The claims backend (JetStream KV). No-ops when ``idempotency_ttl_s`` is 0."""
    return NatsKvIdempotencyStore(config)


def configure_logging(config: RuntimeConfig) -> None:
    """Idempotent structlog setup so the worker + FastAPI share one JSON sink."""
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
