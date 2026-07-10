"""Stream/group naming and envelope label keys for the Nexus-Queue wire contract.

Single source of truth for the strings that travel on the wire. Producers and
consumers in any language must agree on these; the TypeScript client mirrors
the same constants.
"""

from __future__ import annotations

import hashlib
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


def max_deliveries_advisory_subject(nats_stream: str, durable: str) -> str:
    """Subject the server publishes a MAX_DELIVERIES advisory on for a consumer."""
    return f"$JS.EVENT.ADVISORY.CONSUMER.MAX_DELIVERIES.{nats_stream}.{durable}"


def nats_advisory_stream_name(project: str, queue: str) -> str:
    """JetStream stream that durably captures the queue's MAX_DELIVERIES advisories.

    Exhausted messages are invisible to the worker and to KEDA (spike E4), so
    the advisory is their only exit to the DLQ. Capturing it in a stream (not a
    core-NATS subscription) makes it survive restarts and lets a durable
    consumer hand each advisory to exactly one replica.
    """
    return f"{nats_stream_name(project, queue)}_ADV"


def nats_advisory_durable_name(project: str, queue: str) -> str:
    """Durable consumer the workers share to process advisories once each."""
    return f"nq_{_nats_token(project)}_{_nats_token(queue)}_adv"


def idempotency_redis_key(idem: str, *, project: str, tenant: str) -> str:
    """Redis key used by the idempotency middleware to dedup a message.

    Namespaced by project + tenant (like every other key here) so a shared Redis
    can't let one tenant poison another's dedup state or collide on a shared
    natural key.
    """
    return f"nq:{project}:idem:{tenant}:{idem}"


# JetStream KV keys only allow this charset; nq_idem is a free-form producer
# string, so it travels hashed (see idempotency_kv_key).
_KV_UNSAFE = re.compile(r"[^-/_=.a-zA-Z0-9]")


def idempotency_kv_bucket(project: str) -> str:
    """JetStream KV bucket holding a project's ``nq_idem`` claims (D15/M10).

    Scoped like the Redis keys: project-wide, shared across the project's
    queues, so the two backends dedup over the same population.
    """
    return f"nq-idem-{project}"


def idempotency_kv_key(idem: str, *, tenant: str) -> str:
    """KV key for a claim: ``{tenant}.{sha256(idem)}``.

    The tenant segment keeps the per-tenant namespacing observable; the idem
    is hashed because KV keys forbid most free-form characters and the
    producer controls that string.
    """
    safe_tenant = _KV_UNSAFE.sub("-", tenant) or SINGLE_TENANT
    digest = hashlib.sha256(idem.encode()).hexdigest()
    return f"{safe_tenant}.{digest}"
