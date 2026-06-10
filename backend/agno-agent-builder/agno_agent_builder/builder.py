"""Agent construction — maps `AgentConfig` records into Agno `Agent` instances."""

from __future__ import annotations

from agno.agent import Agent
from agno.db.postgres import PostgresDb
from agno.models.anthropic import Claude
from agno.models.base import Model
from agno.models.openai import OpenAIChat, OpenAIResponses
from agno.tools.mcp import MCPTools
from agno.tools.mcp.params import StreamableHTTPClientParams

from agno_agent_builder.exceptions import (
    GatewayRequiredError,
    InvalidModelError,
    UnsupportedProviderError,
)
from agno_agent_builder.instructions import compose_instructions
from agno_agent_builder.sources.types import AgentConfig

_OPENAI_RESPONSES_PREFIXES = ("o1", "o3", "o4", "gpt-4.1", "gpt-5")
_NATIVE_REASONER_PREFIXES = ("o1", "o3", "o4")


def build_agent(
    cfg: AgentConfig,
    *,
    db: PostgresDb,
    mcp_url: str,
    tool_protocol: str | None = None,
    output_format: str | None = None,
    litellm_proxy_url: str | None = None,
    litellm_master_key: str | None = None,
) -> Agent:
    """Construct an Agno Agent from a normalized AgentConfig."""
    llm_model = cfg.llm_model.strip()
    if not llm_model or llm_model.startswith("/") or llm_model.endswith("/"):
        raise InvalidModelError(slug=cfg.slug, llm_model=cfg.llm_model)

    is_native_reasoner = _is_native_reasoner(llm_model)

    return Agent(
        name=cfg.name,
        id=cfg.slug,
        model=build_model(
            llm_model,
            cfg.api_key.get_secret_value(),
            proxy_url=litellm_proxy_url,
            proxy_key=litellm_master_key,
        ),
        instructions=compose_instructions(
            cfg, tool_protocol=tool_protocol, output_format=output_format
        ),
        db=db,
        tools=[build_mcp_tools(mcp_url, cfg)],
        add_history_to_context=True,
        num_history_runs=5,
        reasoning=not is_native_reasoner,
        tool_call_limit=cfg.tool_call_limit,
        telemetry=False,
    )


def _is_native_reasoner(llm_model: str) -> bool:
    """Whether the model exposes native reasoning (no Agno scaffolding needed).

    For ``provider/model-id`` values the model id is checked. For catalog
    presets (no slash) the underlying model is unknown to the runtime, so the
    preset name itself is checked — name presets accordingly (e.g. ``o4-...``)
    or accept the default scaffolding.
    """
    _, _, model_id = llm_model.rpartition("/")
    return any(model_id.startswith(p) for p in _NATIVE_REASONER_PREFIXES)


def build_model(
    llm_model: str,
    api_key: str,
    *,
    proxy_url: str | None = None,
    proxy_key: str | None = None,
) -> Model:
    """Map an agent's ``llm_model`` to an Agno model instance.

    ``llm_model`` is either a ``provider/model-id`` pair or a catalog preset
    name (no slash) defined in the LiteLLM gateway's ``model_list``.

    When ``proxy_url`` is set, every model is routed through the LiteLLM proxy
    as an OpenAI-compatible endpoint — the value travels verbatim and the
    gateway resolves it against its model_list (catalog presets). BYOK is
    preserved: the agent's own ``api_key`` goes per-request via ``extra_body``
    (the proxy uses it to call the real provider), while ``proxy_key`` (the
    proxy master/virtual key) authenticates with the gateway. The proxy
    computes the real cost and reports it to Langfuse.

    Without a proxy only ``provider/model-id`` can be resolved — catalog
    presets require the gateway.
    """
    if proxy_url:
        return OpenAIChat(
            id=llm_model,
            base_url=proxy_url,
            api_key=proxy_key,
            extra_body={"api_key": api_key},
        )
    provider, sep, model_id = llm_model.partition("/")
    if not sep:
        raise GatewayRequiredError(llm_model=llm_model)
    if provider == "anthropic":
        return Claude(id=model_id, api_key=api_key)
    if provider == "openai":
        if any(model_id.startswith(p) for p in _OPENAI_RESPONSES_PREFIXES):
            return OpenAIResponses(id=model_id, api_key=api_key)
        return OpenAIChat(id=model_id, api_key=api_key)
    raise UnsupportedProviderError(provider=provider)


def build_mcp_tools(mcp_url: str, cfg: AgentConfig) -> MCPTools:
    """Build an MCPTools instance, forwarding the agent's SearchProfile config as headers."""
    headers: dict[str, str] = {}
    if cfg.tenant_slug:
        headers["x-tenant-slug"] = cfg.tenant_slug
    if cfg.taxonomy_slugs:
        headers["x-taxonomy-slugs"] = ",".join(cfg.taxonomy_slugs)
    if cfg.folder_slugs:
        headers["x-folder-slugs"] = ",".join(cfg.folder_slugs)
    if cfg.reranker_kind and cfg.reranker_kind != "none":
        headers["x-reranker-kind"] = cfg.reranker_kind
    if cfg.reranker_model:
        headers["x-reranker-model"] = cfg.reranker_model
    if cfg.hybrid_alpha is not None:
        headers["x-hybrid-alpha"] = str(cfg.hybrid_alpha)
    if cfg.input_k is not None:
        headers["x-input-k"] = str(cfg.input_k)
    if cfg.top_k is not None:
        headers["x-top-k"] = str(cfg.top_k)
    if cfg.rewrite_template:
        headers["x-query-rewrite-template"] = cfg.rewrite_template
    if headers:
        params = StreamableHTTPClientParams(url=mcp_url, headers=headers)
        return MCPTools(server_params=params, transport="streamable-http")
    return MCPTools(url=mcp_url, transport="streamable-http")
