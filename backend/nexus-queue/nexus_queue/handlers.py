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
from nexus_queue.exceptions import NexusRetryableError
from nexus_queue.lifecycle import ClaimOutcome, IdempotencyStorePort
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

        raw_idem = labels.get(LABEL_IDEM) if spec.idempotent else None
        idem = str(raw_idem) if raw_idem else None
        tenant = str(labels.get(LABEL_TENANT, SINGLE_TENANT))
        store: IdempotencyStorePort | None = state.nexus_idempotency if idem else None
        # Claim up front. DONE -> a prior attempt completed, skip. IN_PROGRESS ->
        # another live attempt holds it (or a crashed one whose lease hasn't
        # expired): raise so taskiq retries rather than dropping the message.
        if store is not None and idem:
            outcome = await store.claim(idem, tenant)
            if outcome is ClaimOutcome.DONE:
                logger.info("duplicate-skipped", task=spec.task_name, idem=idem)
                return
            if outcome is ClaimOutcome.IN_PROGRESS:
                logger.info("claim-in-progress", task=spec.task_name, idem=idem)
                raise NexusRetryableError(f"idempotency claim in progress: {idem}")

        adapters = state.nexus_adapters
        try:
            payload = spec.payload_model(**kwargs)

            traceparent = labels.get(LABEL_TRACE)
            parent = extract({"traceparent": str(traceparent)}) if traceparent else None
            with _tracer.start_as_current_span(
                f"nexus_queue.consume {spec.task_name}",
                context=parent,
            ) as span:
                span.set_attribute("nq.task", spec.task_name)
                span.set_attribute("nq.tenant", tenant)
                with CONSUME_SECONDS.labels(config.project, config.queue, spec.task_name).time():
                    await spec.handler(payload, adapters)
            # Mark the claim done (dedups later duplicates for the TTL). The
            # taskiq path has no heartbeat, so the in-progress lease is not
            # refreshed mid-run — idempotency_lease_s must exceed the handler's
            # runtime on this transport, else a concurrent same-idem could take
            # the claim over.
            if store is not None and idem:
                await store.mark_done(idem, tenant)
        except Exception:
            # Release the claim so a legitimate retry can re-claim — otherwise the
            # up-front claim would make the retry skip itself as a phantom dup.
            if store is not None and idem:
                await store.release(idem, tenant)
            raise

    _run.__name__ = "nexus_run_" + spec.task_name.replace(".", "_").replace(":", "_")
    broker.task(task_name=spec.task_name)(_run)
