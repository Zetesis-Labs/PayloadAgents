"""Agent registry: pulls configs from a pluggable `AgentSource`."""

from __future__ import annotations

from agno.agent import Agent
from agno.db.postgres import PostgresDb

from agno_agent_builder.builder import build_agent
from agno_agent_builder.db import normalize_pg_url
from agno_agent_builder.logging import get_logger
from agno_agent_builder.sources.base import AgentSource

logger = get_logger(__name__)


class AgentRegistry:
    """Thread-safe (single event loop) registry of Agno agents keyed by slug."""

    def __init__(
        self,
        *,
        source: AgentSource,
        database_url: str,
        database_schema: str,
        mcp_url: str,
        tool_protocol: str | None = None,
        output_format: str | None = None,
        litellm_proxy_url: str | None = None,
        litellm_master_key: str | None = None,
    ) -> None:
        self._source = source
        self._mcp_url = mcp_url
        self._tool_protocol = tool_protocol
        self._output_format = output_format
        self._litellm_proxy_url = litellm_proxy_url
        self._litellm_master_key = litellm_master_key
        self._agents: dict[str, Agent] = {}
        self._db = PostgresDb(
            db_url=normalize_pg_url(database_url),
            db_schema=database_schema,
        )

    @property
    def db(self) -> PostgresDb:
        return self._db

    def get(self, slug: str) -> Agent | None:
        return self._agents.get(slug)

    def all(self) -> list[Agent]:
        return list(self._agents.values())

    def slugs(self) -> list[str]:
        return list(self._agents.keys())

    async def load_all(self) -> None:
        configs = await self._source.fetch_agents()
        new_agents: dict[str, Agent] = {}
        for cfg in configs:
            try:
                new_agents[cfg.slug] = build_agent(
                    cfg,
                    db=self._db,
                    mcp_url=self._mcp_url,
                    tool_protocol=self._tool_protocol,
                    output_format=self._output_format,
                    litellm_proxy_url=self._litellm_proxy_url,
                    litellm_master_key=self._litellm_master_key,
                )
            except Exception:
                logger.exception("Failed to build agent", slug=cfg.slug)
        self._agents = new_agents
        logger.info("Agents loaded", count=len(new_agents))

    async def reload(self) -> None:
        await self.load_all()
