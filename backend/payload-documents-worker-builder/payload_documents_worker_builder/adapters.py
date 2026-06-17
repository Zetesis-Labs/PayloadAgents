"""ZP-side adapters for the Nexus-Queue ports.

``PayloadJobState`` maps the standard :class:`JobStatePort` onto the Payload
documents collection's ``parse_*`` fields. ``ZpDocumentsAdapters`` is the
container handed to the handler as ``deps``.
"""

from __future__ import annotations

import contextlib
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

import httpx
from nexus_queue import JobStatus

from payload_documents_worker_builder.clients.payload import PayloadClient, PayloadError
from payload_documents_worker_builder.clients.types import ParseResultUpdate
from payload_documents_worker_builder.config import RuntimeConfig


class PayloadJobState:
    """``JobStatePort`` backed by the Payload documents ``parse_*`` fields."""

    def __init__(self, payload: PayloadClient, collection: str) -> None:
        self._payload = payload
        self._collection = collection

    async def processing(self, job_id: str, *, meta: Mapping[str, Any] | None = None) -> None:
        await self._payload.submit_parse_result(
            self._collection,
            job_id,
            {"parse_status": "processing", "parse_error": None},
        )

    async def complete(self, job_id: str, *, result: Mapping[str, Any]) -> None:
        update: ParseResultUpdate = {"parse_status": "done", "parse_error": None}
        text = result.get("parsed_text")
        if isinstance(text, str):
            update["parsed_text"] = text
        parsed_at = result.get("parsed_at")
        if isinstance(parsed_at, str):
            update["parsed_at"] = parsed_at
        await self._payload.submit_parse_result(self._collection, job_id, update)

    async def fail(self, job_id: str, *, error: str, permanent: bool) -> None:
        # Best-effort: never raise, so we don't shadow the original failure.
        with contextlib.suppress(PayloadError, httpx.HTTPError):
            await self._payload.submit_parse_result(
                self._collection,
                job_id,
                {"parse_status": "error", "parse_error": error[:500]},
            )

    async def get(self, job_id: str) -> JobStatus:
        # ZP dedups via the runtime's idempotency middleware, not via get();
        # parse_status isn't exposed on parse-context, so report CREATED.
        return JobStatus.CREATED


@dataclass(slots=True)
class ZpDocumentsAdapters:
    """Everything the parse-document handler needs, built from ``RuntimeConfig``."""

    payload_url: str
    internal_secret: str
    collection: str
    llama_api_key: str
    llama_base_url: str
    poll_interval_s: float
    poll_timeout_s: float

    @classmethod
    def from_config(cls, config: RuntimeConfig) -> ZpDocumentsAdapters:
        return cls(
            payload_url=str(config.payload_url),
            internal_secret=config.internal_secret.get_secret_value(),
            collection=config.documents_collection_slug,
            llama_api_key=config.llama_cloud_api_key.get_secret_value(),
            llama_base_url=str(config.llama_parse_base_url),
            poll_interval_s=config.llama_parse_poll_interval_s,
            poll_timeout_s=config.llama_parse_poll_timeout_s,
        )
