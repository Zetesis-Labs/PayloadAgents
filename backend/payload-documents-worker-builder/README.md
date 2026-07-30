# payload-documents-worker-builder

Parametrizable [Nexus-Queue](../nexus-queue/) v2 worker (NATS JetStream) for
Payload CMS documents, ready to drop into a workspace.

Provides:

- `RuntimeConfig` — pydantic config (one place for everything: NATS URL, Payload base URL, internal secret, LlamaCloud API key).
- `run_worker(config)` / `main_worker(config)` — the standard single-process entrypoint: JetStream receiver + probes/metrics HTTP (`/health`, `/ready`, `/metrics`).
- `parse_document` — built-in handler that uploads a Payload document to LlamaParse, polls until done, and writes `parsed_text` + `parse_status` back via Payload REST.

## Usage

```python
from payload_documents_worker_builder import RuntimeConfig, main_worker
from pydantic import SecretStr

config = RuntimeConfig(
    app_name="my-worker",
    nats_url="nats://nats:4222",
    payload_url="http://app:3000",
    llama_cloud_api_key=SecretStr("..."),
    internal_secret=SecretStr("dev"),  # sent to Payload as X-Internal-Secret
    documents_collection_slug="documents",
)

main_worker(config)  # single process: receiver + probes HTTP
```

## Architecture

```
   Next.js (Payload)                          worker (single process)
  ─────────────────────────────────         ─────────────────────────────
  POST /api/documents/{id}/parse            consume `documents.parse`
   ├ flips parse_status='pending'            ├ fetch file via /parse-file
   └ publishes to NATS (nq.zp.documents)     ├ upload to LlamaCloud
     via @zetesis/nexus-queue                ├ poll status
              │                              └ PATCH parsed_text/status
              │                                        │
              └────────── NATS JetStream ──────────────┘
```

## Public API

```python
from payload_documents_worker_builder import (
    RuntimeConfig,
    run_worker,
    main_worker,
    parse_document,
    ZpDocumentsAdapters,
    LlamaParseClient,
    PayloadClient,
)
```
