"""Nexus-Queue conformance suite (plan M0).

Verifies that a runtime + transport pair honours the standard: naming,
envelope labels, typed payloads, retry/DLQ semantics, idempotency, metrics
and the cross-language producer round-trip (spec §14).

Written against the :mod:`tests.conformance.harness` interface so the same
assertions run on every transport. Today: Redis Streams. The NATS JetStream
harness plugs in with the v2 runtime (migration plan, phase M3).
"""
