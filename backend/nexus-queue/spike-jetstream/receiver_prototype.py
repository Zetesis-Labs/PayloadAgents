"""E8 — Prototipo del receiver v2 (D14): nexus-queue sobre nats-py, sin taskiq.

Valida que un receiver fino puede servir HandlerSpec REALES de nexus_queue con
la semántica JetStream completa que taskiq no puede expresar (spike E1):

  - fetch loop pull con semáforo de concurrencia
  - dispatch por task_name del envelope v1 (mismo wire que Redis/taskiq)
  - NexusRetryableError / excepción genérica → NAK (schedule = backoff
    declarativo del consumer — la política vive en la config, no en código)
  - NexusPermanentError → TERM + registro DLQ (sin quemar presupuesto)
  - agotamiento de max_deliver → advisory MAX_DELIVERIES → registro DLQ
  - heartbeat in_progress() para handlers largos
  - dedup por nq_idem a nivel de runtime (segunda línea tras Nats-Msg-Id)

Uso:
    docker compose -f docker-compose.yml up -d
    cd .. && uv run --with nats-py python nexus-queue/spike-jetstream/receiver_prototype.py

PASS = las 6 aserciones del escenario final.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import traceback
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import nats
from nats.aio.msg import Msg
from nats.js import JetStreamContext
from nats.js.api import AckPolicy, ConsumerConfig, RetentionPolicy
from nexus_queue import HandlerSpec, NexusPermanentError
from pydantic import BaseModel

URL = "nats://127.0.0.1:4222"
STREAM = "NQ_PROTO"
SUBJECT = "nq.proto.jobs"
DLQ_STREAM = "NQ_PROTO_DLQ"
DLQ_SUBJECT = f"{SUBJECT}.dlq"
DURABLE = "proto_worker"
ADVISORY = f"$JS.EVENT.ADVISORY.CONSUMER.MAX_DELIVERIES.{STREAM}.{DURABLE}"


# ─── El receiver (esto es lo que M3 convierte en nexus_queue/receiver.py) ────


@dataclass
class NatsReceiver:
    """Receiver fino: consume envelope v1 de un pull consumer JetStream y
    despacha a HandlerSpec de nexus_queue. La política de retry NO vive aquí:
    vive en el backoff declarativo del consumer (proyección del contrato)."""

    js: JetStreamContext
    deps: Any
    specs: list[HandlerSpec]
    heartbeat_every_s: float = 2.0
    max_concurrency: int = 4
    _handlers: dict[str, HandlerSpec] = field(init=False, default_factory=dict)
    _idem_seen: set[str] = field(init=False, default_factory=set)
    _stop: asyncio.Event = field(init=False, default_factory=asyncio.Event)

    def __post_init__(self) -> None:
        self._handlers = {spec.task_name: spec for spec in self.specs}

    async def run(self, psub: Any) -> None:
        semaphore = asyncio.Semaphore(self.max_concurrency)
        pending: set[asyncio.Task[None]] = set()
        while not self._stop.is_set():
            try:
                msgs = await psub.fetch(self.max_concurrency, timeout=1)
            except nats.errors.TimeoutError:
                continue
            except Exception:
                if self._stop.is_set():
                    break
                raise
            for msg in msgs:
                await semaphore.acquire()
                task = asyncio.create_task(self._process(msg, semaphore))
                pending.add(task)
                task.add_done_callback(pending.discard)
        if pending:  # graceful drain: terminar lo en vuelo antes de salir
            await asyncio.gather(*pending, return_exceptions=True)

    def stop(self) -> None:
        self._stop.set()

    async def _process(self, msg: Msg, semaphore: asyncio.Semaphore) -> None:
        try:
            envelope = json.loads(msg.data)
            spec = self._handlers.get(envelope["task_name"])
            if spec is None:
                await self._dead_letter(envelope, "unknown task", permanent=True, msg=msg)
                await msg.term()
                return

            labels = envelope.get("labels", {})
            idem = labels.get("nq_idem")
            if spec.idempotent and idem and idem in self._idem_seen:
                await msg.ack()  # duplicado a nivel runtime: ack y skip
                return

            heartbeat = asyncio.create_task(self._extend_while_running(msg))
            try:
                payload = spec.payload_model(**envelope.get("kwargs", {}))
                await spec.handler(payload, self.deps)
                if spec.idempotent and idem:
                    self._idem_seen.add(idem)
                await msg.ack()
            except NexusPermanentError as exc:
                await self._dead_letter(envelope, repr(exc), permanent=True, msg=msg)
                await msg.term()  # directo a DLQ sin quemar presupuesto
            except Exception:
                await msg.nak()  # delay = backoff declarativo del consumer
            finally:
                heartbeat.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await heartbeat
        finally:
            semaphore.release()

    async def _extend_while_running(self, msg: Msg) -> None:
        while True:
            await asyncio.sleep(self.heartbeat_every_s)
            await msg.in_progress()

    async def _dead_letter(
        self, envelope: dict[str, Any], error: str, *, permanent: bool, msg: Msg
    ) -> None:
        record = {
            "task_name": envelope.get("task_name"),
            "labels": envelope.get("labels", {}),
            "kwargs": envelope.get("kwargs", {}),
            "error": error,
            "traceback": traceback.format_exc(),
            "permanent": permanent,
            "attempts": msg.metadata.num_delivered,
            "failed_at": datetime.now(UTC).isoformat(),
        }
        await self.js.publish(DLQ_SUBJECT, json.dumps(record).encode())


async def run_advisory_dlq_listener(nc: nats.NATS, js: JetStreamContext) -> None:
    """Agotamiento de max_deliver → el mensaje es INVISIBLE para KEDA y para el
    worker (spike E4 + research): este listener es la única salida a DLQ."""

    async def on_advisory(advisory_msg: Msg) -> None:
        body = json.loads(advisory_msg.data)
        raw = await js.get_msg(STREAM, body["stream_seq"])
        envelope = json.loads(raw.data)
        record = {
            "task_name": envelope.get("task_name"),
            "labels": envelope.get("labels", {}),
            "kwargs": envelope.get("kwargs", {}),
            "error": "max_deliveries exhausted",
            "permanent": False,
            "attempts": body.get("deliveries"),
            "failed_at": datetime.now(UTC).isoformat(),
        }
        await js.publish(DLQ_SUBJECT, json.dumps(record).encode())

    await nc.subscribe(ADVISORY, cb=on_advisory)


# ─── Publisher mínimo (envelope v1: mismo wire que Redis/taskiq) ─────────────


async def publish(js: JetStreamContext, task: str, kwargs: dict[str, Any], idem: str) -> None:
    envelope = {
        "task_id": uuid.uuid4().hex,
        "task_name": task,
        "labels": {
            "nq_v": "1",
            "nq_task": task,
            "nq_tenant": "_",
            "nq_idem": idem,
            "nq_enqueued_at": datetime.now(UTC).isoformat(),
            "nq_priority": "default",
        },
        "args": [],
        "kwargs": kwargs,
    }
    await js.publish(
        SUBJECT,
        json.dumps(envelope).encode(),
        headers={"Nats-Msg-Id": uuid.uuid4().hex, "nq_idem": idem},
    )


# ─── Escenario de validación ──────────────────────────────────────────────────


class JobPayload(BaseModel):
    id: str


class ScratchDeps:
    def __init__(self) -> None:
        self.counts: dict[str, int] = {}

    def incr(self, key: str) -> int:
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]


async def main() -> None:
    nc = await nats.connect(URL)
    js = nc.jetstream()
    for stream in (STREAM, DLQ_STREAM):
        with contextlib.suppress(Exception):
            await js.delete_stream(stream)
    # retention=limits: el DLQ listener necesita recuperar el mensaje por seq (E4)
    await js.add_stream(name=STREAM, subjects=[SUBJECT], retention=RetentionPolicy.LIMITS)
    await js.add_stream(name=DLQ_STREAM, subjects=[DLQ_SUBJECT])

    deps = ScratchDeps()

    async def echo(payload: JobPayload, d: ScratchDeps) -> None:
        d.incr(f"echo:{payload.id}")

    async def flaky(payload: JobPayload, d: ScratchDeps) -> None:
        if d.incr(f"flaky:{payload.id}") < 2:
            raise RuntimeError("transient — NAK, el backoff del consumer decide el delay")

    async def boom(payload: JobPayload, d: ScratchDeps) -> None:
        d.incr(f"boom:{payload.id}")
        raise NexusPermanentError("nope")

    async def doom(payload: JobPayload, d: ScratchDeps) -> None:
        d.incr(f"doom:{payload.id}")
        raise RuntimeError("siempre falla — debe agotar max_deliver")

    specs = [
        HandlerSpec("proto.echo", echo, JobPayload),
        HandlerSpec("proto.flaky", flaky, JobPayload),
        HandlerSpec("proto.boom", boom, JobPayload),
        HandlerSpec("proto.doom", doom, JobPayload),
    ]

    # La política de retry como CONFIG (proyección del contrato), no como código:
    psub = await js.pull_subscribe(
        SUBJECT,
        durable=DURABLE,
        config=ConsumerConfig(
            ack_policy=AckPolicy.EXPLICIT,
            ack_wait=5,
            max_deliver=3,
            backoff=[1, 2],
        ),
    )

    await run_advisory_dlq_listener(nc, js)
    receiver = NatsReceiver(js=js, deps=deps, specs=specs)
    runner = asyncio.create_task(receiver.run(psub))

    await publish(js, "proto.echo", {"id": "e1"}, idem="proto-e1")
    await publish(js, "proto.echo", {"id": "e1"}, idem="proto-e1")  # dup runtime (msg-id distinto)
    await publish(js, "proto.flaky", {"id": "f1"}, idem="proto-f1")
    await publish(js, "proto.boom", {"id": "b1"}, idem="proto-b1")
    await publish(js, "proto.doom", {"id": "d1"}, idem="proto-d1")

    await asyncio.sleep(12)  # backoff [1,2] + agotamiento de doom + margen
    receiver.stop()
    await runner

    dlq_entries = []
    dlq_sub = await js.pull_subscribe(DLQ_SUBJECT, durable="dlq_reader")
    with contextlib.suppress(Exception):
        for m in await dlq_sub.fetch(10, timeout=2):
            dlq_entries.append(json.loads(m.data))
            await m.ack()

    consumer = await js.consumer_info(STREAM, DURABLE)
    checks = {
        "echo procesado 1 vez (dedup nq_idem runtime)": deps.counts.get("echo:e1") == 1,
        "flaky reintentado via NAK+backoff (2 intentos)": deps.counts.get("flaky:f1") == 2,
        "boom permanente sin reintento (1 intento)": deps.counts.get("boom:b1") == 1,
        "doom agotó max_deliver=3 (3 intentos)": deps.counts.get("doom:d1") == 3,
        "DLQ con 2 registros (permanent + max_deliveries)": len(dlq_entries) == 2
        and {e["error"] == "max_deliveries exhausted" for e in dlq_entries} == {True, False},
        "consumer limpio al final (ack_pending=0)": consumer.num_ack_pending == 0,
    }
    print()
    for name, ok in checks.items():
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    print(f"\n  counts={deps.counts}")
    print(f"  dlq={[(e['task_name'], e['error'][:40]) for e in dlq_entries]}")

    await nc.close()
    all_ok = all(checks.values())
    print(
        f"\nE8 RESULT: {'PASS — el receiver v2 sin taskiq es viable (D14 validada)' if all_ok else 'FAIL'}"
    )
    raise SystemExit(0 if all_ok else 1)


asyncio.run(main())
