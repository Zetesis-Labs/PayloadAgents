# /// script
# requires-python = ">=3.11"
# dependencies = ["nats-py>=2.9"]
# ///
"""E3 — EL EXPERIMENTO CRÍTICO: ¿ve KEDA un retry diferido con la flota a cero?

La justificación central de la migración (informe §2.1) es:

    "En JetStream el mensaje diferido vive en el consumer como pendiente,
     la señal de lag lo ve, y KEDA despierta al worker."

Si esto es falso, la migración pierde su argumento principal (la grieta de
scale-to-zero de Redis existiría también en NATS) y el veredicto es PORRO.

Método: reproducimos el escenario exacto y muestreamos el MISMO endpoint HTTP
de monitoring (:8222/jsz) que lee el scaler nats-jetstream de KEDA, registrando
TODAS las métricas del consumer durante la ventana de delay. La evaluación
final cruza esta timeline con la métrica concreta que use el scaler (ver
research en EVALUATION.md).

Escenarios:
  S1: mensaje publicado con CERO consumers conectados (nunca entregado).
  S2: mensaje entregado 1 vez → NAK con delay 45s → worker desconectado
      (simula scale-to-zero durante el backoff) → timeline de métricas.
  S3: reconexión ("KEDA despierta al worker") → ¿llega la redelivery?

PASS: en S1 y S2 alguna métrica del consumer visible en /jsz es >0 durante
      TODA la ventana, y en S3 la redelivery llega al reconectar.
"""

import asyncio
import json
import time
import urllib.request

import nats
from nats.js.api import AckPolicy, ConsumerConfig, RetentionPolicy

URL = "nats://127.0.0.1:4222"
MON = "http://127.0.0.1:8222"
STREAM = "NQ_SPIKE_E3"
SUBJECT = "nq.spike.e3"
DURABLE = "e3_worker"
NAK_DELAY_S = 45


def keda_view() -> dict:
    """Lee /jsz con detalle de consumers — la misma fuente que el scaler de KEDA."""
    with urllib.request.urlopen(f"{MON}/jsz?acc=%24G&streams=true&consumers=true", timeout=3) as r:
        data = json.load(r)
    for acc in data.get("account_details", []):
        for sd in acc.get("stream_detail", []):
            if sd.get("name") != STREAM:
                continue
            state = sd.get("state", {})
            for cd in sd.get("consumer_detail", []):
                if cd.get("name") == DURABLE:
                    return {
                        "stream_messages": state.get("messages"),
                        "num_pending": cd.get("num_pending"),
                        "num_ack_pending": cd.get("num_ack_pending"),
                        "num_redelivered": cd.get("num_redelivered"),
                        "num_waiting": cd.get("num_waiting"),
                    }
            return {"stream_messages": state.get("messages"), "consumer": "NOT_FOUND"}
    return {"error": "stream not found in /jsz"}


async def main() -> None:
    nc = await nats.connect(URL)
    js = nc.jetstream()
    try:
        await js.delete_stream(STREAM)
    except Exception:
        pass
    await js.add_stream(name=STREAM, subjects=[SUBJECT], retention=RetentionPolicy.WORK_QUEUE)

    # Crear el durable ANTES de publicar (como haría el chart via NACK CRD).
    psub = await js.pull_subscribe(
        SUBJECT,
        durable=DURABLE,
        config=ConsumerConfig(ack_policy=AckPolicy.EXPLICIT, ack_wait=300, max_deliver=5),
    )

    # --- S1: publicado, jamás entregado (flota a cero desde el principio) ----
    await js.publish(SUBJECT, b"cold-start", headers={"nq_idem": "e3-s1"})
    await asyncio.sleep(1)
    v = keda_view()
    print(f"[S1] sin consumir: {v}")
    s1_ok = (v.get("num_pending") or 0) > 0
    print(f"[S1] {'PASS' if s1_ok else 'FAIL'} — num_pending>0 visible sin consumers\n")

    # --- S2: entregado 1 vez, NAK(45s), worker muere -------------------------
    # Publicamos el job de S2 y consumimos AMBOS: el cold-start de S1 se ackea
    # (su assert ya corrió); el de S2 se NAK-ea y queda en vuelo.
    await js.publish(SUBJECT, b"nak-job", headers={"nq_idem": "e3-s2"})
    m = None
    for _ in range(2):
        for mm in await psub.fetch(2, timeout=5):
            if mm.data == b"cold-start":
                await mm.ack()
            else:
                m = mm
        if m is not None:
            break
    assert m is not None, "no llegó el mensaje de S2"
    print(f"[S2] delivery #1 (num_delivered={m.metadata.num_delivered}); NAK delay={NAK_DELAY_S}s")
    await m.nak(delay=NAK_DELAY_S)
    await nc.close()  # ← el worker "escala a cero" con el retry en vuelo
    print("[S2] worker desconectado — timeline de lo que ve KEDA en /jsz:\n")

    print(f"{'t(s)':>6} {'stream_msgs':>12} {'num_pending':>12} {'ack_pending':>12} {'redelivered':>12}")
    t0 = time.monotonic()
    timeline: list[dict] = []
    while time.monotonic() - t0 < NAK_DELAY_S + 20:
        v = keda_view()
        v["t"] = round(time.monotonic() - t0, 1)
        timeline.append(v)
        print(
            f"{v['t']:>6} {str(v.get('stream_messages')):>12} {str(v.get('num_pending')):>12} "
            f"{str(v.get('num_ack_pending')):>12} {str(v.get('num_redelivered')):>12}"
        )
        await asyncio.sleep(5)

    # ¿Alguna señal >0 durante TODA la ventana? (si en algún sample todo es 0,
    # KEDA con scale-to-zero jamás despertaría al worker → la grieta existe)
    def visible(sample: dict) -> bool:
        return any((sample.get(k) or 0) > 0 for k in ("num_pending", "num_ack_pending", "stream_messages"))

    gaps = [s["t"] for s in timeline if not visible(s)]
    s2_ok = not gaps
    print(f"\n[S2] {'PASS' if s2_ok else 'FAIL'} — "
          + ("señal visible en toda la ventana" if s2_ok else f"VENTANAS CIEGAS en t={gaps} → KEDA no despertaría al worker"))

    # --- S3: "KEDA despierta al worker" — reconectar y fetch -----------------
    nc2 = await nats.connect(URL)
    js2 = nc2.jetstream()
    psub2 = await js2.pull_subscribe(SUBJECT, durable=DURABLE)
    got = []
    t0 = time.monotonic()
    while not got and time.monotonic() - t0 < 30:
        try:
            for mm in await psub2.fetch(1, timeout=3):
                got.append(mm)
                print(f"[S3] recuperado: {mm.data!r} (num_delivered={mm.metadata.num_delivered})")
                await mm.ack()
        except Exception:
            continue
    # el NAK-eado de S2, redelivery real (num_delivered == 2)
    s3_ok = len(got) == 1 and got[0].data == b"nak-job" and got[0].metadata.num_delivered == 2
    print(f"[S3] {'PASS' if s3_ok else 'FAIL'} — redelivery del mensaje NAK-eado al reconectar")

    await nc2.close()
    print(f"\nE3 RESULT: S1={'PASS' if s1_ok else 'FAIL'} S2={'PASS' if s2_ok else 'FAIL'} S3={'PASS' if s3_ok else 'FAIL'}")
    raise SystemExit(0 if (s1_ok and s2_ok and s3_ok) else 1)


asyncio.run(main())
