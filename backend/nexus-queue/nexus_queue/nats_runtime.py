"""NATS JetStream runtime (transport v2, decision D14): no taskiq.

The receiver serves the same :class:`HandlerSpec` contract as the taskiq path,
with the JetStream-native failure semantics taskiq cannot express (spike E1):

* transient error → ``NAK(delay)`` with the schedule derived from the config —
  an explicit NAK ignores the consumer's declarative ``backoff`` (verified in
  conformance: immediate redelivery), so the delay must ride on the NAK; the
  declarative ``backoff`` stays as the redelivery schedule for crashed workers
* :class:`NexusPermanentError` → DLQ record + ``TERM`` — straight to the DLQ
  without burning the retry budget
* exhausted ``max_deliver`` → the message becomes invisible to both the worker
  and the KEDA lag signal (spike E4), so the ``MAX_DELIVERIES`` advisory
  listener is the only exit to the DLQ — it is not optional
* long handlers → ``in_progress()`` heartbeat keeps ``ack_wait`` from firing
  spurious redeliveries

Cross-cutting parity with the taskiq path lives in ``_process``: version gate,
idempotency claim/release (Redis stays the idempotency store — D4), OTel
consume span, and the standard Prometheus counters.

Production topology (streams/consumers) is declared via NACK CRDs; the
``ensure_topology`` flag exists for tests and local dev.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import random
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

import nats
import structlog
from nats.aio.client import Client as NatsClient
from nats.aio.msg import Msg
from nats.js import JetStreamContext
from nats.js.api import AckPolicy, ConsumerConfig, RetentionPolicy
from opentelemetry import trace
from opentelemetry.propagate import extract, inject
from pydantic import BaseModel

from nexus_queue.config import RuntimeConfig
from nexus_queue.envelope import Envelope, require_supported_version
from nexus_queue.exceptions import NexusPermanentError
from nexus_queue.handlers import HandlerSpec
from nexus_queue.lifecycle import IdempotencyStorePort, create_idempotency_store
from nexus_queue.middleware.metrics import (
    COMPLETED,
    CONSUME_SECONDS,
    FAILED,
    FETCH_ERRORS,
    NATS_DISCONNECTS,
    RECEIVED,
)
from nexus_queue.naming import LABEL_IDEM, LABEL_TASK, LABEL_TENANT, LABEL_TRACE, SINGLE_TENANT

logger = structlog.get_logger("nexus_queue.nats")
_tracer = trace.get_tracer("nexus_queue")

# SystemRandom keeps ruff's bandit check (S311) happy without a noqa: jitter is
# not security-sensitive, but a CSPRNG is a fine source for it (same as the
# redis middleware).
_jitter = random.SystemRandom()

_MAX_BACKOFF_S = 60.0
_DEFAULT_ACK_WAIT_S = 30.0


def _current_traceparent() -> str | None:
    carrier: dict[str, str] = {}
    inject(carrier)
    return carrier.get("traceparent")


def backoff_schedule(config: RuntimeConfig) -> list[float]:
    """Exponential schedule derived from the config — the declarative
    equivalent of RetryDlqMiddleware's backoff (minus jitter, which the
    consumer config cannot express)."""
    steps = max(config.max_retries - 1, 0)
    return [min(config.retry_base_delay_s * (2.0**i), _MAX_BACKOFF_S) for i in range(steps)]


def consumer_config(config: RuntimeConfig) -> ConsumerConfig:
    """The work consumer as declarative config (projection of the contract)."""
    backoff = backoff_schedule(config)
    return ConsumerConfig(
        durable_name=config.nats_durable,
        ack_policy=AckPolicy.EXPLICIT,
        # attempts == deliveries, mirroring the redis path's max_retries
        max_deliver=max(config.max_retries, 1),
        backoff=backoff or None,
        # with a backoff schedule the server redelivers on backoff[0]; ack_wait
        # must agree with it (spike E2-B)
        ack_wait=backoff[0] if backoff else _DEFAULT_ACK_WAIT_S,
    )


class NatsPublisher:
    """Producer for the v2 transport: publishes the v1 envelope directly.

    Same wire shape as the taskiq path (labels ride inside the JSON body), plus
    ``Nats-Msg-Id`` = idempotency key for the broker's publish-side dedup —
    the runtime-level ``nq_idem`` dedup stays as the load-bearing wall (D4).
    """

    def __init__(self, js: JetStreamContext, config: RuntimeConfig) -> None:
        self._js = js
        self._config = config

    async def enqueue(
        self,
        task: str,
        payload: BaseModel,
        *,
        tenant: str = SINGLE_TENANT,
        idempotency_key: str | None = None,
        priority: str = "default",
        trace: str | None = None,
    ) -> str:
        return await self.enqueue_raw(
            task,
            payload.model_dump(),
            tenant=tenant,
            idempotency_key=idempotency_key,
            priority=priority,
            trace=trace,
        )

    async def enqueue_raw(
        self,
        task: str,
        payload: dict[str, Any],
        *,
        tenant: str = SINGLE_TENANT,
        idempotency_key: str | None = None,
        priority: str = "default",
        trace: str | None = None,
    ) -> str:
        envelope = Envelope(
            task=task,
            tenant=tenant,
            idempotency_key=idempotency_key,
            trace=trace or _current_traceparent(),
            priority=priority,
        )
        task_id = uuid.uuid4().hex
        message = {
            "task_id": task_id,
            "task_name": task,
            "labels": envelope.to_labels(),
            "args": [],
            "kwargs": payload,
        }
        await self._js.publish(
            self._config.work_subject,
            json.dumps(message).encode(),
            headers={"Nats-Msg-Id": idempotency_key or task_id},
        )
        return task_id


class NatsReceiver:
    """Pull-consume loop dispatching envelope v1 messages to HandlerSpecs."""

    def __init__(
        self,
        js: JetStreamContext,
        config: RuntimeConfig,
        deps: Any,
        specs: Sequence[HandlerSpec],
        idempotency: IdempotencyStorePort | None,
        *,
        max_concurrency: int = 4,
    ) -> None:
        self._js = js
        self._config = config
        self._deps = deps
        self._handlers = {spec.task_name: spec for spec in specs}
        self._idempotency = idempotency
        self._max_concurrency = max_concurrency
        self._backoff = backoff_schedule(config)
        ack_wait = consumer_config(config).ack_wait or _DEFAULT_ACK_WAIT_S
        self._heartbeat_every_s = max(ack_wait / 3.0, 0.05)
        self._stop = asyncio.Event()

    def _retry_delay(self, attempt: int) -> float:
        """Backoff for the redelivery after ``attempt`` (1-based), with jitter —
        mirrors RetryDlqMiddleware's schedule on the redis path."""
        if not self._backoff:
            return 0.0
        return self._backoff[min(attempt - 1, len(self._backoff) - 1)] + _jitter.random()

    def stop(self) -> None:
        self._stop.set()

    async def run(self, psub: Any) -> None:
        semaphore = asyncio.Semaphore(self._max_concurrency)
        pending: set[asyncio.Task[None]] = set()
        while not self._stop.is_set():
            # Only fetch what we can start right now. Fetching a full batch
            # regardless of free slots leaves the surplus buffered in-process
            # with their ack_wait clock ticking but no heartbeat (that starts
            # inside _process) — a slow handler then burns their delivery
            # budget into spurious redeliveries/DLQ. len(pending) is the
            # in-flight count (a task holds a slot until it's discarded).
            free = self._max_concurrency - len(pending)
            if free <= 0:
                # Saturated: wait for a slot before pulling more.
                await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
                continue
            try:
                msgs = await psub.fetch(free, timeout=1)
            except nats.errors.TimeoutError:
                continue
            except Exception:
                if self._stop.is_set():
                    break
                FETCH_ERRORS.labels(self._config.project, self._config.queue).inc()
                logger.exception("fetch-failed", subject=self._config.work_subject)
                await asyncio.sleep(1)
                continue
            for msg in msgs:
                # Never blocks: we fetched at most `free` messages and each
                # pending task holds exactly one permit.
                await semaphore.acquire()
                task = asyncio.create_task(self._process(msg, semaphore))
                pending.add(task)
                task.add_done_callback(pending.discard)
        if pending:  # graceful drain: finish in-flight work before exiting
            await asyncio.gather(*pending, return_exceptions=True)

    async def _process(self, msg: Msg, semaphore: asyncio.Semaphore) -> None:
        try:
            try:
                envelope: dict[str, Any] = json.loads(msg.data)
            except Exception:
                # Poison body: unparseable, so it can never succeed. TERM it
                # (don't redeliver to exhaustion) and capture the raw bytes in
                # the DLQ, instead of dying as an unretrieved task exception.
                logger.exception("poison-message", subject=self._config.work_subject)
                await self._dead_letter(
                    {},
                    "unparseable body",
                    permanent=True,
                    attempts=msg.metadata.num_delivered,
                    raw=msg.data.decode("utf-8", "replace") if msg.data else None,
                )
                await msg.term()
                return
            labels: dict[str, Any] = envelope.get("labels", {})
            task_label = str(labels.get(LABEL_TASK, envelope.get("task_name", "")))
            RECEIVED.labels(self._config.project, self._config.queue, task_label).inc()

            spec = self._handlers.get(str(envelope.get("task_name", "")))
            if spec is None:
                FAILED.labels(self._config.project, self._config.queue, task_label).inc()
                await self._dead_letter(envelope, "unknown task", permanent=True, attempts=1)
                await msg.term()
                return

            idem_raw = labels.get(LABEL_IDEM) if spec.idempotent else None
            idem = str(idem_raw) if idem_raw else None
            tenant = str(labels.get(LABEL_TENANT, SINGLE_TENANT))
            store = self._idempotency if idem else None
            # Claim up front so two concurrent in-flight redeliveries can't both run.
            if store is not None and idem and not await store.claim(idem, tenant):
                logger.info("duplicate-skipped", task=spec.task_name, idem=idem)
                await msg.ack()
                return

            heartbeat = asyncio.create_task(self._extend_while_running(msg))
            try:
                require_supported_version(labels)
                payload = spec.payload_model(**envelope.get("kwargs", {}))
                traceparent = labels.get(LABEL_TRACE)
                parent = extract({"traceparent": str(traceparent)}) if traceparent else None
                with _tracer.start_as_current_span(
                    f"nexus_queue.consume {spec.task_name}", context=parent
                ) as span:
                    span.set_attribute("nq.task", spec.task_name)
                    span.set_attribute("nq.tenant", tenant)
                    with CONSUME_SECONDS.labels(
                        self._config.project, self._config.queue, spec.task_name
                    ).time():
                        await spec.handler(payload, self._deps)
                COMPLETED.labels(self._config.project, self._config.queue, task_label).inc()
                await msg.ack()
            except NexusPermanentError as exc:
                if store is not None and idem:
                    await store.release(idem, tenant)
                FAILED.labels(self._config.project, self._config.queue, task_label).inc()
                await self._dead_letter(
                    envelope, repr(exc), permanent=True, attempts=msg.metadata.num_delivered
                )
                await msg.term()  # straight to DLQ, no retry budget burned
            except Exception:
                # Release the claim so the redelivery can re-claim — otherwise the
                # up-front claim would make the retry skip itself as a phantom dup.
                if store is not None and idem:
                    await store.release(idem, tenant)
                FAILED.labels(self._config.project, self._config.queue, task_label).inc()
                attempt = msg.metadata.num_delivered
                delay = self._retry_delay(attempt)
                logger.info(
                    "retry-scheduled",
                    task=spec.task_name,
                    attempt=attempt,
                    max_retries=self._config.max_retries,
                    delay_s=round(delay, 2),
                )
                # an explicit NAK ignores the consumer's declarative backoff,
                # so the schedule rides on the NAK delay
                await msg.nak(delay=delay)
            finally:
                heartbeat.cancel()
                # gather(return_exceptions=...): a heartbeat racing the final
                # ack/nak/term can raise on an already-settled msg — irrelevant
                await asyncio.gather(heartbeat, return_exceptions=True)
        except Exception:
            # Last-resort guard: an unexpected failure in the dispatch/settle
            # path (a failed DLQ publish, a settle error, the claim store being
            # down) must not leave the task dying with an unretrieved exception
            # while the message silently redelivers. NAK for retry — a genuine
            # poison message still exhausts max_deliver and exits via the
            # advisory→DLQ path; never TERM here, that would discard a
            # possibly-transient failure. Best-effort: the message may already
            # be settled, in which case the NAK is a harmless no-op error.
            logger.exception("process-failed", subject=self._config.work_subject)
            with contextlib.suppress(Exception):
                await msg.nak(delay=self._retry_delay(msg.metadata.num_delivered))
        finally:
            semaphore.release()

    async def _extend_while_running(self, msg: Msg) -> None:
        while True:
            await asyncio.sleep(self._heartbeat_every_s)
            try:
                await msg.in_progress()
            except Exception:
                # A transient in_progress() failure (a reconnect window) must
                # not kill the heartbeat: the handler is still running and its
                # ack_wait still needs extending, otherwise the message is
                # redelivered mid-flight. Log and keep trying — the task is
                # cancelled in _process's finally when the handler settles, and
                # CancelledError (BaseException) still propagates out of here.
                logger.warning("heartbeat-extend-failed", exc_info=True)

    async def _dead_letter(
        self,
        envelope: dict[str, Any],
        error: str,
        *,
        permanent: bool,
        attempts: int,
        raw: str | None = None,
    ) -> None:
        record = {
            "task_id": envelope.get("task_id"),
            "task_name": envelope.get("task_name"),
            "labels": envelope.get("labels", {}),
            "args": envelope.get("args", []),
            "kwargs": envelope.get("kwargs", {}),
            "error": error,
            "permanent": permanent,
            "attempts": attempts,
            "failed_at": datetime.now(UTC).isoformat(),
        }
        if raw is not None:
            # Only present for poison bodies we couldn't parse into an envelope.
            record["raw_body"] = raw
        await self._js.publish(self._config.dlq_subject, json.dumps(record, default=str).encode())
        logger.warning(
            "dead-letter",
            task=record["task_name"],
            subject=self._config.dlq_subject,
            permanent=permanent,
            attempts=attempts,
        )


