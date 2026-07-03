# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml>=6"]
# ///
"""E7 — Prototipo contrato→codegen (D13): ¿aguanta la abstracción con una cola real?

De UN contract.yaml emite:
  out/models.py        — pydantic (worker Python)
  out/types.ts         — zod (producer TS)
  out/stream.json      — StreamConfig JetStream (→ CRD NACK Stream)
  out/consumer.json    — ConsumerConfig JetStream (→ CRD NACK Consumer)
  out/scaledobject.yaml— KEDA ScaledObject (trigger nats-jetstream)

Prototipo honesto: soporta el subset de JSON Schema del caso real (object,
string, integer, boolean, array<string>). PASS = los 5 artefactos se generan
coherentes; la generación completa es trabajo de M1, no de este script.
"""

import json
import pathlib
import re

import yaml

HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)

contract = yaml.safe_load((HERE / "nq.zp.transcribe.contract.yaml").read_text())
schema_ref = contract["message"]["payload"]["$ref"]
schema = json.loads((HERE / schema_ref).read_text())

PY_TYPES = {"string": "str", "integer": "int", "number": "float", "boolean": "bool"}
TS_TYPES = {"string": "z.string()", "integer": "z.number().int()", "number": "z.number()", "boolean": "z.boolean()"}


def duration_to_seconds(v: str) -> int:
    m = re.fullmatch(r"(\d+)(s|m|h)", v)
    if not m:
        raise ValueError(f"duración inválida: {v}")
    n, unit = int(m.group(1)), m.group(2)
    return n * {"s": 1, "m": 60, "h": 3600}[unit]


# --- models.py (pydantic) -----------------------------------------------------
required = set(schema.get("required", []))
py_lines = [
    '"""GENERADO por e7_contract/generate.py — no editar a mano."""',
    "from pydantic import BaseModel, Field",
    "",
    "",
    f"class {schema['title']}(BaseModel):",
]
ts_fields = []
for name, prop in schema["properties"].items():
    if prop["type"] == "array":
        py_t, ts_t = f"list[{PY_TYPES[prop['items']['type']]}]", f"z.array({TS_TYPES[prop['items']['type']]})"
    else:
        py_t, ts_t = PY_TYPES[prop["type"]], TS_TYPES[prop["type"]]
    if name in required:
        py_lines.append(f"    {name}: {py_t}")
    else:
        default = prop.get("default")
        py_default = repr(default) if default is not None else ("[]" if prop["type"] == "array" else "None")
        if default is None and prop["type"] != "array":
            py_t = f"{py_t} | None"
        field = f"Field(default_factory=list)" if prop["type"] == "array" else py_default
        py_lines.append(f"    {name}: {py_t} = {field}")
        ts_t = f"{ts_t}.default({json.dumps(default)})" if default is not None else f"{ts_t}.optional()"
    ts_fields.append(f"  {name}: {ts_t},")
(OUT / "models.py").write_text("\n".join(py_lines) + "\n")

# --- types.ts (zod) -------------------------------------------------------------
ts = [
    "// GENERADO por e7_contract/generate.py — no editar a mano.",
    'import { z } from "zod";',
    "",
    f"export const {schema['title']}Schema = z.object({{",
    *ts_fields,
    "});",
    f"export type {schema['title']} = z.infer<typeof {schema['title']}Schema>;",
    "",
    f'export const CHANNEL = "{contract["channel"]}" as const;',
]
(OUT / "types.ts").write_text("\n".join(ts) + "\n")

# --- stream.json / consumer.json (→ CRDs NACK) ---------------------------------
policy = contract["policy"]
backoff_s = [duration_to_seconds(d) for d in policy["retry"]["backoff"]]
stream_cfg = {
    "name": contract["bindings"]["jetstream"]["stream"],
    "subjects": [contract["channel"]],
    "retention": "limits",  # E4: el mensaje debe seguir recuperable para el DLQ listener
    "storage": "file",
}
consumer_cfg = {
    "durable_name": contract["operations"]["receive"][0].replace("-", "_"),
    "filter_subject": contract["channel"],
    "ack_policy": "explicit",
    "ack_wait": duration_to_seconds(policy["processing_budget"]),
    "max_deliver": policy["retry"]["max_attempts"],
    "backoff": backoff_s,
    "deliver_policy": contract["bindings"]["jetstream"].get("deliver_policy", "all"),
}
(OUT / "stream.json").write_text(json.dumps(stream_cfg, indent=2) + "\n")
(OUT / "consumer.json").write_text(json.dumps(consumer_cfg, indent=2) + "\n")

# --- scaledobject.yaml (KEDA) ---------------------------------------------------
scaling = contract["scaling"]
worker = contract["operations"]["receive"][0]
scaled = {
    "apiVersion": "keda.sh/v1alpha1",
    "kind": "ScaledObject",
    "metadata": {"name": f"{worker}-scaler"},
    "spec": {
        "scaleTargetRef": {"name": worker},
        "minReplicaCount": 0 if scaling.get("scaleToZero") else 1,
        "triggers": [
            {
                "type": "nats-jetstream",
                "metadata": {
                    "natsServerMonitoringEndpoint": "nats.nats.svc:8222",
                    "account": "$G",
                    "stream": stream_cfg["name"],
                    "consumer": consumer_cfg["durable_name"],
                    "lagThreshold": str(scaling.get("lagThreshold", 10)),
                },
            }
        ],
    },
}
(OUT / "scaledobject.yaml").write_text(yaml.dump(scaled, sort_keys=False))

# --- verificación de coherencia -------------------------------------------------
# JetStream exige max_deliver > len(backoff); el codegen debe pillarlo, no el server.
ok = consumer_cfg["max_deliver"] > len(consumer_cfg["backoff"])
print("Generados:", sorted(p.name for p in OUT.iterdir()))
print(f"coherencia max_deliver({consumer_cfg['max_deliver']}) > len(backoff)({len(backoff_s)}): {ok}")
print((OUT / "models.py").read_text())
print(f"\nE7 RESULT: {'PASS' if ok else 'FAIL'}")
raise SystemExit(0 if ok else 1)
