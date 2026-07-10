"""``python -m payload_documents_worker`` — the worker entrypoint.

Single-process JetStream worker (receiver + probes/metrics HTTP), built from
env via :class:`Settings`. Zero-Redis: queue transport and idempotency store
both live on NATS.
"""

from __future__ import annotations

import os

from payload_documents_worker_builder import RuntimeConfig, main_worker

from payload_documents_worker.settings import Settings


def main() -> None:
    settings = Settings()
    main_worker(
        RuntimeConfig(
            app_name="payload-documents-worker",
            nats_url=settings.nats_url,
            payload_url=settings.payload_url,
            documents_collection_slug=settings.documents_collection_slug,
            llama_cloud_api_key=settings.llama_cloud_api_key,
            llama_parse_base_url=settings.llama_parse_base_url,
            llama_parse_poll_interval_s=settings.llama_parse_poll_interval_s,
            llama_parse_poll_timeout_s=settings.llama_parse_poll_timeout_s,
            internal_secret=settings.internal_secret,
            log_level=settings.log_level,
        ),
        port=int(os.environ.get("HTTP_PORT", "8000")),
    )


if __name__ == "__main__":
    main()
