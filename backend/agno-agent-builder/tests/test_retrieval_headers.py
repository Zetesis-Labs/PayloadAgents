"""Tests for multi-profile retrieval header encoding.

The decode side lives in `@zetesis/mcp-typesense` (auth/resolve.ts); here we
assert the wire shape those decoders expect: base64 Float32LE for the lente and
base64 JSON for the catalog / group map.
"""

from __future__ import annotations

import base64
import json
import struct

from agno_agent_builder.retrieval_headers import (
    build_retrieval_profile_headers,
    encode_learned_head,
)
from agno_agent_builder.sources.types import LearnedHead, RetrievalProfile


def _decode_learned_head(blob: str) -> tuple[list[float], float]:
    buf = base64.b64decode(blob)
    floats = list(struct.unpack(f"<{len(buf) // 4}f", buf))
    return floats[:-1], floats[-1]


def _decode_b64_json(blob: str) -> object:
    return json.loads(base64.b64decode(blob).decode("utf-8"))


def _profile(slug: str, *, lente: LearnedHead | None = None, **kw: object) -> RetrievalProfile:
    return RetrievalProfile(slug=slug, name=slug.title(), learned_head=lente, **kw)


class TestEncodeLearnedHead:
    def test_round_trips_weights_and_bias(self) -> None:
        head = LearnedHead(w=[0.5, -0.25, 1.0], b=0.125)
        w, b = _decode_learned_head(encode_learned_head(head))
        assert b == 0.125
        assert w == [0.5, -0.25, 1.0]

    def test_blob_is_four_bytes_per_float(self) -> None:
        head = LearnedHead(w=[1.0] * 1024, b=0.0)
        buf = base64.b64decode(encode_learned_head(head))
        assert len(buf) == (1024 + 1) * 4


class TestBuildRetrievalProfileHeaders:
    def test_no_profiles_yields_no_headers(self) -> None:
        assert build_retrieval_profile_headers([]) == {}

    def test_single_profile_forwards_only_its_lente(self) -> None:
        headers = build_retrieval_profile_headers(
            [_profile("a", lente=LearnedHead(w=[1.0], b=0.0))]
        )
        assert "x-learned-head" in headers
        # No catalog/guard for a single profile.
        assert "x-retrieval-profiles" not in headers
        assert "x-group-profiles" not in headers

    def test_single_profile_without_lente_is_empty(self) -> None:
        assert build_retrieval_profile_headers([_profile("a")]) == {}

    def test_multi_profile_forwards_catalog_and_group_map(self) -> None:
        profiles = [
            _profile("global", description="cosine"),
            _profile(
                "neoplatonismo",
                description="lente neoplatónica",
                taxonomy_slugs=["plotino"],
                hybrid_alpha=0.7,
                lente=LearnedHead(w=[0.1, 0.2], b=0.3),
            ),
        ]
        headers = build_retrieval_profile_headers(profiles)

        catalog = _decode_b64_json(headers["x-retrieval-profiles"])
        assert [p["slug"] for p in catalog] == ["global", "neoplatonismo"]
        assert catalog[1]["description"] == "lente neoplatónica"

        group = _decode_b64_json(headers["x-group-profiles"])
        assert set(group) == {"global", "neoplatonismo"}
        assert group["neoplatonismo"]["taxonomySlugs"] == ["plotino"]
        assert group["neoplatonismo"]["retrieval"]["hybridAlpha"] == 0.7
        # Lente stays binary (base64) inside the JSON; global has none.
        assert isinstance(group["neoplatonismo"]["retrieval"]["learnedHead"], str)
        assert group["global"]["retrieval"]["learnedHead"] is None

    def test_multi_profile_default_lente_is_forwarded_flat(self) -> None:
        # profiles[0] (the default) also gets its lente as x-learned-head so
        # non-search tools stay scoped to it.
        profiles = [
            _profile("a", lente=LearnedHead(w=[1.0], b=0.0)),
            _profile("b"),
        ]
        headers = build_retrieval_profile_headers(profiles)
        assert "x-learned-head" in headers
        assert "x-group-profiles" in headers
