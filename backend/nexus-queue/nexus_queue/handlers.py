"""Handler registration with the cross-cutting concerns that need an ``around``
scope (which taskiq middleware hooks can't give): idempotency, tracing, latency.

A handler is ``async def h(payload, deps) -> None`` — it depends only on its
typed payload and the project's :class:`NexusAdapters`. ``register`` wraps it
so the same handler runs unchanged in any project.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

import structlog
from opentelemetry import trace
from opentelemetry.propagate import extract
from pydantic import BaseModel
from taskiq import AsyncBroker, Context, TaskiqDepends

from nexus_queue.config import RuntimeConfig
from nexus_queue.envelope import require_supported_version
from nexus_queue.lifecycle import IdempotencyStore
from nexus_queue.middleware.metrics import CONSUME_SECONDS
from nexus_queue.naming import LABEL_IDEM, LABEL_TENANT, LABEL_TRACE, SINGLE_TENANT

logger = structlog.get_logger("nexus_queue.handlers")
_tracer = trace.get_tracer("nexus_queue")

# deps is the project's adapter container; the handler types it to a Protocol
# of the ports it actually uses.
HandlerFn = Callable[[Any, Any], Awaitable[None]]


@dataclass(slots=True)
class HandlerSpec:
    """Binds a wire task name to a handler and its payload model."""

    task_name: str
    handler: HandlerFn
    payload_model: type[BaseModel]
    idempotent: bool = True


def register(broker: AsyncBroker, spec: HandlerSpec, config: RuntimeConfig) -> None:
    """Register ``spec.handler`` under its wire task name, wrapped with version
    check, idempotency dedup, an OTel consume span, and a latency histogram."""

    async def _run(context: Context = TaskiqDepends(), **kwargs: Any) -> None:
        labels = context.message.labels
        require_supported_version(labels)
        state = context.state

        if spec.idempotent:
            idem = labels.get(LABEL_IDEM)
            if idem:
                store: IdempotencyStore = state.nexus_idempotency
                if not await store.claim(str(idem)):
                    logger.info("duplicate-skipped", task=spec.task_name, idem=idem)
                    return

        adapters = state.nexus_adapters
        payload = spec.payload_model(**kwargs)

        traceparent = labels.get(LABEL_TRACE)
        parent = extract({"traceparent": str(traceparent)}) if traceparent else None
        with _tracer.start_as_current_span(
            f"nexus_queue.consume {spec.task_name}",
            context=parent,
        ) as span:
            span.set_attribute("nq.task", spec.task_name)
            span.set_attribute("nq.tenant", str(labels.get(LABEL_TENANT, SINGLE_TENANT)))
            with CONSUME_SECONDS.labels(config.project, config.queue, spec.task_name).time():
                await spec.handler(payload, adapters)

    _run.__name__ = "nexus_run_" + spec.task_name.replace(".", "_").replace(":", "_")
    broker.task(task_name=spec.task_name)(_run)
