"""Tests for `agno_agent_builder.builder.build_model` provider/model mapping."""

from __future__ import annotations

import pytest
from agno.models.anthropic import Claude
from agno.models.openai import OpenAIChat, OpenAIResponses
from agno_agent_builder.builder import build_model
from agno_agent_builder.exceptions import UnsupportedProviderError


class TestBuildModel:
    def test_anthropic_returns_claude(self) -> None:
        model = build_model("anthropic", "claude-sonnet-4-5", "sk-test")
        assert isinstance(model, Claude)
        assert model.id == "claude-sonnet-4-5"

    @pytest.mark.parametrize(
        "model_id", ["o1-preview", "o3-mini", "o4-mini", "gpt-4.1", "gpt-5-turbo"]
    )
    def test_openai_reasoning_series_returns_responses(self, model_id: str) -> None:
        model = build_model("openai", model_id, "sk-test")
        assert isinstance(model, OpenAIResponses)
        assert model.id == model_id

    @pytest.mark.parametrize("model_id", ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"])
    def test_openai_chat_series_returns_chat(self, model_id: str) -> None:
        model = build_model("openai", model_id, "sk-test")
        assert isinstance(model, OpenAIChat)
        assert model.id == model_id

    def test_unknown_provider_raises(self) -> None:
        with pytest.raises(UnsupportedProviderError) as exc:
            build_model("cohere", "command-r", "sk-test")
        assert exc.value.details == {"provider": "cohere"}
        assert exc.value.http_status == 422


class TestBuildModelViaProxy:
    """With proxy_url set, every model is routed through the LiteLLM proxy as an
    OpenAI-compatible endpoint, with BYOK forwarded via extra_body."""

    def test_proxy_routes_openai_with_byok(self) -> None:
        model = build_model(
            "openai",
            "gpt-4o",
            "sk-agent-key",
            proxy_url="http://litellm:4000/v1",
            proxy_key="sk-master",
        )
        assert isinstance(model, OpenAIChat)
        assert model.id == "openai/gpt-4o"
        assert model.base_url == "http://litellm:4000/v1"
        assert model.api_key == "sk-master"
        assert model.extra_body == {"api_key": "sk-agent-key"}

    def test_proxy_routes_anthropic_as_openai_compatible(self) -> None:
        # Anthropic agents go through the proxy as OpenAI-compatible (no Claude
        # class); LiteLLM translates and uses the agent's key (BYOK).
        model = build_model(
            "anthropic",
            "claude-sonnet-4-5",
            "sk-ant-agent",
            proxy_url="http://litellm:4000/v1",
            proxy_key="sk-master",
        )
        assert isinstance(model, OpenAIChat)
        assert model.id == "anthropic/claude-sonnet-4-5"
        assert model.extra_body == {"api_key": "sk-ant-agent"}

    def test_no_proxy_keeps_direct_path(self) -> None:
        model = build_model("anthropic", "claude-sonnet-4-5", "sk-test")
        assert isinstance(model, Claude)
