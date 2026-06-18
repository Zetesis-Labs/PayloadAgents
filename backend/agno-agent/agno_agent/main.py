"""ASGI entrypoint — `uvicorn agno_agent.main:app`."""

from __future__ import annotations

from agno_agent_builder import PayloadAgentSource, RuntimeConfig, create_app

from agno_agent.settings import Settings

settings = Settings()

app = create_app(
    RuntimeConfig(
        app_name=settings.app_name,
        agent_source=PayloadAgentSource(
            base_url=settings.payload_url,
            internal_secret=settings.internal_secret.get_secret_value(),
        ),
        mcp_url=settings.mcp_url,
        database_url=settings.database_url,
        database_schema=settings.database_schema,
        internal_secret=settings.internal_secret,
        payload_url=settings.payload_url,
        log_level=settings.log_level,
        langfuse_host=settings.langfuse_host,
        langfuse_public_key=settings.langfuse_public_key,
        langfuse_secret_key=settings.langfuse_secret_key,
        litellm_proxy_url=settings.litellm_proxy_url,
    )
)
