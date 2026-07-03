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
from nexus_queue.lifecycle import IdempotencyStore
from nexus_queue.middleware.metrics import COMPLETED, CONSUME_SECONDS, FAILED, RECEIVED
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
        idempotency: IdempotencyStore | None,
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
            try:
                msgs = await psub.fetch(self._max_concurrency, timeout=1)
            except nats.errors.TimeoutError:
                continue
            except Exception:
                if self._stop.is_set():
                    break
                logger.exception("fetch-failed", subject=self._config.work_subject)
                await asyncio.sleep(1)
                continue
            for msg in msgs:
                await semaphore.acquire()
                task = asyncio.create_task(self._process(msg, semaphore))
                pending.add(task)
                task.add_done_callback(pending.discard)
        if pending:  # graceful drain: finish in-flight work before exiting
            await asyncio.gather(*pending, return_exceptions=True)

    async def _process(self, msg: Msg, semaphore: asyncio.Semaphore) -> None:
        try:
            envelope: dict[str, Any] = json.loads(msg.data)
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
        finally:
            semaphore.release()

    async def _extend_while_running(self, msg: Msg) -> None:
        while True:
            await asyncio.sleep(self._heartbeat_every_s)
            await msg.in_progress()

    async def _dead_letter(
        self, envelope: dict[str, Any], error: str, *, permanent: bool, attempts: int
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
        self._nc: nats.NATS | None = None
        self._js: JetStreamContext | None = None
        self._idempotency = IdempotencyStore(config) if config.idempotency_ttl_s else None
        self._receiver: NatsReceiver | None = None
        self._runner: asyncio.Task[None] | None = None

    @property
    def js(self) -> JetStreamContext:
        if self._js is None:
            raise RuntimeError("worker not started")
        return self._js

    async def startup(self, *, ensure_topology: bool = True) -> None:
        if self._config.nats_url is None:  # unreachable: the config validator enforces it
            raise RuntimeError("transport='nats' requires nats_url")
        self._nc = await nats.connect(self._config.nats_url)
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
        if self._js is None or self._receiver is None:
            return  # shutdown race: advisory after the worker released its pieces
        body = json.loads(advisory.data)
        raw = await self._js.get_msg(self._config.nats_stream, body["stream_seq"])
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
