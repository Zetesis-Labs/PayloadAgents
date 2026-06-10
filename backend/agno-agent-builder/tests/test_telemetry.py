"""Tests for the httpx exclusion pattern fed to OTEL_PYTHON_HTTPX_EXCLUDED_URLS."""

from __future__ import annotations

import re

from agno_agent_builder.telemetry import httpx_exclusion_pattern


def _matches(pattern: str, url: str) -> bool:
    # Mirrors opentelemetry.util.http.ExcludeList.url_disabled (re.search).
    return bool(re.search(pattern, url))


class TestHttpxExclusionPattern:
    def test_default_http_port_is_optional(self) -> None:
        """httpx records http://host:80/x as http://host/x — both must match.

        This is the prod regression: PAYLOAD_URL=http://zp-prod-web:80 leaked
        every CMS poll as a detached root GET trace.
        """
        pattern = httpx_exclusion_pattern("http://zp-prod-web:80")
        assert _matches(pattern, "http://zp-prod-web/api/agents/internal/list")
        assert _matches(pattern, "http://zp-prod-web:80/api/agents/internal/list")

    def test_default_https_port_is_optional(self) -> None:
        pattern = httpx_exclusion_pattern("https://cms.example:443")
        assert _matches(pattern, "https://cms.example/api/x")
        assert _matches(pattern, "https://cms.example:443/api/x")

    def test_non_default_port_stays_literal(self) -> None:
        pattern = httpx_exclusion_pattern("http://app:3000")
        assert _matches(pattern, "http://app:3000/api/agents/internal/list")
        assert not _matches(pattern, "http://app/api/agents/internal/list")

    def test_no_port_matches_bare_host(self) -> None:
        pattern = httpx_exclusion_pattern("http://web")
        assert _matches(pattern, "http://web/api/x")

    def test_only_api_paths_are_excluded(self) -> None:
        """The LLM gateway and MCP calls must stay instrumented."""
        pattern = httpx_exclusion_pattern("http://app:3000")
        assert not _matches(pattern, "http://litellm:4000/v1/chat/completions")
        assert not _matches(pattern, "http://app:3030/mcp")

    def test_trailing_slash_in_base_url(self) -> None:
        pattern = httpx_exclusion_pattern("http://zp-prod-web:80/")
        assert _matches(pattern, "http://zp-prod-web/api/x")
