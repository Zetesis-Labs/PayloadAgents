# /// script
# requires-python = ">=3.11"
# dependencies = ["nats-py>=2.9"]
# ///
"""E2 — Retry diferido nativo: NAK con delay + backoff declarativo del consumer.

Claims que verifica (informe §2.1 / mapeo §5):
  - "NAK con delay" produce una redelivery real tras ~delay (sin poller).
  - El `backoff` declarativo del consumer reprograma redeliveries sin código.

PASS: redelivery llega dentro de ±3s del delay pedido, num_delivered incrementa.
"""

import asyncio
import time

import nats
from nats.js.api import AckPolicy, ConsumerConfig, RetentionPolicy

URL = "nats://127.0.0.1:4222"
STREAM = "NQ_SPIKE_E2"
SUBJECT = "nq.spike.e2"


async def main() -> None:
    nc = await nats.connect(URL)
    js = nc.jetstream()

    try:
        await js.delete_stream(STREAM)
    except Exception:
        pass
    await js.add_stream(name=STREAM, subjects=[SUBJECT], retention=RetentionPolicy.WORK_QUEUE)

    # --- Parte A: NAK con delay explícito -----------------------------------
    psub = await js.pull_subscribe(
        SUBJECT,
        durable="e2_nak",
        config=ConsumerConfig(ack_policy=AckPolicy.EXPLICIT, ack_wait=120, max_deliver=5),
    )
    await js.publish(SUBJECT, b"job-a", headers={"nq_task": "e2", "nq_idem": "idem-a"})

    msgs = await psub.fetch(1, timeout=5)
    m = msgs[0]
    print(f"[A] delivery #1 (num_delivered={m.metadata.num_delivered})")
    delay_s = 10
    t0 = time.monotonic()
    await m.nak(delay=delay_s)
    print(f"[A] NAK con delay={delay_s}s — esperando redelivery…")

    redelivered = None
    while time.monotonic() - t0 < delay_s + 15:
        try:
            msgs = await psub.fetch(1, timeout=2)
            redelivered = msgs[0]
            break
        except Exception:
            continue

    if redelivered is None:
        print("[A] FAIL — no hubo redelivery")
        raise SystemExit(1)

    elapsed = time.monotonic() - t0
    drift = abs(elapsed - delay_s)
    print(
        f"[A] redelivery tras {elapsed:.1f}s (drift {drift:.1f}s), "
        f"num_delivered={redelivered.metadata.num_delivered}, "
        f"headers intactos={redelivered.headers}"
    )
    await redelivered.ack()
    ok_a = drift <= 3.0 and redelivered.metadata.num_delivered == 2

    # --- Parte B: backoff declarativo del consumer ---------------------------
    # La política de retry como CONFIG del consumer, no como código de middleware.
    # Nota: JetStream exige max_deliver > len(backoff), y los streams workqueue
    # solo admiten UN consumer por subject (aprendizaje E2-B) → stream propio.
    STREAM_B, SUBJECT_B = "NQ_SPIKE_E2B", "nq.spike.e2b"
    try:
        await js.delete_stream(STREAM_B)
    except Exception:
        pass
    await js.add_stream(name=STREAM_B, subjects=[SUBJECT_B], retention=RetentionPolicy.WORK_QUEUE)
    try:
        psub_b = await js.pull_subscribe(
            SUBJECT_B,
            durable="e2_backoff",
            config=ConsumerConfig(
                ack_policy=AckPolicy.EXPLICIT,
                backoff=[2, 5],
                max_deliver=3,
                ack_wait=2,  # con backoff, ack_wait debe casar con backoff[0]
            ),
        )
    except Exception as e:
        print(f"[B] config backoff rechazada por el server: {e}")
        print("[B] FAIL — revisar constraints (ack_wait vs backoff[0], max_deliver > len(backoff))")
        raise SystemExit(1)

    await js.publish(SUBJECT_B, b"job-b")
    t0 = time.monotonic()
    deliveries: list[float] = []
    while len(deliveries) < 3 and time.monotonic() - t0 < 20:
        try:
            msgs = await psub_b.fetch(1, timeout=2)
            deliveries.append(time.monotonic() - t0)
            print(f"[B] delivery #{len(deliveries)} en t={deliveries[-1]:.1f}s")
            # ni ack ni nak: dejamos que el backoff declarativo reprograme solo
        except Exception:
            continue

    # esperado: t≈0 (primera), t≈2 (backoff[0]), t≈7 (backoff[0]+backoff[1])
    ok_b = len(deliveries) == 3 and 1.0 <= deliveries[1] <= 4.5 and 5.5 <= deliveries[2] <= 10.5
    print(f"[B] timeline={['%.1f' % d for d in deliveries]} (esperado ~[0, 2, 7])")

    await nc.close()
    print(f"\nE2 RESULT: A(nak-delay)={'PASS' if ok_a else 'FAIL'}  B(backoff-declarativo)={'PASS' if ok_b else 'FAIL'}")
    raise SystemExit(0 if (ok_a and ok_b) else 1)


asyncio.run(main())
