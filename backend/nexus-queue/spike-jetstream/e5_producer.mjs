// E5 (lado TS) — Cross-language: producer nats.js → worker Python.
// Verifica: headers nq_* íntegros a través del wire + dedup por Nats-Msg-Id.
// Uso: npm install && node e5_producer.mjs   (luego: uv run e5_consumer.py)
import { connect, headers } from "nats";

const nc = await connect({ servers: "127.0.0.1:4222" });
const jsm = await nc.jetstreamManager();
const js = nc.jetstream();

try {
  await jsm.streams.delete("NQ_SPIKE_E5");
} catch {}
await jsm.streams.add({
  name: "NQ_SPIKE_E5",
  subjects: ["nq.spike.e5"],
  duplicate_window: 120 * 1e9, // 2 min en ns — la ventana de dedup del broker
});

const h = headers();
h.set("nq_v", "1");
h.set("nq_task", "transcribe");
h.set("nq_idem", "xlang-idem-1");
h.set("nq_trace", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");

const payload = JSON.stringify({ document_id: 42, lang: "es" });

// Publicamos DOS veces con el mismo msgID (= nq_idem): la segunda debe
// marcarse duplicate=true y NO añadirse al stream.
const ack1 = await js.publish("nq.spike.e5", new TextEncoder().encode(payload), {
  headers: h,
  msgID: "xlang-idem-1",
});
const ack2 = await js.publish("nq.spike.e5", new TextEncoder().encode(payload), {
  headers: h,
  msgID: "xlang-idem-1",
});

console.log(`[TS] publish #1: seq=${ack1.seq} duplicate=${ack1.duplicate}`);
console.log(`[TS] publish #2: seq=${ack2.seq} duplicate=${ack2.duplicate}`);

const dedupOk = ack1.duplicate === false && ack2.duplicate === true;
console.log(`[TS] dedup publish-side (Nats-Msg-Id): ${dedupOk ? "PASS" : "FAIL"}`);

await nc.drain();
process.exit(dedupOk ? 0 : 1);
