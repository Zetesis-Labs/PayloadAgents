"""Normalized agent configuration shape decoupled from any specific CMS."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, SecretStr


class LearnedHead(BaseModel):
    """Trained soft re-ranker (lente) weights over frozen embeddings.

    ``score(x) = w·embedding(x) + b``. ``w`` has the embedding's
    dimensionality (BGE-M3 → 1024). Forwarded to the MCP server so it can
    bias retrieval toward the profile's learned register.
    """

    model_config = ConfigDict(extra="forbid")

    w: list[float]
    b: float


class RetrievalProfile(BaseModel):
    """One selectable retrieval profile: hard filters + retrieval params + an
    optional lente. An agent may expose several; the LLM picks one per query
    via the MCP ``retrieval_profile`` argument.
    """

    model_config = ConfigDict(extra="forbid")

    slug: str
    name: str
    description: str = ""
    taxonomy_slugs: list[str] = []
    folder_slugs: list[str] = []
    reranker_kind: str | None = None
    reranker_model: str | None = None
    hybrid_alpha: float | None = None
    input_k: int | None = None
    top_k: int | None = None
    rewrite_template: str | None = None
    learned_head: LearnedHead | None = None


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
    # MCP server aliases (registered in the LiteLLM gateway) this agent uses.
    # When set, the builder routes each through the gateway `/{alias}/mcp`
    # instead of a single direct MCP URL.
    mcp_servers: list[str] = []
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
    # All retrieval profiles the agent can choose between. When >1, the builder
    # forwards the full catalog (+ each profile's lente) to the MCP server and
    # the agent selects one per query. The first entry is the default; its
    # filters/reranker populate the legacy single-profile fields above so
    # non-search tools and the RAG_CONFIG block stay scoped to it.
    retrieval_profiles: list[RetrievalProfile] = []
