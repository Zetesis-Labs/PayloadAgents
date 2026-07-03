"""Stream/group naming and envelope label keys for the Nexus-Queue wire contract.

Single source of truth for the strings that travel on the wire. Producers and
consumers in any language must agree on these; the TypeScript client mirrors
the same constants.
"""

from __future__ import annotations

import re

#: Wire-contract version. Bumped only on incompatible envelope changes.
NQ_VERSION = "1"

# ── Envelope label keys (carried in TaskiqMessage.labels) ──────────────────
LABEL_VERSION = "nq_v"
LABEL_TASK = "nq_task"
LABEL_TENANT = "nq_tenant"
LABEL_IDEM = "nq_idem"
LABEL_TRACE = "nq_trace"
LABEL_ENQUEUED_AT = "nq_enqueued_at"
LABEL_PRIORITY = "nq_priority"

#: Labels a conformant message MUST carry.
REQUIRED_LABELS: tuple[str, ...] = (
    LABEL_VERSION,
    LABEL_TASK,
    LABEL_TENANT,
    LABEL_ENQUEUED_AT,
)

#: Sentinel tenant for single-tenant deployments.
SINGLE_TENANT = "_"

_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def validate_slug(part: str, *, kind: str) -> str:
    """Reject slugs that would break the ``nq:{project}:{queue}`` scheme."""
    if not _SLUG.match(part):
        raise ValueError(f"Invalid {kind} {part!r}: must match [a-z0-9][a-z0-9-]*")
    return part


def work_stream(project: str, queue: str) -> str:
    """Redis stream key that carries work for a queue."""
    return f"nq:{project}:{queue}"


def consumer_group(project: str, queue: str) -> str:
    """Consumer group name for a queue's workers."""
    return f"nq:{project}:{queue}:cg"


def dlq_stream(project: str, queue: str) -> str:
    """Dead-letter stream key for a queue."""
    return f"nq:{project}:{queue}:dlq"


def delayed_set(project: str, queue: str) -> str:
    """Sorted-set key holding retries until their backoff elapses."""
    return f"nq:{project}:{queue}:delayed"


def status_stream(project: str) -> str:
    """Per-project status-event stream key."""
    return f"nq:{project}:status"


# ── NATS JetStream naming (transport v2) ───────────────────────────────────
# Mechanical mapping of the Redis names (spec §4.2): `nq:{p}:{q}` ⇄ `nq.{p}.{q}`.
# Stream/durable names replace hyphens: NATS identifiers reject them less
# predictably than subjects, and the codegen (contract → CRD) does the same.


def _nats_token(part: str) -> str:
    return part.replace("-", "_")


def work_subject(project: str, queue: str) -> str:
    """JetStream subject that carries work for a queue."""
    return f"nq.{project}.{queue}"


def dlq_subject(project: str, queue: str) -> str:
    """Dead-letter subject for a queue."""
    return f"nq.{project}.{queue}.dlq"


def nats_stream_name(project: str, queue: str) -> str:
    """JetStream stream holding the work subject."""
    return f"NQ_{_nats_token(project)}_{_nats_token(queue)}".upper()


def nats_dlq_stream_name(project: str, queue: str) -> str:
    """JetStream stream holding the dead-letter subject."""
    return f"{nats_stream_name(project, queue)}_DLQ"


def nats_durable_name(project: str, queue: str) -> str:
    """Durable consumer name for a queue's workers (the `:cg` equivalent)."""
    return f"nq_{_nats_token(project)}_{_nats_token(queue)}_cg"


def idempotency_redis_key(idem: str, *, project: str, tenant: str) -> str:
    """Redis key used by the idempotency middleware to dedup a message.

    Namespaced by project + tenant (like every other key here) so a shared Redis
    can't let one tenant poison another's dedup state or collide on a shared
    natural key.
    """
    return f"nq:{project}:idem:{tenant}:{idem}"
