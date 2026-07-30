"""The handler contract shared by every project.

A handler is ``async def h(payload, deps) -> None`` — it depends only on its
typed payload and the project's adapter container. :class:`HandlerSpec` binds it
to a wire task name and payload model; the NATS receiver
(:mod:`nexus_queue.nats_runtime`) dispatches to it with the cross-cutting
concerns (version gate, idempotency claim, OTel span, latency histogram).
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

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
