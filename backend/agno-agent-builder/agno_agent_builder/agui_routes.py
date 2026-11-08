"""AG-UI multi-agent endpoint with metrics-precision wrapper.

Exposes ``POST /agents/{slug}/agui`` that accepts a standard AG-UI
``RunAgentInput`` body and streams back the AG-UI event protocol, plus
a portal-specific ``CUSTOM agno_run_completed`` event after
``RUN_FINISHED`` carrying the real Agno ``RunMetrics``.

Why the wrapper:
    The stock ``agno.os.interfaces.agui.router.run_agent`` consumes
    Agno's own event stream and emits AG-UI events. Agno emits a
    ``RunCompletedEvent`` with full token metrics, but those never
    leak through the AG-UI translation. We tee the upstream stream to
    capture metrics, then surface them as a CUSTOM event the BFF
    consumes for the daily-token ledger.

Authentication is handled by ``InternalAuthMiddleware`` upstream — every
request must carry the shared ``X-Internal-Secret``. The portal's BFF
applies user-level access control before forwarding here.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Any

from ag_ui.core import (
    BaseEvent,
    CustomEvent,
    EventType,
    RunAgentInput,
    RunErrorEvent,
    RunStartedEvent,
)
from ag_ui.encoder import EventEncoder
from agno.os.interfaces.agui.input import extract_user_input, validate_state
from agno.os.interfaces.agui.stream import async_stream_agno_response_as_agui_events
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from agno_agent_builder.dependencies import get_registry
from agno_agent_builder.logging import get_logger
from agno_agent_builder.registry import AgentRegistry

logger = get_logger(__name__)


def build_agui_router() -> APIRouter:
    router = APIRouter(tags=["agui"])
    encoder = EventEncoder()

    @router.post("/agents/{slug}/agui")
    async def run_agent_agui(
        slug: str,
        run_input: RunAgentInput,
        registry: AgentRegistry = Depends(get_registry),
    ) -> StreamingResponse:
        agent = registry.get(slug)
        if agent is None:
            raise HTTPException(status_code=404, detail=f"Agent '{slug}' not found")

        async def generate() -> AsyncIterator[str]:
            try:
                async for event in _run_with_metrics(agent, run_input):
                    yield encoder.encode(event)
            except Exception as exc:  # pragma: no cover — defensive
                logger.exception("AG-UI run failed", slug=slug, thread_id=run_input.thread_id)
                yield encoder.encode(RunErrorEvent(type=EventType.RUN_ERROR, message=str(exc)))

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    return router


async def _run_with_metrics(agent: Any, run_input: RunAgentInput) -> AsyncIterator[BaseEvent]:
    """Run the agent and emit AG-UI events plus a final CUSTOM
    ``agno_run_completed`` event with Agno's real ``RunMetrics``.

    Mirrors ``agno.os.interfaces.agui.router.run_agent`` but tees the
    response stream so we can intercept Agno's ``RunCompletedEvent`` —
    the only place where token metrics live — without losing any of
    the AG-UI translation.
    """
    run_id = run_input.run_id or str(uuid.uuid4())

    try:
        user_input = extract_user_input(run_input.messages or [])

        yield RunStartedEvent(
            type=EventType.RUN_STARTED, thread_id=run_input.thread_id, run_id=run_id
        )

        forwarded_user_id = None
        if run_input.forwarded_props and isinstance(run_input.forwarded_props, dict):
            forwarded_user_id = run_input.forwarded_props.get("user_id")

        session_state = validate_state(run_input.state, run_input.thread_id)

        response_stream = agent.arun(
            input=user_input,
            session_id=run_input.thread_id,
            stream=True,
            stream_events=True,
            user_id=forwarded_user_id,
            session_state=session_state,
            run_id=run_id,
        )

        captured: dict[str, Any] = {}

        async def teed() -> AsyncIterator[Any]:
            async for upstream_event in response_stream:
                # Agno's own RunCompletedEvent carries `metrics` — capture
                # it for the trailing CUSTOM event. The exact name used
                # by Agno is "RunCompleted"; we match defensively.
                event_name = getattr(upstream_event, "event", None)
                if event_name in {"RunCompleted", "run_completed"}:
                    metrics = getattr(upstream_event, "metrics", None)
                    if metrics is not None:
                        try:
                            captured["metrics"] = metrics.to_dict()
                        except Exception:
                            logger.exception("Failed to serialise RunMetrics")
                yield upstream_event

        # Hold the terminal RUN_FINISHED so we can slot the metrics
        # CUSTOM event in BEFORE it. AG-UI's verifyEvents requires every
        # event to sit strictly between RUN_STARTED and RUN_FINISHED;
        # anything emitted after RUN_FINISHED breaks downstream clients.
        held_terminal: BaseEvent | None = None
        async for event in async_stream_agno_response_as_agui_events(
            response_stream=teed(),
            thread_id=run_input.thread_id,
            run_id=run_id,
        ):
            if event.type == EventType.RUN_FINISHED:
                held_terminal = event
                continue
            yield event

        if "metrics" in captured:
            yield CustomEvent(
                type=EventType.CUSTOM,
                name="agno_run_completed",
                value={
                    "metrics": captured["metrics"],
                    "run_id": run_id,
                    "thread_id": run_input.thread_id,
                },
            )

        if held_terminal is not None:
            yield held_terminal

    except Exception as exc:
        logger.exception("Agent run failed", thread_id=run_input.thread_id)
        yield RunErrorEvent(type=EventType.RUN_ERROR, message=str(exc))
