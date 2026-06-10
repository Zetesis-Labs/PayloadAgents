"""ASGI middlewares (pure ASGI — safe for SSE streaming).

- ``RequestIdMiddleware``: propagates ``X-Request-ID`` via contextvars.
- ``InternalAuthMiddleware``: validates ``X-Internal-Secret`` on all
  routes except a configurable public allowlist.
- ``SessionMetadataMiddleware``: reads ``X-Tenant-Id`` on run requests
  and stashes ``{"tenant_id": ...}`` into ``request.state.metadata``.
"""

from __future__ import annotations

import hmac
import re
import uuid
from contextvars import ContextVar
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from agno_agent_builder.telemetry import detach_tenant_baggage, tenant_baggage_context

request_id_var: ContextVar[str] = ContextVar("request_id", default="")


class RequestIdMiddleware:
    """Extracts or generates X-Request-ID and propagates it via contextvars."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        rid = headers.get(b"x-request-id", b"").decode() or str(uuid.uuid4())
        request_id_var.set(rid)

        async def send_with_rid(message: Message) -> None:
            if message["type"] == "http.response.start":
                response_headers: list[tuple[bytes, bytes]] = list(message.get("headers", []))
                response_headers.append((b"x-request-id", rid.encode()))
                message["headers"] = response_headers
            await send(message)

        await self.app(scope, receive, send_with_rid)


class InternalAuthMiddleware:
    """Reject requests without a valid ``X-Internal-Secret`` header.

    Public paths are matched two ways: exact match for full paths
    (``/health``, ``/openapi.json``) and prefix match for entries ending in
    ``/`` (``/telegram/`` lets every per-bot webhook through, since each
    Telegram interface validates its own ``X-Telegram-Bot-Api-Secret-Token``).
    """

    def __init__(self, app: ASGIApp, *, secret: str, public_paths: tuple[str, ...]) -> None:
        self.app = app
        self._secret = secret
        exact: list[str] = []
        prefixes: list[str] = []
        for entry in public_paths:
            (prefixes if entry.endswith("/") else exact).append(entry)
        self._public_paths_exact = frozenset(exact)
        self._public_path_prefixes = tuple(prefixes)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")
        if path in self._public_paths_exact or any(
            path.startswith(p) for p in self._public_path_prefixes
        ):
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        token = headers.get(b"x-internal-secret", b"").decode()

        if not hmac.compare_digest(token, self._secret):
            await _send_401(send)
            return

        await self.app(scope, receive, send)


# Matches the per-agent endpoints that create or update an agno session
# row: the legacy AgentOS `/runs` route and the AG-UI `/agui` route.
_RUNS_PATH_RE = re.compile(r"^/agents/(?P<slug>[^/]+)/(runs|agui)/?$")


class SessionMetadataMiddleware:
    """Forward `X-Tenant-Id` from the portal into `request.state.metadata`."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") != "POST":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")
        match = _RUNS_PATH_RE.match(path)
        if not match:
            await self.app(scope, receive, send)
            return

        tenant_id = _header(scope, b"x-tenant-id")
        baggage_token: Any | None = None
        if tenant_id:
            state = scope.setdefault("state", {})
            existing = state.get("metadata") or {}
            existing["tenant_id"] = tenant_id
            state["metadata"] = existing
            slug = match.group("slug")
            baggage_token = tenant_baggage_context(
                tenant_id,
                agent_slug=slug,
                llm_model=_agent_llm_model(scope, slug),
            )

        try:
            await self.app(scope, receive, send)
        finally:
            if baggage_token is not None:
                detach_tenant_baggage(baggage_token)


def _agent_llm_model(scope: Scope, slug: str) -> str | None:
    """Resolve the agent's llm_model (catalog preset) from the app registry.

    Langfuse can only filter traces by tags, and the preset is otherwise
    buried in the gateway generation's metadata — surface it as a tag.
    """
    registry = getattr(getattr(scope.get("app"), "state", None), "registry", None)
    agent = registry.get(slug) if registry is not None else None
    model_id = getattr(getattr(agent, "model", None), "id", None)
    return str(model_id) if model_id else None


def _header(scope: Scope, name: bytes) -> str:
    for key, value in scope.get("headers", []):
        if key == name:
            return bytes(value).decode()
    return ""


async def _send_401(send: Send) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": 401,
            "headers": [(b"content-type", b"application/json")],
        }
    )
    await send({"type": "http.response.body", "body": b'{"error":"Unauthorized"}'})