class NatsWorker:
    """Owns the v2 worker lifecycle: connection, topology, receiver, advisories."""

    def __init__(self, config: RuntimeConfig, deps: Any, specs: Sequence[HandlerSpec]) -> None:
        if config.transport != "nats":
            raise ValueError("NatsWorker requires transport='nats'")
        self._config = config
        self._deps = deps
        self._specs = list(specs)
        self._nc: NatsClient | None = None
        self._js: JetStreamContext | None = None
        self._idempotency = create_idempotency_store(config) if config.idempotency_ttl_s else None
        self._receiver: NatsReceiver | None = None
        self._runner: asyncio.Task[None] | None = None

    @property
    def js(self) -> JetStreamContext:
        if self._js is None:
            raise RuntimeError("worker not started")
        return self._js

    async def _on_disconnected(self) -> None:
        NATS_DISCONNECTS.labels(self._config.project, self._config.queue).inc()
        logger.warning("nats-disconnected", subject=self._config.work_subject)

    async def _on_reconnected(self) -> None:
        logger.info("nats-reconnected", subject=self._config.work_subject)

    async def _on_closed(self) -> None:
        # With infinite reconnect this only fires on an explicit close (shutdown)
        # or a truly unrecoverable state. Log loudly; D3 keeps this off the
        # probes — the fetch-error/disconnect counters carry the alert.
        logger.error("nats-connection-closed", subject=self._config.work_subject)

    async def _on_error(self, err: Exception) -> None:
        logger.warning("nats-error", error=str(err), subject=self._config.work_subject)

    async def startup(self, *, ensure_topology: bool = True) -> None:
        if self._config.nats_url is None:  # unreachable: the config validator enforces it
            raise RuntimeError("transport='nats' requires nats_url")
        # Reconnect forever: the default budget (~60 attempts) lets a NATS outage
        # longer than a couple of minutes close the connection permanently, after
        # which every fetch raises and the worker is a healthy-looking zombie
        # (D3 keeps /ready green on purpose). -1 keeps it retrying; the callbacks
        # + counters make the outage observable.
        self._nc = await nats.connect(
            self._config.nats_url,
            max_reconnect_attempts=-1,
            disconnected_cb=self._on_disconnected,
            reconnected_cb=self._on_reconnected,
            closed_cb=self._on_closed,
            error_cb=self._on_error,
        )
        self._js = self._nc.jetstream()
        if self._idempotency is not None:
            await self._idempotency.startup()
        if ensure_topology:
            await ensure_streams(self._js, self._config)
        psub = await self._js.pull_subscribe(
            self._config.work_subject,
            durable=self._config.nats_durable,
            config=consumer_config(self._config),
        )
        await self._nc.subscribe(
            f"$JS.EVENT.ADVISORY.CONSUMER.MAX_DELIVERIES."
            f"{self._config.nats_stream}.{self._config.nats_durable}",
            cb=self._on_max_deliveries,
        )
        self._receiver = NatsReceiver(
            self._js, self._config, self._deps, self._specs, self._idempotency
        )
        self._runner = asyncio.create_task(self._receiver.run(psub))

    async def shutdown(self) -> None:
        if self._receiver is not None:
            self._receiver.stop()
        if self._runner is not None:
            await self._runner
        if self._idempotency is not None:
            await self._idempotency.shutdown()
        if self._nc is not None:
            await self._nc.close()

    async def _on_max_deliveries(self, advisory: Msg) -> None:
        """Exhausted messages are invisible to the worker and to KEDA (E4):
        this listener is their only exit to the DLQ."""
        if self._js is None or self._receiver is None or advisory.data is None:
            return  # shutdown race: advisory after the worker released its pieces
        body = json.loads(advisory.data)
        raw = await self._js.get_msg(self._config.nats_stream, body["stream_seq"])
        if raw.data is None:
            return  # message purged between the advisory and the lookup
        envelope = json.loads(raw.data)
        await self._receiver._dead_letter(  # worker and receiver are one unit
            envelope,
            "max_deliveries exhausted",
            permanent=False,
            attempts=int(body.get("deliveries", self._config.max_retries)),
        )


async def ensure_streams(js: JetStreamContext, config: RuntimeConfig) -> None:
    """Create the work + DLQ streams if absent (tests/local dev; prod = NACK CRDs).

    Work stream retention is LIMITS, not WORKQUEUE: the MAX_DELIVERIES advisory
    listener must be able to fetch the exhausted message by sequence (E4), and
    workqueue retention would also cap the subject at one consumer.
    """
    for name, subject in (
        (config.nats_stream, config.work_subject),
        (config.nats_dlq_stream, config.dlq_subject),
    ):
        with contextlib.suppress(Exception):
            await js.add_stream(name=name, subjects=[subject], retention=RetentionPolicy.LIMITS)
