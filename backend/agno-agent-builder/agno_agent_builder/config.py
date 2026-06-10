"""Runtime configuration accepted by `create_app`.

Pure data model — no env loading inside the library. Consumers build a
`RuntimeConfig` from their own settings layer (typically pydantic-settings)
and pass it to `create_app`.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, SecretStr

from agno_agent_builder.sources.base import AgentSource

DEFAULT_PUBLIC_PATHS: tuple[str, ...] = (
    "/health",
    "/ready",
    "/docs",
    "/openapi.json",
    # Trailing slash = prefix match. Each channel's interface validates its
    # own request signature (X-Telegram-Bot-Api-Secret-Token, X-Hub-Signature
    # for Meta/WhatsApp, Ed25519 for Discord, Bot Framework JWT for Teams),
    # so the global X-Internal-Secret is not required on incoming channel
    # webhooks.
    "/telegram/",
    "/whatsapp/",
    "/discord/",
    "/teams/",
)
DEFAULT_RELOAD_CHANNEL = "agent_reload"
# Channel-installation changes (telegram-bot-installations / whatsapp-installations /
# discord-installations) trigger a NOTIFY on this channel. The runtime listens
# and exits non-zero so K8s recreates the pod with the fresh installation set —
# FastAPI doesn't support runtime route detach for the dynamic per-bot routers
# the channel loaders mount at boot.
DEFAULT_CHANNEL_RELOAD_CHANNEL = "channel_reload"
DEFAULT_RESYNC_INTERVAL_S = 300.0
DEFAULT_BOOT_MAX_RETRIES = 10
DEFAULT_BOOT_BACKOFF_BASE = 2.0
DEFAULT_BOOT_BACKOFF_MAX = 30.0


class RuntimeConfig(BaseModel):
    """Top-level configuration for `create_app`."""

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")

    app_name: str
    agent_source: AgentSource
    mcp_url: str
    database_url: str
    internal_secret: SecretStr
    payload_url: str | None = (
        None  # Required for channel loaders (telegram/whatsapp/discord); optional for CMS-agnostic deployments
    )
    database_schema: str = "agno"
    log_level: str = "INFO"
    reload_channel: str = DEFAULT_RELOAD_CHANNEL
    channel_reload_channel: str = DEFAULT_CHANNEL_RELOAD_CHANNEL
    resync_interval_s: float = DEFAULT_RESYNC_INTERVAL_S
    boot_max_retries: int = DEFAULT_BOOT_MAX_RETRIES
    boot_backoff_base: float = DEFAULT_BOOT_BACKOFF_BASE
    boot_backoff_max: float = DEFAULT_BOOT_BACKOFF_MAX
    public_paths: tuple[str, ...] = DEFAULT_PUBLIC_PATHS
    tool_protocol: str | None = None
    output_format: str | None = None
    agent_os_kwargs: dict[str, Any] = Field(default_factory=dict)
    langfuse_host: str | None = None
    langfuse_public_key: SecretStr | None = None
    langfuse_secret_key: SecretStr | None = None
    # LiteLLM proxy (LLM gateway). When set, every agent is routed through the
    # proxy as an OpenAI-compatible endpoint so LiteLLM computes the real cost
    # and reports it to Langfuse. BYOK is preserved: each agent's own apiKey is
    # forwarded per-request via extra_body, while litellm_master_key authenticates
    # with the proxy. Leave unset for the direct provider path.
    litellm_proxy_url: str | None = None
    litellm_master_key: SecretStr | None = None
