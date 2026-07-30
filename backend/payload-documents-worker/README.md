# payload-documents-worker

Default consumer of [`payload-documents-worker-builder`](../payload-documents-worker-builder/). Lives in the workspace as a thin wrapper that loads env vars into a `RuntimeConfig` and runs the standard Nexus-Queue v2 worker — a single process with the JetStream receiver plus the probes/metrics HTTP server.

## Run

```bash
# Inside the devcontainer (or VS Code launch.json):
[ -f .env ] || cp .env.example .env
uv sync --all-packages

uv run python -m payload_documents_worker    # receiver + probes in one process
```

## Env

| Var | Required | What it is |
|---|---|---|
| `NATS_URL` | no | queue transport + KV idempotency; defaults to `nats://nats:4222` |
| `PAYLOAD_URL` | yes | base URL of the Payload API (`http://app:3000` in the devcontainer) |
| `LLAMA_CLOUD_API_KEY` | yes | LlamaCloud API key |
| `INTERNAL_SECRET` | yes | shared secret sent to apps/server (X-Internal-Secret) |
| `DOCUMENTS_COLLECTION_SLUG` | no | defaults to `documents` |
| `HTTP_PORT` | no | defaults to `8000` |
| `LOG_LEVEL` | no | defaults to `INFO` |
