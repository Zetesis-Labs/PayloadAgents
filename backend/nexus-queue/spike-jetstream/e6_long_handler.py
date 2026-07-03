# /// script
# requires-python = ">=3.11"
# dependencies = ["nats-py>=2.9"]
# ///
"""E6 — Handlers largos vs ack_wait: extensión con in_progress().

Riesgo del plan (§7): "un job de transcripción de 20 min con ack_wait corto →
redeliveries espurias". Mitigación propuesta: heartbeat in_progress().

Método: ack_wait=5s, handler que "trabaja" 12s.
  A: con in_progress() cada 2s → esperado: num_delivered se queda en 1.
  B: sin extensión → esperado: redelivery (num_delivered >= 2).

PASS: A sin redelivery espuria Y B con redelivery (control del experimento).
"""

import asyncio

import nats
from nats.js.api import AckPolicy, ConsumerConfig, RetentionPolicy

URL = "nats://127.0.0.1:4222"
STREAM = "NQ_SPIKE_E6"
SUBJECT = "nq.spike.e6"
WORK_S = 12
ACK_WAIT_S = 5


async def run_case(js, durable: str, extend: bool) -> int:
    """Devuelve el num_delivered máximo observado para el mensaje."""
    # Stream propio por caso: workqueue solo admite un consumer por subject.
    stream, subject = f"{STREAM}_{durable.upper()}", f"{SUBJECT}.{durable}"
    try:
        await js.delete_stream(stream)
    except Exception:
        pass
    await js.add_stream(name=stream, subjects=[subject], retention=RetentionPolicy.WORK_QUEUE)
    psub = await js.pull_subscribe(
        subject,
        durable=durable,
        config=ConsumerConfig(ack_policy=AckPolicy.EXPLICIT, ack_wait=ACK_WAIT_S, max_deliver=5),
    )
    await js.publish(subject, f"long-job-{durable}".encode())

    msgs = await psub.fetch(1, timeout=5)
    m = msgs[0]
    max_delivered = m.metadata.num_delivered

    async def handler(msg) -> None:
        for i in range(WORK_S // 2):
            await asyncio.sleep(2)
            if extend:
                await msg.in_progress()
                print(f"  [{durable}] in_progress() en t={2 * (i + 1)}s")

    handler_task = asyncio.create_task(handler(m))

    # Mientras el handler "trabaja", vigilamos si hay redelivery espuria.
    t = 0.0
    while not handler_task.done():
        try:
            extra = await psub.fetch(1, timeout=1)
            for e in extra:
                max_delivered = max(max_delivered, e.metadata.num_delivered)
                print(f"  [{durable}] REDELIVERY espuria en t≈{t:.0f}s (num_delivered={e.metadata.num_delivered})")
                await e.term()  # no ensuciar el caso
        except Exception:
            pass
        t += 1

    await handler_task
    await m.ack()
    return max_delivered


async def main() -> None:
    nc = await nats.connect(URL)
    js = nc.jetstream()
    try:
        await js.delete_stream(STREAM)
    except Exception:
        pass
    await js.add_stream(name=STREAM, subjects=[SUBJECT], retention=RetentionPolicy.WORK_QUEUE)

    print(f"[A] handler {WORK_S}s, ack_wait {ACK_WAIT_S}s, CON in_progress():")
    a = await run_case(js, "e6_extend", extend=True)
    print(f"[A] num_delivered final = {a} (esperado 1)\n")

    print(f"[B] control: mismo caso SIN in_progress():")
    b = await run_case(js, "e6_noext", extend=False)
    print(f"[B] num_delivered final = {b} (esperado >= 2)")

    ok = a == 1 and b >= 2
    await nc.close()
    print(f"\nE6 RESULT: {'PASS' if ok else 'FAIL'} — A={a} B={b}")
    raise SystemExit(0 if ok else 1)


asyncio.run(main())
