# /// script
# requires-python = ">=3.11"
# dependencies = ["nats-py>=2.9"]
# ///
"""E4 — Agotamiento de reintentos → captura para DLQ.

Claim (mapeo §5): "señal de agotamiento: max_deliver / advisory". El DLQ
middleware necesita un hook fiable cuando un mensaje agota max_deliver, con
acceso al MENSAJE COMPLETO (payload + headers) para publicar el registro DLQ
con traceback/attempts como hace hoy RetryDlqMiddleware sobre Redis.

Método: consumer con max_deliver=2; un handler que siempre NAK-ea; escuchamos
el advisory $JS.EVENT.ADVISORY.CONSUMER.MAX_DELIVERIES.<stream>.<consumer> y
recuperamos el mensaje original vía direct get por stream_seq.

PASS: advisory recibido + mensaje completo recuperable por seq.
"""

import asyncio
import json

import nats
from nats.js.api import AckPolicy, ConsumerConfig, RetentionPolicy

URL = "nats://127.0.0.1:4222"
STREAM = "NQ_SPIKE_E4"
SUBJECT = "nq.spike.e4"
DURABLE = "e4_worker"
ADVISORY = f"$JS.EVENT.ADVISORY.CONSUMER.MAX_DELIVERIES.{STREAM}.{DURABLE}"


async def main() -> None:
    nc = await nats.connect(URL)
    js = nc.jetstream()
    try:
        await js.delete_stream(STREAM)
    except Exception:
        pass
    # OJO: retention=limits (no workqueue) para que el mensaje siga recuperable
    # por seq tras agotar deliveries — decisión de diseño relevante para el DLQ.
    await js.add_stream(name=STREAM, subjects=[SUBJECT], retention=RetentionPolicy.LIMITS)

    advisories: list[dict] = []
    seen_subjects: list[str] = []

    async def on_advisory(msg) -> None:
        seen_subjects.append(msg.subject)
        if "MAX_DELIVERIES" in msg.subject:
            advisories.append(json.loads(msg.data))
            print(f"[advisory] {msg.subject}: stream_seq={advisories[-1].get('stream_seq')}")

    # Wildcard: vemos TODOS los advisories para diagnosticar qué emite el server.
    await nc.subscribe("$JS.EVENT.ADVISORY.>", cb=on_advisory)

    psub = await js.pull_subscribe(
        SUBJECT,
        durable=DURABLE,
        config=ConsumerConfig(ack_policy=AckPolicy.EXPLICIT, max_deliver=2, ack_wait=60),
    )
    await js.publish(
        SUBJECT, b'{"doc": 42}', headers={"nq_task": "parse", "nq_idem": "e4-1", "nq_trace": "00-abc"}
    )

    # Handler que "siempre falla": NAK inmediato en cada delivery.
    for attempt in (1, 2):
        msgs = await psub.fetch(1, timeout=5)
        m = msgs[0]
        print(f"[worker] delivery #{m.metadata.num_delivered} — handler falla, NAK")
        await m.nak()

    # Un fetch extra fuerza al server a evaluar la redelivery (y su agotamiento).
    try:
        await psub.fetch(1, timeout=3)
        print("[worker] WARN — el server entregó más allá de max_deliver")
    except Exception:
        pass
    await asyncio.sleep(3)  # margen para el advisory

    if not advisories:
        print(f"[debug] advisories vistos (wildcard): {seen_subjects}")
        print("\nE4 RESULT: FAIL — no llegó el advisory de MAX_DELIVERIES")
        raise SystemExit(1)

    seq = advisories[-1].get("stream_seq")
    raw = await js.get_msg(STREAM, seq)
    print(f"[dlq-capture] seq={seq} payload={raw.data!r} headers={raw.headers}")
    ok = raw.data == b'{"doc": 42}' and (raw.headers or {}).get("nq_idem") == "e4-1"

    # Esto es lo que haría el listener DLQ: publicar el registro a nq.*.dlq.
    if ok:
        await js.add_stream(name=f"{STREAM}_DLQ", subjects=[f"{SUBJECT}.dlq"])
        record = {
            "stream_seq": seq,
            "payload": raw.data.decode(),
            "headers": dict(raw.headers or {}),
            "reason": "max_deliveries",
        }
        await js.publish(f"{SUBJECT}.dlq", json.dumps(record).encode())
        print("[dlq-capture] registro publicado en subject DLQ")

    await nc.close()
    print(f"\nE4 RESULT: {'PASS' if ok else 'FAIL'} — advisory + mensaje completo recuperable")
    raise SystemExit(0 if ok else 1)


asyncio.run(main())
