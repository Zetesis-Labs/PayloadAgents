"""Encode the agent's retrieval-profile selection into MCP forward headers.

Only **references** cross to the MCP — never lente weights. The MCP resolves a
profile's filters + reranker + weights server-side from Payload by slug, so the
agent (and the LLM) never sees an embedding:

- ``x-retrieval-profile``  — the default profile's slug (used when the agent
  doesn't pick one explicitly, e.g. single-profile agents).
- ``x-retrieval-profiles`` — base64 JSON catalog (slug/name/description) for the
  ``list_retrieval_profiles`` tool and the profile-selection guard, sent only
  when there's a real choice (2+ profiles).

Decoded MCP-side by ``auth/resolve.ts``.
"""

from __future__ import annotations

import base64
import json

from agno_agent_builder.sources.types import RetrievalProfile


def _encode_b64_json(value: object) -> str:
    return base64.b64encode(json.dumps(value, separators=(",", ":")).encode("utf-8")).decode(
        "ascii"
    )


def build_retrieval_profile_headers(profiles: list[RetrievalProfile]) -> dict[str, str]:
    """Headers carrying the agent's profile *references* (no weights).

    - 0 profiles  → ``{}``.
    - 1 profile   → just ``x-retrieval-profile`` (the default); the MCP resolves
      and applies it to every search. No catalog, so the selection guard stays off.
    - 2+ profiles → default slug + the catalog, so the agent must pick one per
      query and the MCP resolves whichever it picks.
    """
    if not profiles:
        return {}

    headers: dict[str, str] = {}
    default = profiles[0]
    if default.slug:
        headers["x-retrieval-profile"] = default.slug

    if len(profiles) >= 2:
        catalog = [{"slug": p.slug, "name": p.name, "description": p.description} for p in profiles]
        headers["x-retrieval-profiles"] = _encode_b64_json(catalog)

    return headers
