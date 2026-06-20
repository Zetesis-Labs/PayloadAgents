"""Encode multi-profile retrieval state into MCP forward headers.

Mirrors the ZetesisPortal token proxy (`apps/server/.../api/search/mcp/route.ts`):
the agent connects to the MCP server with FIXED connection headers (it can't
peek each request like the proxy), so when an agent exposes more than one
retrieval profile we forward the WHOLE catalog up front:

- ``x-learned-head``     — the default profile's lente (base64 Float32LE [...w, b]).
- ``x-retrieval-profiles`` — base64 JSON catalog (slug/name/description, no weights)
  powering ``list_retrieval_profiles`` and the profile-selection guard.
- ``x-group-profiles``   — base64 JSON map slug → {filters, retrieval(+lente)} so the
  MCP ``search_collections``/``compare_perspectives`` tools resolve whichever
  profile the LLM picks per query.

Decoded MCP-side by ``auth/resolve.ts`` (``readAvailableProfiles`` /
``readGroupProfiles`` / ``decodeLearnedHead``).
"""

from __future__ import annotations

import base64
import json
import struct

from agno_agent_builder.sources.types import LearnedHead, RetrievalProfile


def encode_learned_head(head: LearnedHead) -> str:
    """Base64 of a little-endian Float32 ``[...w, b]`` blob (compact, binary)."""
    floats = [*head.w, head.b]
    packed = struct.pack(f"<{len(floats)}f", *floats)
    return base64.b64encode(packed).decode("ascii")


def _encode_b64_json(value: object) -> str:
    return base64.b64encode(json.dumps(value, separators=(",", ":")).encode("utf-8")).decode(
        "ascii"
    )


def _retrieval_payload(p: RetrievalProfile) -> dict[str, object]:
    return {
        "rerankerKind": p.reranker_kind,
        "rerankerModel": p.reranker_model,
        "inputK": p.input_k,
        "topK": p.top_k,
        "hybridAlpha": p.hybrid_alpha,
        "rewriteTemplate": p.rewrite_template,
        "learnedHead": encode_learned_head(p.learned_head) if p.learned_head else None,
    }


def build_retrieval_profile_headers(profiles: list[RetrievalProfile]) -> dict[str, str]:
    """Headers carrying the agent's multi-profile retrieval catalog.

    - 0 profiles → ``{}`` (legacy single-profile fields, set by the caller, stand).
    - 1 profile  → just its lente (``x-learned-head``); no catalog, so the MCP
      profile-selection guard stays off and the agent searches as before.
    - 2+ profiles → full catalog + per-profile config, so the agent must pick one
      per query and each pick applies its own lente/filters.
    """
    headers: dict[str, str] = {}
    if not profiles:
        return headers

    default = profiles[0]
    if default.learned_head:
        headers["x-learned-head"] = encode_learned_head(default.learned_head)

    if len(profiles) < 2:
        return headers

    catalog = [{"slug": p.slug, "name": p.name, "description": p.description} for p in profiles]
    headers["x-retrieval-profiles"] = _encode_b64_json(catalog)

    group = {
        p.slug: {
            "taxonomySlugs": p.taxonomy_slugs,
            "folderSlugs": p.folder_slugs,
            "retrieval": _retrieval_payload(p),
        }
        for p in profiles
        if p.slug
    }
    headers["x-group-profiles"] = _encode_b64_json(group)
    return headers
