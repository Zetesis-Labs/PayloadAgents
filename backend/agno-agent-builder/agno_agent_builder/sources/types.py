"""Normalized agent configuration shape decoupled from any specific CMS."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, SecretStr


class AgentConfig(BaseModel):
    """Per-agent configuration consumed by `build_agent`.

    Sources adapt their CMS-specific document shapes into this normalized
    model so the rest of the runtime is CMS-agnostic.
    """

    model_config = ConfigDict(extra="forbid")

    slug: str
    name: str
    llm_model: str
    api_key: SecretStr
    litellm_virtual_key: SecretStr | None = None
    instructions_extra: str | None = None
    tenant_slug: str | None = None
    taxonomy_slugs: list[str] = []
    folder_slugs: list[str] = []
    search_collections: list[str] = []
    tool_call_limit: int | None = None
    allow_guest_access: bool = False
    # Retrieval params sourced from the agent's `defaultRetrievalProfile`.
    # Forwarded as headers to the MCP server so it can run two-stage retrieval
    # (Typesense → reranker). All optional; missing fields fall back to MCP
    # defaults.
    reranker_kind: str | None = None
    reranker_model: str | None = None
    hybrid_alpha: float | None = None
    input_k: int | None = None
    top_k: int | None = None
    # Mustache template applied to the user query before retrieval. Supported
    # variables (resolved MCP-side): ``{{query}}``, ``{{tenant_slug}}``.
    rewrite_template: str | None = None
