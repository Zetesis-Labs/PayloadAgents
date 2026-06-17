"""Parse-document handler on the Nexus-Queue runtime.

Same LlamaParse flow as before, but state transitions go through
``JobStatePort`` (mapped to Payload's ``parse_*`` fields) and the broker,
retry, DLQ, idempotency and tracing all come from ``nexus-queue``.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import structlog
from nexus_queue import JobStatePort, NexusPermanentError
from pydantic import BaseModel

from payload_documents_worker_builder.adapters import PayloadJobState, ZpDocumentsAdapters
from payload_documents_worker_builder.clients.llama_parse import (
    LlamaParseClient,
    LlamaParseError,
    LlamaParseJob,
)
from payload_documents_worker_builder.clients.payload import PayloadClient, PayloadError
from payload_documents_worker_builder.clients.types import ParseContext

PARSE_DOCUMENT_TASK_NAME = "zp.documents.parse"
DEFAULT_FILENAME = "upload.bin"

# Defensive limits before shipping a file to LlamaParse (cost guard). Security audit: M6.
MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100 MiB
ALLOWED_MIME_PREFIXES = (
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument",
    "text/",
    "image/",
)

logger = structlog.get_logger("payload_documents_worker_builder.parse_document")


class ParsePayload(BaseModel):
    document_id: str


class FileTooLargeError(Exception):
    """Raised when a Payload upload exceeds MAX_FILE_SIZE_BYTES."""


class UnsupportedMimeTypeError(Exception):
    """Raised when the upload's MIME type isn't on the allowlist."""


async def parse_document(payload: ParsePayload, deps: ZpDocumentsAdapters) -> None:
    """Download a Payload document, run LlamaParse, write the markdown back.

    Validation failures (too large / unsupported MIME) raise
    :class:`NexusPermanentError` so the runtime dead-letters them instead of
    retrying; transport errors propagate as retryable.
    """
    document_id = payload.document_id
    log = logger.bind(document_id=document_id, collection=deps.collection)
    log.info("Parse document task started")

    async with (
        PayloadClient(
            base_url=deps.payload_url,
            internal_secret=deps.internal_secret,
        ) as payload_client,
        LlamaParseClient(
            api_key=deps.llama_api_key,
            base_url=deps.llama_base_url,
        ) as llama,
    ):
        job_state: JobStatePort = PayloadJobState(payload_client, deps.collection)
        await job_state.processing(document_id)
        try:
            ctx, file_bytes = await _fetch_inputs(payload_client, deps, document_id, log)
            job = await _submit_to_llama(llama, ctx, file_bytes, log)
            await payload_client.submit_parse_result(
                deps.collection, document_id, {"parse_job_id": job.id}
            )
            markdown = await _poll_until_done(llama, job.id, deps, log)
            await job_state.complete(
                document_id,
                result={"parsed_text": markdown, "parsed_at": _now_iso()},
            )
            log.info("Parse document task succeeded")
        except (FileTooLargeError, UnsupportedMimeTypeError) as exc:
            log.warning("Parse rejected — permanent", error=str(exc))
            await job_state.fail(document_id, error=str(exc), permanent=True)
            raise NexusPermanentError(str(exc)) from exc
        except (LlamaParseError, PayloadError) as exc:
            log.exception("Parse document task failed — retryable")
            await job_state.fail(document_id, error=str(exc), permanent=False)
            raise


async def _fetch_inputs(
    payload: PayloadClient,
    deps: ZpDocumentsAdapters,
    document_id: str,
    log: structlog.stdlib.BoundLogger,
) -> tuple[ParseContext, bytes]:
    ctx = await payload.fetch_parse_context(deps.collection, document_id)

    mime_type = ctx.get("mimeType")
    if mime_type and not any(mime_type.startswith(p) for p in ALLOWED_MIME_PREFIXES):
        log.warning("Rejecting upload with unsupported MIME", mime_type=mime_type)
        raise UnsupportedMimeTypeError(
            f"MIME type {mime_type!r} not in allowlist; refusing to send to LlamaParse"
        )

    log.info("Downloading upload from Payload", filename=_resolve_filename(ctx))
    file_bytes = await payload.fetch_parse_file(deps.collection, document_id)

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        log.warning(
            "Rejecting upload over size limit",
            size=len(file_bytes),
            limit=MAX_FILE_SIZE_BYTES,
        )
        raise FileTooLargeError(
            f"File size {len(file_bytes)} bytes exceeds limit {MAX_FILE_SIZE_BYTES}; "
            "refusing to send to LlamaParse"
        )

    return ctx, file_bytes


async def _submit_to_llama(
    llama: LlamaParseClient,
    ctx: ParseContext,
    file_bytes: bytes,
    log: structlog.stdlib.BoundLogger,
) -> LlamaParseJob:
    filename = _resolve_filename(ctx)
    log.info("Uploading to LlamaParse", filename=filename, size=len(file_bytes))
    job = await llama.upload(
        file_bytes=file_bytes,
        filename=filename,
        language=ctx.get("language"),
        parsing_instruction=ctx.get("parsing_instruction"),
        mode=ctx.get("mode"),
    )
    log.info("LlamaParse job created", llama_job_id=job.id)
    return job


async def _poll_until_done(
    client: LlamaParseClient,
    job_id: str,
    deps: ZpDocumentsAdapters,
    log: structlog.stdlib.BoundLogger,
) -> str:
    deadline = asyncio.get_running_loop().time() + deps.poll_timeout_s
    while asyncio.get_running_loop().time() <= deadline:
        job = await client.status(job_id)
        if job.status == "SUCCESS":
            return await client.fetch_markdown(job_id)
        if job.status in ("ERROR", "CANCELLED"):
            raise LlamaParseError(
                f"LlamaParse job {job_id} ended in {job.status}: {job.error or 'no detail'}"
            )
        log.debug("Polling LlamaParse", status=job.status)
        await asyncio.sleep(deps.poll_interval_s)
    raise LlamaParseError(f"LlamaParse job {job_id} timed out after {deps.poll_timeout_s}s")


def _resolve_filename(ctx: ParseContext) -> str:
    filename = ctx.get("filename")
    return filename if isinstance(filename, str) and filename else DEFAULT_FILENAME


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()
