"""Tests for `agno_agent_builder.exceptions` — exception shapes and HTTP handler."""

from __future__ import annotations

import json

import pytest
from agno_agent_builder.exceptions import (
    AgentRuntimeError,
    AuthenticationError,
    InvalidModelError,
    MissingApiKeyError,
    UnsupportedProviderError,
    agno_agent_builder_exception_handler,
)
from fastapi import Request
from fastapi.responses import JSONResponse


class TestExceptionShapes:
    def test_invalid_model_structured_payload(self) -> None:
        exc = InvalidModelError(slug="bastos", llm_model="bad")
        assert exc.code == "INVALID_LLM_MODEL"
        assert exc.http_status == 422
        assert exc.details == {"slug": "bastos", "llmModel": "bad"}

    def test_missing_api_key(self) -> None:
        exc = MissingApiKeyError(slug="bastos")
        assert exc.code == "MISSING_API_KEY"
        assert exc.http_status == 422
        assert exc.details == {"slug": "bastos"}

    def test_unsupported_provider(self) -> None:
        exc = UnsupportedProviderError(provider="cohere")
        assert exc.code == "UNSUPPORTED_PROVIDER"
        assert exc.http_status == 422
        assert exc.details == {"provider": "cohere"}

    def test_authentication_error_is_401(self) -> None:
        exc = AuthenticationError()
        assert exc.code == "AUTH_INVALID_SECRET"
        assert exc.http_status == 401


def _make_request(path: str = "/test") -> Request:
    """Build a minimal Request from an ASGI scope — enough for the handler."""
    scope = {
        "type": "http",
        "method": "GET",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [],
    }
    return Request(scope)


class TestExceptionHandler:
    @pytest.mark.asyncio
    async def test_returns_json_with_expected_envelope(self) -> None:
        exc = InvalidModelError(slug="bastos", llm_model="bad")
        request = _make_request()

        response = await agno_agent_builder_exception_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 422
        body = json.loads(response.body)
        assert body == {
            "error": {
                "code": "INVALID_LLM_MODEL",
                "message": "Invalid llmModel 'bad'; expected 'provider/model-id' or a catalog preset name",
                "details": {"slug": "bastos", "llmModel": "bad"},
            }
        }

    @pytest.mark.asyncio
    async def test_uses_exception_http_status(self) -> None:
        exc = AuthenticationError()
        response = await agno_agent_builder_exception_handler(_make_request(), exc)
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_default_base_error_is_500(self) -> None:
        exc = AgentRuntimeError("boom")
        response = await agno_agent_builder_exception_handler(_make_request(), exc)
        assert response.status_code == 500
