# /// script
# requires-python = ">=3.11"
# dependencies = ["nats-py>=2.9"]
# ///
"""E5 (lado Python) — consume lo publicado por e5_producer.mjs.

PASS: exactamente 1 mensaje en el stream (el duplicado fue dedupeado por el
broker) y los 4 headers nq_* llegan íntegros del producer TS al worker Python.
"""

import asyncio
import json

import nats
from nats.js.api import AckPolicy, ConsumerConfig

URL = "nats://127.0.0.1:4222"
EXPECTED_HEADERS = {
    "nq_v": "1",
    "nq_task": "transcribe",
    "nq_idem": "xlang-idem-1",
    "nq_trace": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
}


async def main() -> None:
    nc = await nats.connect(URL)
    js = nc.jetstream()

    info = await js.stream_info("NQ_SPIKE_E5")
    n_msgs = info.state.messages
    print(f"[PY] mensajes en stream: {n_msgs} (esperado 1 — el duplicado no cuenta)")

    psub = await js.pull_subscribe(
        "nq.spike.e5",
        durable="e5_worker",
        config=ConsumerConfig(ack_policy=AckPolicy.EXPLICIT),
    )
    msgs = await psub.fetch(1, timeout=5)
    m = msgs[0]
    got = {k: v for k, v in (m.headers or {}).items() if k.startswith("nq_")}
    payload = json.loads(m.data)
    await m.ack()
    await nc.close()

    print(f"[PY] payload: {payload}")
    print(f"[PY] headers nq_*: {got}")

    headers_ok = got == EXPECTED_HEADERS
    dedup_ok = n_msgs == 1
    print(f"\nE5 RESULT: headers-íntegros={'PASS' if headers_ok else 'FAIL'} "
          f"dedup-en-stream={'PASS' if dedup_ok else 'FAIL'}")
    raise SystemExit(0 if (headers_ok and dedup_ok) else 1)


asyncio.run(main())
