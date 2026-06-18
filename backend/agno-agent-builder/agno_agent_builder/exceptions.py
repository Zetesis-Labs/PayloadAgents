"""Domain exceptions with HTTP mapping.

Each exception carries an ``http_status`` so the FastAPI handler can map it
without the domain code knowing about HTTP.
"""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse

from agno_agent_builder.logging import get_logger

logger = get_logger(__name__)


class AgentRuntimeError(Exception):
    """Base application error with structured error info."""

    http_status: int = 500

    def __init__(
        self,
        message: str,
        code: str = "INTERNAL_ERROR",
        details: dict[str, Any] | None = None,
    ) -> None:
        self.message = message
        self.code = code
        self.details: dict[str, Any] = details or {}
        super().__init__(message)


class AgentConfigError(AgentRuntimeError):
    """Invalid agent configuration from Payload."""

    http_status = 422


class InvalidModelError(AgentConfigError):
    """Malformed llmModel field."""

    def __init__(self, slug: str, llm_model: str) -> None:
        super().__init__(
            message=(
                f"Invalid llmModel {llm_model!r}; expected 'provider/model-id' or a catalog preset name"
            ),
            code="INVALID_LLM_MODEL",
            details={"slug": slug, "llmModel": llm_model},
        )


class MissingApiKeyError(AgentConfigError):
    """Agent has no API key configured."""

    def __init__(self, slug: str) -> None:
        super().__init__(
            message=f"Agent {slug!r} has no apiKey",
            code="MISSING_API_KEY",
            details={"slug": slug},
        )


class MissingLiteLlmVirtualKeyError(AgentConfigError):
    """Agent is active but has no synced LiteLLM virtual key."""

    def __init__(self, slug: str) -> None:
        super().__init__(
            message=f"Agent {slug!r} has no synced LiteLLM virtual key",
            code="MISSING_LITELLM_VIRTUAL_KEY",
            details={"slug": slug},
        )


class AuthenticationError(AgentRuntimeError):
    """Invalid or missing internal secret."""

    http_status = 401

    def __init__(self) -> None:
        super().__init__(
            message="Invalid internal secret",
            code="AUTH_INVALID_SECRET",
        )


async def agno_agent_builder_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Global exception handler — consistent JSON error responses.

    Signature matches Starlette's `add_exception_handler` callback shape
    (takes `Exception`, not the narrower `AgentRuntimeError`); the runtime
    type is guaranteed by the registration call but mypy can't see that.
    """
    if not isinstance(exc, AgentRuntimeError):
        raise exc
    logger.warning(
        "Request error",
        code=exc.code,
        message=exc.message,
        path=str(request.url.path),
        status=exc.http_status,
    )
    return JSONResponse(
        status_code=exc.http_status,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            }
        },
    )
