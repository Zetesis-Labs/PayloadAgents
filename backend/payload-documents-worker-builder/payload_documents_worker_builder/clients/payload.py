"""Tiny Payload CMS REST client used by built-in tasks.

The worker only needs:

* fetch the document context (parser knobs + filename)
* fetch the binary attached to that document
* stamp parse results back (parsed_text / parse_status / parse_error / ...)

All Payload-side calls go through dedicated internal endpoints exposed by the
``payload-documents`` plugin and authenticated with the shared
``X-Internal-Secret`` header. The endpoints use Payload's local API with
``overrideAccess: true`` server-side and the binary endpoint defers to a
host-provided resolver for the actual storage read, so the plugin stays
storage-agnostic and host apps can keep the documents collection's access
control honestly locked down (multi-tenant filters, admin-only writes, etc.)
without poking a service-account bypass into it.

Use as an async context manager so the underlying ``httpx.AsyncClient`` (and
its connection pool) is shared across all calls within one task instead of a
new TLS handshake per request::

    async with PayloadClient(base_url=..., internal_secret=...) as client:
        ctx = await client.fetch_parse_context(slug, doc_id)
        ...
"""

from __future__ import annotations

from types import TracebackType
from typing import Self

import httpx

from ._errors import make_raise_for_status
from .types import ParseContext, ParseResultUpdate

INTERNAL_SECRET_HEADER = "X-Internal-Secret"  # noqa: S105 — header name, not a secret value


class PayloadError(Exception):
    """Surfaced when Payload returns a non-2xx response."""


_raise_for_status = make_raise_for_status(PayloadError, "Payload")


class PayloadClient:
    """Async REST client. Use via ``async with`` to share the httpx pool."""

    def __init__(
        self,
        *,
        base_url: str,
        internal_secret: str,
        timeout: float = 60.0,
    ) -> None:
        if not base_url:
            raise PayloadError("Payload base URL is required")
        if not internal_secret:
            raise PayloadError("Internal secret is required for plugin endpoints")
        self._base_url = base_url.rstrip("/")
        self._headers = {INTERNAL_SECRET_HEADER: internal_secret}
        self._timeout = timeout
        self._http: httpx.AsyncClient | None = None

    async def __aenter__(self) -> Self:
        self._http = httpx.AsyncClient(timeout=self._timeout)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None

    async def fetch_parse_context(self, collection: str, doc_id: str | int) -> ParseContext:
        """GET the plugin's internal read endpoint.

        Returns a projection containing only the fields the worker needs to
        drive the parse: ``id, url, filename, mimeType, language,
        parsing_instruction, mode``.
        """
        path = self._endpoint(collection, doc_id, "parse-context")
        response = await self._client().get(path, headers=self._headers)
        _raise_for_status(response, f"GET {path}")
        context: ParseContext = response.json()
        return context

    async def fetch_parse_file(self, collection: str, doc_id: str | int) -> bytes:
        """GET the plugin's internal binary endpoint.

        The plugin defers the actual storage read to a host-provided resolver
        (S3/R2 GetObject, local fs, ...) and streams the result back.
        """
        path = self._endpoint(collection, doc_id, "parse-file")
        response = await self._client().get(path, headers=self._headers)
        _raise_for_status(response, f"GET {path}")
        return response.content

    async def submit_parse_result(
        self,
        collection: str,
        doc_id: str | int,
        data: ParseResultUpdate,
    ) -> None:
        """POST to the plugin's internal write endpoint.

        Body is whitelisted server-side; only the parse_* fields are accepted
        regardless of what we send.
        """
        path = self._endpoint(collection, doc_id, "parse-result")
        response = await self._client().post(path, headers=self._headers, json=dict(data))
        _raise_for_status(response, f"POST {path}")

    def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            raise PayloadError(
                "PayloadClient must be used inside `async with` (httpx pool not initialised)"
            )
        return self._http

    def _endpoint(self, collection: str, doc_id: str | int, op: str) -> str:
        return f"{self._base_url}/api/{collection}/{doc_id}/{op}"
