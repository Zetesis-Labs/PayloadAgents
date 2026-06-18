"""Tests for `agno_agent_builder.sources.payload`."""

from __future__ import annotations

import pytest
from agno_agent_builder.sources.payload import _extract_taxonomy_slugs, payload_doc_to_agent_config


class TestExtractTaxonomySlugs:
    def test_handles_populated_relationships(self) -> None:
        items = [{"slug": "bastos"}, {"slug": "filosofia"}]
        assert _extract_taxonomy_slugs(items) == ["bastos", "filosofia"]

    def test_handles_raw_string_ids(self) -> None:
        assert _extract_taxonomy_slugs(["bastos", "filosofia"]) == ["bastos", "filosofia"]

    def test_skips_unpopulated_int_ids(self) -> None:
        assert _extract_taxonomy_slugs([1, 2, 3]) == []

    def test_returns_empty_for_none(self) -> None:
        assert _extract_taxonomy_slugs(None) == []


class TestPayloadDocToAgentConfig:
    def _doc(self, **overrides: object) -> dict[str, object]:
        # Taxonomies + folders + retrieval params now live on the agent's
        # `defaultRetrievalProfile` relation (the Search Profile collection),
        # populated at depth=2 by the internal list endpoint.
        base: dict[str, object] = {
            "slug": "bastos",
            "name": "Bastos",
            "llmModel": "openai/o4-mini",
            "apiKey": "sk-test",
            "tenant": {"slug": "internal"},
            "defaultRetrievalProfile": {
                "taxonomyFilters": [{"slug": "bastos"}],
                "folderFilters": [],
                "searchCollections": ["posts_chunk"],
                "hybridAlpha": 0.5,
                "inputK": 50,
                "topK": 10,
                "queryRewrite": "{{query}} en filosofía libertaria austríaca",
                "reranker": {"kind": "deepinfra", "model": "BAAI/bge-reranker-v2-m3"},
            },
            "toolCallLimit": 5,
            "systemPrompt": "you are bastos",
        }
        base.update(overrides)
        return base

    def test_maps_full_doc(self) -> None:
        cfg = payload_doc_to_agent_config(self._doc())
        assert cfg.slug == "bastos"
        assert cfg.name == "Bastos"
        assert cfg.llm_model == "openai/o4-mini"
        assert cfg.api_key.get_secret_value() == "sk-test"
        assert cfg.litellm_virtual_key is None
        assert cfg.tenant_slug == "internal"
        assert cfg.taxonomy_slugs == ["bastos"]
        assert cfg.search_collections == ["posts_chunk"]
        assert cfg.tool_call_limit == 5
        assert cfg.instructions_extra == "you are bastos"
        assert cfg.reranker_kind == "deepinfra"
        assert cfg.reranker_model == "BAAI/bge-reranker-v2-m3"
        assert cfg.hybrid_alpha == 0.5
        assert cfg.input_k == 50
        assert cfg.top_k == 10
        assert cfg.rewrite_template == "{{query}} en filosofía libertaria austríaca"

    def test_maps_litellm_virtual_key_when_present(self) -> None:
        cfg = payload_doc_to_agent_config(self._doc(litellmVirtualKey="sk-litellm-agent"))
        assert cfg.litellm_virtual_key
        assert cfg.litellm_virtual_key.get_secret_value() == "sk-litellm-agent"

    def test_unpopulated_tenant_becomes_none(self) -> None:
        cfg = payload_doc_to_agent_config(self._doc(tenant=2))
        assert cfg.tenant_slug is None

    def test_missing_optional_fields(self) -> None:
        cfg = payload_doc_to_agent_config(
            {"slug": "x", "name": "X", "llmModel": "openai/gpt-4o", "apiKey": "k"}
        )
        assert cfg.taxonomy_slugs == []
        assert cfg.folder_slugs == []
        assert cfg.search_collections == []
        assert cfg.tool_call_limit is None
        assert cfg.instructions_extra is None
        assert cfg.reranker_kind is None
        assert cfg.reranker_model is None
        assert cfg.hybrid_alpha is None
        assert cfg.input_k is None
        assert cfg.top_k is None
        assert cfg.rewrite_template is None

    def test_invalid_tool_call_limit_falls_back_to_none(self) -> None:
        cfg = payload_doc_to_agent_config(self._doc(toolCallLimit="not-a-number"))
        assert cfg.tool_call_limit is None

    def test_falls_back_to_slug_when_name_missing(self) -> None:
        doc = self._doc()
        doc.pop("name")
        cfg = payload_doc_to_agent_config(doc)
        assert cfg.name == "bastos"

    def test_profile_without_reranker(self) -> None:
        doc = self._doc(
            defaultRetrievalProfile={
                "taxonomyFilters": [{"slug": "filosofia"}],
                "folderFilters": [],
                "searchCollections": ["books_chunk"],
            }
        )
        cfg = payload_doc_to_agent_config(doc)
        assert cfg.taxonomy_slugs == ["filosofia"]
        assert cfg.search_collections == ["books_chunk"]
        assert cfg.reranker_kind is None
        assert cfg.reranker_model is None

    def test_unpopulated_profile_is_ignored(self) -> None:
        # When the relation is depth=0 it comes through as a bare ID, not a
        # dict — we treat that as "no profile" and skip extraction.
        cfg = payload_doc_to_agent_config(self._doc(defaultRetrievalProfile=42))
        assert cfg.taxonomy_slugs == []
        assert cfg.folder_slugs == []
        assert cfg.reranker_kind is None

    @pytest.mark.parametrize("missing", ["slug", "llmModel", "apiKey"])
    def test_raises_on_required_missing(self, missing: str) -> None:
        doc = self._doc()
        doc[missing] = ""
        with pytest.raises(ValueError):
            payload_doc_to_agent_config(doc)
