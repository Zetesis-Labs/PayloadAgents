# /// script
# requires-python = ">=3.11"
# dependencies = ["nats-py>=2.9", "taskiq-nats==0.6.0"]
# ///
"""E1 — ¿Cabe el retry NAK-nativo en taskiq? (confirmación empírica del desk research)

Desk research (EVALUATION.md §research): taskiq core solo modela `ack` —
`AckableMessage(data, ack)` — y el receiver ackea incluso tasks fallidas
(la excepción se captura en TaskiqResult.is_err sin propagar). Si eso es
cierto, el "retry diferido nativo del broker" NO es alcanzable manteniendo
taskiq, y la opción real es un receiver propio sobre nats-py.

Este script lo confirma estructural y empíricamente:
  A. Estructural: campos reales de AckableMessage; qué expone taskiq-nats
     en listen() (¿hay nak/term/in_progress? ¿metadata de delivery? ¿headers?).
  B. Empírico: kick → listen: ¿los labels nq_* salen como headers NATS?
     ¿el body los duplica? ¿qué se pierde a la vuelta?

FAIL aquí significa "taskiq NO puede expresar NAK" → refuerza opción (c).
"""

import asyncio
import dataclasses
import inspect

URL = "nats://127.0.0.1:4222"


async def main() -> None:
    from taskiq.acks import AckableMessage
    from taskiq_nats import PullBasedJetStreamBroker

    # --- A. Estructural -------------------------------------------------------
    if dataclasses.is_dataclass(AckableMessage):
        fields = [f.name for f in dataclasses.fields(AckableMessage)]
    elif hasattr(AckableMessage, "model_fields"):  # pydantic v2
        fields = list(AckableMessage.model_fields)
    else:
        fields = list(getattr(AckableMessage, "__annotations__", {}))
    print(f"[A] AckableMessage fields: {fields}")
    has_nak = any(k in fields for k in ("nak", "reject", "nack", "in_progress"))
    print(f"[A] ¿taskiq modela nak/term/in_progress?: {'SÍ' if has_nak else 'NO — solo ack'}")

    src = inspect.getsource(PullBasedJetStreamBroker.listen)
    exposes_msg = "metadata" in src or "num_delivered" in src or "headers" in src
    print(f"[A] ¿listen() expone metadata/headers del msg NATS?: {'SÍ' if exposes_msg else 'NO — solo data+ack'}")

    # --- B. Empírico: qué viaja realmente por el wire -------------------------
    broker = PullBasedJetStreamBroker(
        servers=URL, queue="nq.spike.e1", stream_name="NQ_SPIKE_E1", durable="e1w"
    )
    await broker.startup()

    @broker.task(task_name="e1.echo")
    async def echo(x: str) -> str:
        return x

    await echo.kicker().with_labels(nq_task="e1.echo", nq_idem="e1-idem-1", nq_v="1").kiq("hola")

    got = None
    async for am in broker.listen():
        got = am
        break

    assert got is not None
    print(f"[B] listen() yield type: {type(got).__name__}")
    body = got.data if isinstance(got.data, bytes) else bytes(got.data)
    labels_in_body = b"nq_idem" in body
    print(f"[B] labels nq_* dentro del body serializado: {'SÍ' if labels_in_body else 'NO'}")
    print(f"[B] body[:200]: {body[:200]!r}")
    if hasattr(got, "ack") and callable(got.ack):
        result = got.ack()
        if inspect.isawaitable(result):
            await result
    await broker.shutdown()

    # Veredicto del experimento: el wire contract (labels en el mensaje)
    # sobrevive a taskiq-nats; la semántica de fallo NO.
    print("\nE1 RESULT:")
    print(f"  - wire contract (labels en payload): {'PASS' if labels_in_body else 'FAIL'}")
    print(f"  - NAK/term/in_progress via taskiq:   {'DISPONIBLE' if has_nak else 'NO DISPONIBLE (confirmado)'}")
    raise SystemExit(0 if labels_in_body and not has_nak else 2)


asyncio.run(main())
