"""Tests for retrieval-profile header encoding.

Only references (slugs/catalog) are emitted — never lente weights. The decode +
weight resolution live MCP-side (auth/resolve.ts + Payload).
"""

from __future__ import annotations

import base64
import json

from agno_agent_builder.retrieval_headers import build_retrieval_profile_headers
from agno_agent_builder.sources.types import LearnedHead, RetrievalProfile


def _decode_b64_json(blob: str) -> object:
    return json.loads(base64.b64decode(blob).decode("utf-8"))


def _profile(slug: str, *, lente: LearnedHead | None = None, **kw: object) -> RetrievalProfile:
    return RetrievalProfile(slug=slug, name=slug.title(), learned_head=lente, **kw)


class TestBuildRetrievalProfileHeaders:
    def test_no_profiles_yields_no_headers(self) -> None:
        assert build_retrieval_profile_headers([]) == {}

    def test_single_profile_emits_only_the_default_slug(self) -> None:
        headers = build_retrieval_profile_headers([_profile("global")])
        assert headers == {"x-retrieval-profile": "global"}

    def test_never_emits_weights(self) -> None:
        # Even with a trained lente, no weights cross the boundary.
        headers = build_retrieval_profile_headers(
            [_profile("a", lente=LearnedHead(w=[1.0] * 1024, b=0.0)), _profile("b")]
        )
        assert "x-learned-head" not in headers
        assert "x-group-profiles" not in headers

    def test_multi_profile_emits_default_slug_plus_catalog(self) -> None:
        profiles = [
            _profile("global", description="cosine"),
            _profile("neoplatonismo", description="lente neoplatónica", taxonomy_slugs=["plotino"]),
        ]
        headers = build_retrieval_profile_headers(profiles)
        assert headers["x-retrieval-profile"] == "global"

        catalog = _decode_b64_json(headers["x-retrieval-profiles"])
        assert [p["slug"] for p in catalog] == ["global", "neoplatonismo"]
        assert catalog[1]["description"] == "lente neoplatónica"
        # Catalog is metadata only — no weights/filters leak.
        assert "learnedHead" not in catalog[0]
        assert "taxonomySlugs" not in catalog[1]

    def test_catalog_stays_tiny(self) -> None:
        # The whole point: headers stay small regardless of lente count.
        profiles = [_profile(f"p{i}", lente=LearnedHead(w=[0.1] * 1024, b=0.0)) for i in range(8)]
        headers = build_retrieval_profile_headers(profiles)
        total = sum(len(k) + len(v) for k, v in headers.items())
        assert total < 1024
