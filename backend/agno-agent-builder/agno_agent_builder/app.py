"""`create_app(config)` factory — wires AgentOS, registry, listener, lifespan."""

from __future__ import annotations

import asyncio
import contextlib
import hmac
import os
import signal
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, cast

from agno.agent import Agent, AgentFactory
from agno.agent.protocol import AgentProtocol
from agno.agent.remote import RemoteAgent
from agno.os import AgentOS
from fastapi import APIRouter, Depends, FastAPI, Header

from agno_agent_builder.agui_routes import build_agui_router
from agno_agent_builder.channels import (
    ChannelBinding,
    ChannelLoader,
    DiscordChannelLoader,
    TeamsChannelLoader,
    TelegramChannelLoader,
    WhatsAppChannelLoader,
)
from agno_agent_builder.config import RuntimeConfig
from agno_agent_builder.db import EngineHolder
from agno_agent_builder.dependencies import get_registry
from agno_agent_builder.exceptions import (
    AgentRuntimeError,
    AuthenticationError,
    agno_agent_builder_exception_handler,
)
from agno_agent_builder.health import router as health_router
from agno_agent_builder.identity_bind_middleware import IdentityBindMiddleware, IdentityBindState
from agno_agent_builder.logging import configure_logging, get_logger
from agno_agent_builder.middleware import (
    InternalAuthMiddleware,
    RequestIdMiddleware,
    SessionMetadataMiddleware,
)
from agno_agent_builder.registry import AgentRegistry
from agno_agent_builder.reload_listener import run_reload_listener
from agno_agent_builder.schemas import ErrorResponse, ReloadResponse
from agno_agent_builder.telemetry import configure_langfuse_tracing

_AgentList = list[Agent | RemoteAgent | AgentProtocol | AgentFactory]


def _agents_as_union(agents: list[Agent]) -> _AgentList:
    return cast(_AgentList, agents)


