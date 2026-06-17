"""Pipeline routing: enqueue the next stage of a multi-step job, propagating
tenant + trace from the current message so the whole pipeline is one trace.

Single-stage workers (e.g. ZP documents) don't need this; nixon's split
pipeline does.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel
from taskiq import AsyncBroker, TaskiqMessage
from taskiq.kicker import AsyncKicker

from nexus_queue.config import RuntimeConfig
from nexus_queue.envelope import Envelope
from nexus_queue.naming import LABEL_PRIORITY, LABEL_TENANT, LABEL_TRACE, SINGLE_TENANT


class PipelineRouter:
    """Forwards a job to its next stage, carrying the envelope context over."""

    def __init__(self, broker: AsyncBroker, config: RuntimeConfig) -> None:
        self._broker = broker
        self._config = config

    async def forward(
        self,
        next_task: str,
        payload: BaseModel,
        *,
        source: TaskiqMessage,
    ) -> str:
        """Enqueue ``next_task`` propagating tenant/trace/priority from ``source``."""
        labels = source.labels
        envelope = Envelope(
            task=next_task,
            tenant=str(labels.get(LABEL_TENANT, SINGLE_TENANT)),
            trace=str(labels[LABEL_TRACE]) if labels.get(LABEL_TRACE) else None,
            priority=str(labels.get(LABEL_PRIORITY, "default")),
        )
        kicker: AsyncKicker[Any, Any] = AsyncKicker(
            task_name=next_task,
            broker=self._broker,
            labels=envelope.to_labels(),
        )
        task_obj = await kicker.kiq(**payload.model_dump())
        return str(task_obj.task_id)
