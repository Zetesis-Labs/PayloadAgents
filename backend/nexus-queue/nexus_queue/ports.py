"""Ports — the contract that makes workers movable across projects.

A handler depends only on these Protocols; each project provides the adapters
(e.g. ZP maps `JobStatePort` to a Payload document's ``parse_*`` fields, nixon
to its Postgres job state machine). Handlers never import a project's domain.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from enum import StrEnum
from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel, Field

from nexus_queue.naming import NQ_VERSION, SINGLE_TENANT


class JobStatus(StrEnum):
    """Minimal common job lifecycle. Projects may track richer states in their
    own store; this is the subset the ports speak."""

    CREATED = "created"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@runtime_checkable
class JobStatePort(Protocol):
    """Transitions the job's state in the project's system-of-record.

    The producer creates the job before enqueueing; the handler drives it from
    here. Implementations must be idempotent (``complete`` of an already
    completed job is a no-op)."""

    async def processing(self, job_id: str, *, meta: Mapping[str, Any] | None = None) -> None: ...

    async def complete(self, job_id: str, *, result: Mapping[str, Any]) -> None: ...

    async def fail(self, job_id: str, *, error: str, permanent: bool) -> None: ...

    async def get(self, job_id: str) -> JobStatus: ...


@runtime_checkable
class BlobStorePort(Protocol):
    """Binary storage behind an opaque reference (MinIO, Payload media, S3…)."""

    async def get(self, ref: str) -> bytes: ...

    async def put(self, ref: str, data: bytes, *, content_type: str) -> str: ...


@runtime_checkable
class IndexPort(Protocol):
    """Search index upserts/deletes (Typesense in both reference projects)."""

    async def upsert(self, collection: str, docs: Sequence[Mapping[str, Any]]) -> None: ...

    async def delete(self, collection: str, ids: Sequence[str]) -> None: ...


class StatusEvent(BaseModel):
    """Versioned status event published to ``nq:{project}:status``."""

    nq_v: str = Field(default=NQ_VERSION)
    job_id: str
    task: str
    tenant: str = Field(default=SINGLE_TENANT)
    state: JobStatus
    ts: str
    trace: str | None = None
    error: str | None = None


@runtime_checkable
class StatusEventPort(Protocol):
    """Emits a status event (push-status; generalizes nixon's domain-event stream)."""

    async def emit(self, event: StatusEvent) -> None: ...