def create_app(config: RuntimeConfig) -> FastAPI:
    """Build a fully configured FastAPI app for the Agno runtime."""
    configure_logging(config.log_level)
    logger = get_logger(config.app_name)
    tracer_provider = configure_langfuse_tracing(config, logger)

    secret = config.internal_secret.get_secret_value()
    bind_state = IdentityBindState()
    channel_loaders: list[ChannelLoader] = [
        TelegramChannelLoader(),
        WhatsAppChannelLoader(),
        DiscordChannelLoader(),
        TeamsChannelLoader(),
    ]
    registry = AgentRegistry(
        source=config.agent_source,
        database_url=config.database_url,
        database_schema=config.database_schema,
        mcp_url=config.mcp_url,
        tool_protocol=config.tool_protocol,
        output_format=config.output_format,
        litellm_proxy_url=config.litellm_proxy_url,
        litellm_master_key=(
            config.litellm_master_key.get_secret_value() if config.litellm_master_key else None
        ),
    )
    engine_holder = EngineHolder(config.database_url)
    reload_lock = asyncio.Lock()

    async def reload_registry(_payload: str | None = None) -> None:
        async with reload_lock:
            await registry.reload()
            agent_os.agents = _agents_as_union(registry.all())
        logger.info(
            "Registry reloaded via notify", count=len(registry.all()), slugs=registry.slugs()
        )

    async def periodic_resync() -> None:
        while True:
            await asyncio.sleep(config.resync_interval_s)
            try:
                await reload_registry()
            except Exception:
                logger.exception("Periodic resync failed, will retry on next tick")

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.registry = registry
        app.state.engine_holder = engine_holder

        for attempt in range(1, config.boot_max_retries + 1):
            try:
                await registry.load_all()
                agent_os.agents = _agents_as_union(registry.all())
                logger.info("AgentOS initialised", agent_count=len(registry.all()))
                break
            except Exception:
                delay = min(config.boot_backoff_base**attempt, config.boot_backoff_max)
                if attempt < config.boot_max_retries:
                    logger.warning(
                        "Bootstrap failed, retrying",
                        attempt=attempt,
                        max_retries=config.boot_max_retries,
                        delay_s=delay,
                        exc_info=True,
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.critical(
                        "Failed to bootstrap after max retries — service will only expose health endpoints",
                        max_retries=config.boot_max_retries,
                        exc_info=True,
                    )

        # Channel installations: fetch each channel's installations from the
        # host CMS and mount one inbound interface per row. The bind
        # interceptor middleware is registered up-front; we populate its
        # state here so it knows which webhook paths + reply callbacks are
        # live. Skipped when payload_url isn't configured (CMS-agnostic
        # deployments don't use these channels).
        if config.payload_url:
            all_bindings: list[ChannelBinding] = []
            for loader in channel_loaders:
                try:
                    installations = await loader.fetch(
                        payload_url=config.payload_url, internal_secret=secret
                    )
                    if not installations:
                        continue
                    bindings = await loader.mount(app, registry, installations)
                    all_bindings.extend(bindings)
                    logger.info(
                        "Channel mounted",
                        channel=loader.channel,
                        installations=len(installations),
                        bindings=len(bindings),
                    )
                except Exception:
                    logger.exception(
                        "Channel bootstrap failed — continuing without it",
                        channel=loader.channel,
                    )
            if all_bindings:
                bind_state.update(all_bindings)

        async def restart_for_channel_change(_payload: str | None) -> None:
            # FastAPI doesn't support detaching the per-bot routers the channel
            # loaders mounted at boot, so the cleanest reaction to a channel-
            # installation change is a process restart — K8s replaces the pod
            # in a few seconds with the fresh installation set picked up at
            # boot. SIGTERM gives the shutdown handlers a chance to clean up
            # the engine + listener tasks; uvicorn turns it into a graceful
            # exit.
            logger.info("Channel reload notified — sending SIGTERM to self for clean restart")
            os.kill(os.getpid(), signal.SIGTERM)

        listener_task = asyncio.create_task(
            run_reload_listener(
                reload_registry,
                database_url=config.database_url,
                channel=config.reload_channel,
            )
        )
        channel_listener_task = asyncio.create_task(
            run_reload_listener(
                restart_for_channel_change,
                database_url=config.database_url,
                channel=config.channel_reload_channel,
            )
        )
        resync_task = asyncio.create_task(periodic_resync())
        yield
        for task in (listener_task, channel_listener_task, resync_task):
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

        logger.info("Shutting down — disposing shared DB engine")
        await engine_holder.dispose()
        if tracer_provider is not None:
            tracer_provider.shutdown()

    agent_os_kwargs: dict[str, Any] = {
        "telemetry": False,
        "authorization": False,
        "auto_provision_dbs": True,
        "tracing": bool(config.langfuse_host),
        **config.agent_os_kwargs,
    }
    agent_os = AgentOS(
        name=config.app_name,
        db=registry.db,
        agents=[],
        lifespan=lifespan,
        **agent_os_kwargs,
    )

    app: FastAPI = agent_os.get_app()
    app.add_middleware(SessionMetadataMiddleware)
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(InternalAuthMiddleware, secret=secret, public_paths=config.public_paths)
    # Bind interceptor is the OUTERMOST middleware (added last → runs first
    # in the chain) so it can short-circuit `/start <token>` (Telegram),
    # `connect <token>` (WhatsApp), `/connect <token>` (Discord), and
    # `bind <token>` (Teams) before the channel-specific routers see them.
    # Each channel's extractor validates its own request signature inline —
    # see channels.discord.loader for the Ed25519 path and channels.teams.loader
    # for Bot Framework JWT verification against the primed JWKS cache.
    # Telegram/WhatsApp signatures are still validated by agno's own interface
    # for non-bind passthrough requests.
    app.add_middleware(
        IdentityBindMiddleware,
        payload_url=config.payload_url or "",
        internal_secret=secret,
        state=bind_state,
    )
    app.add_exception_handler(AgentRuntimeError, agno_agent_builder_exception_handler)
    app.include_router(health_router)

    internal_router = APIRouter(prefix="/internal", tags=["internal"])

    @internal_router.post(
        "/agents/reload",
        response_model=ReloadResponse,
        responses={401: {"model": ErrorResponse}},
    )
    async def reload_agents(
        reg: AgentRegistry = Depends(get_registry),
        x_internal_secret: str | None = Header(default=None, alias="X-Internal-Secret"),
    ) -> ReloadResponse:
        if not hmac.compare_digest(x_internal_secret or "", secret):
            raise AuthenticationError()
        async with reload_lock:
            await reg.reload()
            agent_os.agents = _agents_as_union(reg.all())
        count = len(reg.all())
        logger.info("Agents reloaded", count=count, slugs=reg.slugs())
        return ReloadResponse(count=count, slugs=reg.slugs())

    app.include_router(internal_router)
    app.include_router(build_agui_router())

    return app
