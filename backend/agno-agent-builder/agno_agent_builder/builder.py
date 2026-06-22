"""Agent construction — maps `AgentConfig` records into Agno `Agent` instances."""

from __future__ import annotations

from agno.agent import Agent
from agno.db.postgres import PostgresDb
from agno.models.base import Model
from agno.models.openai import OpenAIChat
from agno.tools.mcp import MCPTools
from agno.tools.mcp.params import StreamableHTTPClientParams

from agno_agent_builder.exceptions import (
    InvalidModelError,
    MissingLiteLlmVirtualKeyError,
)
from agno_agent_builder.instructions import compose_instructions
from agno_agent_builder.retrieval_headers import build_retrieval_profile_headers
from agno_agent_builder.sources.types import AgentConfig


def build_agent(
    cfg: AgentConfig,
    *,
    db: PostgresDb,
    mcp_url: str,
    tool_protocol: str | None = None,
    output_format: str | None = None,
    litellm_proxy_url: str,
) -> Agent:
    """Construct an Agno Agent from a normalized AgentConfig."""
    llm_model = cfg.llm_model.strip()
    if not llm_model or llm_model.startswith("/") or llm_model.endswith("/"):
        raise InvalidModelError(slug=cfg.slug, llm_model=cfg.llm_model)

    proxy_key = resolve_litellm_proxy_key(cfg)

    return Agent(
        name=cfg.name,
        id=cfg.slug,
        model=build_model(
            llm_model,
            cfg.api_key.get_secret_value(),
            proxy_url=litellm_proxy_url,
            proxy_key=proxy_key,
        ),
        instructions=compose_instructions(
            cfg, tool_protocol=tool_protocol, output_format=output_format
        ),
        db=db,
        tools=build_mcp_toolset(
            cfg,
            mcp_url=mcp_url,
            gateway_base=gateway_base_url(litellm_proxy_url),
            proxy_key=proxy_key,
        ),
        add_history_to_context=True,
        num_history_runs=5,
        # Reasoning scaffolding stays OFF through the gateway: the preset hides
        # the real model from Agno's heuristic and native reasoners reason
        # server-side anyway; scaffolding doubles turns with a strict:true call
        # OpenAI rejects for map-shaped tool params and inflates the prompt.
        reasoning=False,
        tool_call_limit=cfg.tool_call_limit,
        telemetry=False,
    )


def resolve_litellm_proxy_key(cfg: AgentConfig) -> str:
    """The per-agent virtual key used to authenticate with the LiteLLM gateway.

    Fail-closed: an agent without a synced virtual key cannot reach the gateway.
    """
    if not cfg.litellm_virtual_key:
        raise MissingLiteLlmVirtualKeyError(slug=cfg.slug)
    return cfg.litellm_virtual_key.get_secret_value()


def build_model(
    llm_model: str,
    api_key: str,
    *,
    proxy_url: str,
    proxy_key: str,
) -> Model:
    """Route an agent's model through the LiteLLM proxy as an OpenAI-compatible
    endpoint.

    ``llm_model`` is a catalog preset name (or ``provider/model-id``) that
    travels verbatim; the gateway resolves it against its catalog. BYOK is
    preserved: the agent's own ``api_key`` goes per-request via ``extra_body``
    (the proxy uses it to call the real provider), while ``proxy_key`` (the
    per-agent virtual key) authenticates with the gateway. The proxy computes
    the real cost and reports it to Langfuse.
    """
    return OpenAIChat(
        id=llm_model,
        base_url=proxy_url,
        api_key=proxy_key,
        extra_body={"api_key": api_key},
    )


def gateway_base_url(litellm_proxy_url: str) -> str:
    """The LiteLLM gateway root (MCP endpoints live at ``/{alias}/mcp``, not under ``/v1``)."""
    return litellm_proxy_url.removesuffix("/v1").rstrip("/")


def build_mcp_toolset(
    cfg: AgentConfig,
    *,
    mcp_url: str,
    gateway_base: str,
    proxy_key: str,
) -> list[MCPTools]:
    """Resolve the agent's MCP tools.

    When the agent selects MCP servers, route each through the LiteLLM gateway
    at ``/{alias}/mcp`` (authenticated with the per-agent virtual key); the
    retrieval headers are forwarded to whichever server declares them. With no
    selection, fall back to the single direct MCP URL (legacy behaviour).
    """
    if not cfg.mcp_servers:
        return [build_mcp_tools(mcp_url, cfg)]
    # LiteLLM already namespaces each server's tools as `{alias}-{tool}` when routed
    # through /{alias}/mcp (verified against v1.82: Context7 exposes
    # `Context7-resolve-library-id`), so two backends sharing a tool name don't
    # collide — adding our own prefix would only double it.
    return [
        build_mcp_tools(f"{gateway_base}/{alias}/mcp", cfg, proxy_key=proxy_key)
        for alias in cfg.mcp_servers
    ]


def build_mcp_tools(mcp_url: str, cfg: AgentConfig, *, proxy_key: str | None = None) -> MCPTools:
    """Build an MCPTools instance, forwarding the agent's SearchProfile config as headers.

    When ``proxy_key`` is set the endpoint is the LiteLLM gateway, so the
    per-agent virtual key authenticates the connection.
    """
    headers: dict[str, str] = {}
    if proxy_key:
        headers["x-litellm-api-key"] = f"Bearer {proxy_key}"
        headers["Authorization"] = f"Bearer {proxy_key}"
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
    # Multi-profile (lente) catalog: the default's lente plus, when the agent has
    # more than one profile, the full catalog + per-profile config so the LLM can
    # pick one per query. The fields above already reflect the default profile.
    headers.update(build_retrieval_profile_headers(cfg.retrieval_profiles))
    if headers:
        params = StreamableHTTPClientParams(url=mcp_url, headers=headers)
        return MCPTools(server_params=params, transport="streamable-http")
    return MCPTools(url=mcp_url, transport="streamable-http")
