"""Tests for `agno_agent_builder.builder` — proxy model routing + key resolution."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno_agent_builder.builder import (
    build_agent,
    build_mcp_toolset,
    build_model,
    gateway_base_url,
    resolve_litellm_proxy_key,
)
from agno_agent_builder.exceptions import InvalidModelError, MissingLiteLlmVirtualKeyError
from agno_agent_builder.sources import AgentConfig
from pydantic import SecretStr


class TestBuildModelViaProxy:
    """Every model is routed through the LiteLLM proxy as an OpenAI-compatible
    endpoint, with BYOK forwarded via extra_body."""

    def test_proxy_routes_openai_with_byok(self) -> None:
        model = build_model(
            "openai/gpt-4o",
            "sk-agent-key",
            proxy_url="http://litellm:4000/v1",
            proxy_key="sk-virtual",
        )
        assert isinstance(model, OpenAIChat)
        assert model.id == "openai/gpt-4o"
        assert model.base_url == "http://litellm:4000/v1"
        assert model.api_key == "sk-virtual"
        assert model.extra_body == {"api_key": "sk-agent-key"}

    def test_proxy_routes_anthropic_as_openai_compatible(self) -> None:
        # Anthropic agents go through the proxy as OpenAI-compatible (no Claude
        # class); LiteLLM translates and uses the agent's key (BYOK).
        model = build_model(
            "anthropic/claude-sonnet-4-5",
            "sk-ant-agent",
            proxy_url="http://litellm:4000/v1",
            proxy_key="sk-virtual",
        )
        assert isinstance(model, OpenAIChat)
        assert model.id == "anthropic/claude-sonnet-4-5"
        assert model.extra_body == {"api_key": "sk-ant-agent"}

    def test_proxy_routes_catalog_preset_verbatim(self) -> None:
        # Catalog presets (no slash) pass through untouched — the gateway's
        # catalog resolves them to the real provider/model.
        model = build_model(
            "chat-premium",
            "sk-ant-agent",
            proxy_url="http://litellm:4000/v1",
            proxy_key="sk-virtual",
        )
        assert isinstance(model, OpenAIChat)
        assert model.id == "chat-premium"
        assert model.extra_body == {"api_key": "sk-ant-agent"}


class TestLiteLlmProxyKeyResolution:
    def _cfg(self, virtual_key: str | None = None) -> AgentConfig:
        return AgentConfig(
            slug="bastos",
            name="Bastos",
            llm_model="chat-premium",
            api_key=SecretStr("sk-ant-agent"),
            litellm_virtual_key=SecretStr(virtual_key) if virtual_key else None,
        )

    def test_uses_agent_virtual_key(self) -> None:
        assert resolve_litellm_proxy_key(self._cfg("sk-virtual")) == "sk-virtual"

    def test_fail_closed_when_virtual_key_missing(self) -> None:
        with pytest.raises(MissingLiteLlmVirtualKeyError) as exc:
            resolve_litellm_proxy_key(self._cfg())
        assert exc.value.details == {"slug": "bastos"}


class TestBuildAgent:
    """build_agent is what registry.load_all() calls per agent — guard its two
    fail-closed paths and the proxy wiring end-to-end."""

    def _cfg(
        self, *, llm_model: str = "chat-premium", virtual_key: str | None = "sk-virtual"
    ) -> AgentConfig:
        return AgentConfig(
            slug="bastos",
            name="Bastos",
            llm_model=llm_model,
            api_key=SecretStr("sk-ant-agent"),
            litellm_virtual_key=SecretStr(virtual_key) if virtual_key else None,
        )

    def _build(self, cfg: AgentConfig) -> Agent:
        return build_agent(
            cfg,
            db=MagicMock(),
            mcp_url="http://mcp:9000",
            litellm_proxy_url="http://litellm:4000/v1",
        )

    def test_malformed_model_raises_invalid_model_error(self) -> None:
        with pytest.raises(InvalidModelError) as exc:
            self._build(self._cfg(llm_model="/"))
        assert exc.value.details["slug"] == "bastos"

    def test_active_agent_without_virtual_key_fails_closed(self) -> None:
        with pytest.raises(MissingLiteLlmVirtualKeyError) as exc:
            self._build(self._cfg(virtual_key=None))
        assert exc.value.details == {"slug": "bastos"}

    def test_valid_config_routes_model_through_proxy(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # build_mcp_tools constructs a real MCPTools; stub it so the test stays a
        # pure unit of build_agent's wiring.
        monkeypatch.setattr(
            "agno_agent_builder.builder.build_mcp_tools",
            lambda mcp_url, cfg, proxy_key=None: MagicMock(),
        )

        agent = self._build(self._cfg())

        assert isinstance(agent, Agent)
        assert isinstance(agent.model, OpenAIChat)
        assert agent.model.base_url == "http://litellm:4000/v1"
        assert agent.model.api_key == "sk-virtual"
        assert agent.model.extra_body == {"api_key": "sk-ant-agent"}


class TestBuildMcpToolset:
    """The agent's MCP selection drives which MCPs it connects to, routed through
    the LiteLLM gateway; no selection keeps the single legacy direct URL."""

    def _cfg(self, mcp_servers: list[str]) -> AgentConfig:
        return AgentConfig(
            slug="bastos",
            name="Bastos",
            llm_model="chat-premium",
            api_key=SecretStr("sk-ant-agent"),
            litellm_virtual_key=SecretStr("sk-virtual"),
            mcp_servers=mcp_servers,
        )

    def test_gateway_base_strips_v1(self) -> None:
        assert gateway_base_url("http://litellm:4000/v1") == "http://litellm:4000"
        assert gateway_base_url("http://litellm:4000/") == "http://litellm:4000"

    def test_no_selection_uses_single_direct_url(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen: list[str] = []
        monkeypatch.setattr(
            "agno_agent_builder.builder.build_mcp_tools",
            lambda mcp_url, cfg, proxy_key=None: seen.append(mcp_url) or MagicMock(),
        )
        tools = build_mcp_toolset(
            self._cfg([]),
            mcp_url="http://mcp:9000",
            gateway_base="http://litellm:4000",
            proxy_key="sk-virtual",
        )
        assert len(tools) == 1
        assert seen == ["http://mcp:9000"]

    def test_selection_routes_each_through_gateway(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen: list[str] = []
        monkeypatch.setattr(
            "agno_agent_builder.builder.build_mcp_tools",
            lambda mcp_url, cfg, proxy_key=None: seen.append(mcp_url) or MagicMock(),
        )
        tools = build_mcp_toolset(
            self._cfg(["typesense_search", "pgvector_search"]),
            mcp_url="http://mcp:9000",
            gateway_base="http://litellm:4000",
            proxy_key="sk-virtual",
        )
        assert len(tools) == 2
        assert seen == [
            "http://litellm:4000/typesense_search/mcp",
            "http://litellm:4000/pgvector_search/mcp",
        ]
