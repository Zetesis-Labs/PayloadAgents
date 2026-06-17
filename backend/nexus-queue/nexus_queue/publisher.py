"""Python producer. Stamps the standard envelope labels (and the current OTel
traceparent for end-to-end tracing) and enqueues onto the namespaced stream.

The TypeScript producer (`@zetesis/nexus-queue`) emits the same shape.
"""

from __future__ import annotations

from typing import Any

from opentelemetry.propagate import inject
from pydantic import BaseModel
from taskiq import AsyncBroker
from taskiq.kicker import AsyncKicker

from nexus_queue.config import RuntimeConfig
from nexus_queue.envelope import Envelope
from nexus_queue.naming import SINGLE_TENANT


def _current_traceparent() -> str | None:
    carrier: dict[str, str] = {}
    inject(carrier)
    return carrier.get("traceparent")


class Publisher:
    """Enqueues tasks by name with the Nexus-Queue envelope."""

    def __init__(self, broker: AsyncBroker, config: RuntimeConfig) -> None:
        self._broker = broker
        self._config = config

    async def enqueue(
        self,
        task: str,
        payload: BaseModel,
        *,
        tenant: str = SINGLE_TENANT,
        idempotency_key: str | None = None,
        priority: str = "default",
        trace: str | None = None,
    ) -> str:
        """Enqueue a typed payload; returns the taskiq task id."""
        return await self.enqueue_raw(
            task,
            payload.model_dump(),
            tenant=tenant,
            idempotency_key=idempotency_key,
            priority=priority,
            trace=trace,
        )

    async def enqueue_raw(
        self,
        task: str,
        payload: dict[str, Any],
        *,
        tenant: str = SINGLE_TENANT,
        idempotency_key: str | None = None,
        priority: str = "default",
        trace: str | None = None,
    ) -> str:
        """Enqueue a raw kwargs payload (used by the HTTP kicker)."""
        envelope = Envelope(
            task=task,
            tenant=tenant,
            idempotency_key=idempotency_key,
            trace=trace or _current_traceparent(),
            priority=priority,
        )
        kicker: AsyncKicker[Any, Any] = AsyncKicker(
            task_name=task,
            broker=self._broker,
            labels=envelope.to_labels(),
        )
        task_obj = await kicker.kiq(**payload)
        return str(task_obj.task_id)
