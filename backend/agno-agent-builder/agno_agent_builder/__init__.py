"""agno-agent — parametrizable Agno runtime as a library.

Build a fully configured FastAPI app from a `RuntimeConfig`:

    from agno_agent_builder import create_app, RuntimeConfig, PayloadAgentSource

    app = create_app(
        RuntimeConfig(
            app_name="my-runtime",
            agent_source=PayloadAgentSource(
                base_url="http://payload:3000",
                internal_secret=secret,
            ),
            mcp_url="http://mcp:3001/mcp",
            database_url="postgresql://...",
            internal_secret=secret,
        )
    )
"""

from __future__ import annotations

from agno_agent_builder.app import create_app
from agno_agent_builder.builder import build_agent, build_mcp_tools, build_model
from agno_agent_builder.config import (
    DEFAULT_BOOT_BACKOFF_BASE,
    DEFAULT_BOOT_BACKOFF_MAX,
    DEFAULT_BOOT_MAX_RETRIES,
    DEFAULT_CHANNEL_RELOAD_CHANNEL,
    DEFAULT_PUBLIC_PATHS,
    DEFAULT_RELOAD_CHANNEL,
    DEFAULT_RESYNC_INTERVAL_S,
    RuntimeConfig,
)
from agno_agent_builder.exceptions import (
    AgentConfigError,
    AgentRuntimeError,
    AuthenticationError,
    InvalidModelError,
    MissingApiKeyError,
    MissingLiteLlmVirtualKeyError,
)
from agno_agent_builder.instructions import (
    DEFAULT_OUTPUT_FORMAT,
    DEFAULT_TOOL_PROTOCOL,
    compose_instructions,
)
from agno_agent_builder.sources import AgentConfig, AgentSource, PayloadAgentSource

__all__ = [
    "DEFAULT_BOOT_BACKOFF_BASE",
    "DEFAULT_BOOT_BACKOFF_MAX",
    "DEFAULT_BOOT_MAX_RETRIES",
    "DEFAULT_CHANNEL_RELOAD_CHANNEL",
    "DEFAULT_OUTPUT_FORMAT",
    "DEFAULT_PUBLIC_PATHS",
    "DEFAULT_RELOAD_CHANNEL",
    "DEFAULT_RESYNC_INTERVAL_S",
    "DEFAULT_TOOL_PROTOCOL",
    "AgentConfig",
    "AgentConfigError",
    "AgentRuntimeError",
    "AgentSource",
    "AuthenticationError",
    "InvalidModelError",
    "MissingApiKeyError",
    "MissingLiteLlmVirtualKeyError",
    "PayloadAgentSource",
    "RuntimeConfig",
    "build_agent",
    "build_mcp_tools",
    "build_model",
    "compose_instructions",
    "create_app",
]
