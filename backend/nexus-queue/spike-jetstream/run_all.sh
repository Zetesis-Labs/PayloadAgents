#!/usr/bin/env bash
# Banco de pruebas completo — "¿realista o porro?"
# Uso: ./run_all.sh   (requiere docker + uv + node en el host)
set -uo pipefail
cd "$(dirname "$0")"

echo "═══ E0: levantar NATS JetStream ═══"
docker compose up -d --wait
curl -sf http://127.0.0.1:8222/healthz > /dev/null || { echo "E0 FAIL — monitoring no responde"; exit 1; }
echo "E0 PASS — NATS arriba, monitoring :8222 OK"

declare -A results
run() {
  local name="$1"; shift
  echo; echo "═══ $name ═══"
  if "$@"; then results[$name]=PASS; else results[$name]="FAIL($?)"; fi
}

run "E2 nak-delay + backoff declarativo" uv run e2_nak_delay.py
run "E3 scale-to-zero lag (CRÍTICO)"     uv run e3_scale_to_zero_lag.py
run "E4 max_deliver → DLQ capture"       uv run e4_max_deliver_dlq.py
run "E6 handler largo + in_progress"     uv run e6_long_handler.py

echo; echo "═══ E5: cross-language TS→Python ═══"
npm install --silent
run "E5a producer TS (dedup msgID)"      node e5_producer.mjs
run "E5b consumer Python (headers)"      uv run e5_consumer.py

run "E1 taskiq ack semantics"            uv run e1_taskiq_ack_semantics.py
run "E7 contrato → codegen"              uv run e7_contract/generate.py

echo; echo "═══════════ RESUMEN ═══════════"
for k in "${!results[@]}"; do printf "%-40s %s\n" "$k" "${results[$k]}"; done
