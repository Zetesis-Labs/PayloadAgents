"""Tests for the RETRIEVAL_PROFILES guidance block."""

from __future__ import annotations

from agno_agent_builder.instructions import compose_instructions
from agno_agent_builder.sources.types import AgentConfig, RetrievalProfile


def _cfg(profiles: list[RetrievalProfile]) -> AgentConfig:
    return AgentConfig(
        slug="a",
        name="A",
        llm_model="openai/gpt-4o",
        api_key="k",  # type: ignore[arg-type]
        retrieval_profiles=profiles,
    )


def _profile(slug: str, desc: str = "") -> RetrievalProfile:
    return RetrievalProfile(slug=slug, name=slug.title(), description=desc)


def test_no_block_with_zero_or_one_profile() -> None:
    assert "<RETRIEVAL_PROFILES>" not in compose_instructions(_cfg([]))
    assert "<RETRIEVAL_PROFILES>" not in compose_instructions(_cfg([_profile("global")]))


def test_block_lists_profiles_and_mandates_selection() -> None:
    prompt = compose_instructions(
        _cfg([_profile("global", "cosine"), _profile("neoplatonismo", "lente neoplatónica")])
    )
    assert "<RETRIEVAL_PROFILES>" in prompt
    assert "- global: Global — cosine" in prompt
    assert "- neoplatonismo: Neoplatonismo — lente neoplatónica" in prompt
    assert "MUST select one" in prompt
    assert "retrieval_profile" in prompt
