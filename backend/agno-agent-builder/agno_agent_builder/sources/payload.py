"""Payload CMS implementation of `AgentSource`.

Calls the dedicated internal endpoint on `@zetesis/payload-agents-core`
(`GET /api/<agents>/internal/list`) authenticated by `X-Internal-Secret`.
The endpoint runs Payload's local API with `overrideAccess: true` and
returns the active agents with apiKey decrypted + tenant populated and
``defaultRetrievalProfile`` populated at depth=2 so the runtime can read
the profile's ``taxonomyFilters`` / ``folderFilters`` slug chains directly.
"""

from __future__ import annotations

from typing import Any

import httpx
from pydantic import SecretStr

from agno_agent_builder.logging import get_logger
from agno_agent_builder.sources.types import AgentConfig, LearnedHead, RetrievalProfile

logger = get_logger(__name__)

_DEFAULT_TIMEOUT_S = 10.0
_DEFAULT_COLLECTION_SLUG = "agents"
INTERNAL_SECRET_HEADER = "X-Internal-Secret"  # noqa: S105 — header name, not a secret value


class PayloadAgentSource:
    """Fetches agent configs from Payload CMS via the plugin's internal endpoint."""

    def __init__(
        self,
        *,
        base_url: str,
        internal_secret: str,
        collection_slug: str = _DEFAULT_COLLECTION_SLUG,
        timeout_s: float = _DEFAULT_TIMEOUT_S,
    ) -> None:
        if not internal_secret:
            raise ValueError("internal_secret is required")
        self._base_url = base_url.rstrip("/")
        self._internal_secret = internal_secret
        self._collection_slug = collection_slug
        self._timeout_s = timeout_s

    async def fetch_agents(self) -> list[AgentConfig]:
        url = f"{self._base_url}/api/{self._collection_slug}/internal/list"
        headers = {INTERNAL_SECRET_HEADER: self._internal_secret}

        async with httpx.AsyncClient(timeout=self._timeout_s) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            data: dict[str, list[dict[str, Any]]] = response.json()

        configs: list[AgentConfig] = []
        for doc in data.get("docs", []):
            try:
                configs.append(payload_doc_to_agent_config(doc))
            except Exception:
                logger.exception("Skipping malformed Payload agent doc", agent_id=doc.get("id"))
        return configs


def payload_doc_to_agent_config(doc: dict[str, Any]) -> AgentConfig:
    """Map a Payload `agents` document into the normalized `AgentConfig`."""
    slug = doc.get("slug")
    if not isinstance(slug, str) or not slug:
        raise ValueError("agent document missing 'slug'")

    llm_model = doc.get("llmModel")
    if not isinstance(llm_model, str) or not llm_model:
        raise ValueError(f"agent {slug!r} missing 'llmModel'")

    api_key = doc.get("apiKey")
    if not isinstance(api_key, str) or not api_key:
        raise ValueError(f"agent {slug!r} missing 'apiKey'")
    litellm_virtual_key = doc.get("litellmVirtualKey")

    tenant = doc.get("tenant")
    tenant_slug = tenant.get("slug") if isinstance(tenant, dict) else None
    tenant_id = tenant.get("id") if isinstance(tenant, dict) else None

    # The agent can carry several retrieval profiles (`retrievalProfiles`, the
    # multi-lente catalog). Fall back to a legacy single `defaultRetrievalProfile`
    # during the transition. The first profile is the default: its filters /
    # reranker / collections populate the legacy single-profile fields so
    # non-search tools and the RAG_CONFIG block stay scoped to it.
    raw_profiles = doc.get("retrievalProfiles")
    profile_dicts = (
        [p for p in raw_profiles if isinstance(p, dict)]
        if isinstance(raw_profiles, list)
        else [p for p in [doc.get("defaultRetrievalProfile")] if isinstance(p, dict)]
    )
    retrieval_profiles = [_to_retrieval_profile(p) for p in profile_dicts]
    default = profile_dicts[0] if profile_dicts else None
    if default:
        taxonomy_slugs = _extract_taxonomy_slugs(default.get("taxonomyFilters"))
        folder_slugs = _extract_folder_slugs(default.get("folderFilters"))
        reranker = default.get("reranker") if isinstance(default.get("reranker"), dict) else None
        reranker_kind = (
            reranker.get("kind") if reranker and isinstance(reranker.get("kind"), str) else None
        )
        reranker_model = (
            reranker.get("model") if reranker and isinstance(reranker.get("model"), str) else None
        )
        hybrid_alpha = _coerce_float(default.get("hybridAlpha"))
        input_k = _coerce_int(default.get("inputK"))
        top_k = _coerce_int(default.get("topK"))
        raw_rewrite = default.get("queryRewrite")
        rewrite_template = (
            raw_rewrite.strip() if isinstance(raw_rewrite, str) and raw_rewrite.strip() else None
        )
        raw_collections = default.get("searchCollections")
        search_collections = (
            [s for s in raw_collections if isinstance(s, str)]
            if isinstance(raw_collections, list)
            else []
        )
    else:
        taxonomy_slugs = []
        folder_slugs = []
        reranker_kind = None
        reranker_model = None
        hybrid_alpha = None
        input_k = None
        top_k = None
        rewrite_template = None
        search_collections = []

    raw_limit = doc.get("toolCallLimit")
    tool_call_limit: int | None = None
    if raw_limit is not None:
        try:
            tool_call_limit = int(raw_limit)
        except (ValueError, TypeError):
            tool_call_limit = None

    return AgentConfig(
        slug=slug,
        name=doc.get("name") or slug,
        llm_model=llm_model,
        api_key=SecretStr(api_key),
        litellm_virtual_key=(
            SecretStr(litellm_virtual_key)
            if isinstance(litellm_virtual_key, str) and litellm_virtual_key
            else None
        ),
        instructions_extra=doc.get("systemPrompt")
        if isinstance(doc.get("systemPrompt"), str)
        else None,
        tenant_slug=tenant_slug,
        tenant_id=tenant_id,
        taxonomy_slugs=taxonomy_slugs,
        folder_slugs=folder_slugs,
        search_collections=search_collections,
        tool_call_limit=tool_call_limit,
        allow_guest_access=bool(doc.get("allowGuestAccess")),
        reranker_kind=reranker_kind,
        reranker_model=reranker_model,
        hybrid_alpha=hybrid_alpha,
        input_k=input_k,
        top_k=top_k,
        rewrite_template=rewrite_template,
        retrieval_profiles=retrieval_profiles,
    )


def _to_retrieval_profile(profile: dict[str, Any]) -> RetrievalProfile:
    """Map one populated SearchProfile doc into a normalized `RetrievalProfile`."""
    reranker = profile.get("reranker") if isinstance(profile.get("reranker"), dict) else None
    raw_rewrite = profile.get("queryRewrite")
    raw_slug = profile.get("slug")
    slug = raw_slug if isinstance(raw_slug, str) and raw_slug else ""
    raw_name = profile.get("name")
    raw_description = profile.get("description")
    return RetrievalProfile(
        slug=slug,
        name=raw_name if isinstance(raw_name, str) and raw_name else slug,
        description=raw_description if isinstance(raw_description, str) else "",
        taxonomy_slugs=_extract_taxonomy_slugs(profile.get("taxonomyFilters")),
        folder_slugs=_extract_folder_slugs(profile.get("folderFilters")),
        reranker_kind=(
            reranker.get("kind") if reranker and isinstance(reranker.get("kind"), str) else None
        ),
        reranker_model=(
            reranker.get("model") if reranker and isinstance(reranker.get("model"), str) else None
        ),
        hybrid_alpha=_coerce_float(profile.get("hybridAlpha")),
        input_k=_coerce_int(profile.get("inputK")),
        top_k=_coerce_int(profile.get("topK")),
        rewrite_template=(
            raw_rewrite.strip() if isinstance(raw_rewrite, str) and raw_rewrite.strip() else None
        ),
        learned_head=_extract_learned_head(profile.get("learnedHead")),
    )


def _extract_learned_head(head: Any) -> LearnedHead | None:
    """Pull trained weights off a populated `learnedHead` relation.

    Only applied when the lente is trained (``status == 'ready'``) and carries
    a valid ``weights`` blob. A bare id (unpopulated) or a draft/failed head
    yields None — the profile then ranks on cosine + reranker alone.
    """
    if not isinstance(head, dict) or head.get("status") != "ready":
        return None
    weights = head.get("weights")
    if not isinstance(weights, dict):
        return None
    w = weights.get("w")
    b = weights.get("b")
    if not isinstance(w, list) or not all(isinstance(x, (int, float)) for x in w):
        return None
    if not isinstance(b, (int, float)):
        return None
    return LearnedHead(w=[float(x) for x in w], b=float(b))


def _coerce_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _extract_taxonomy_slugs(taxonomies: Any) -> list[str]:
    if not isinstance(taxonomies, list):
        return []
    slugs: list[str] = []
    for item in taxonomies:
        if isinstance(item, dict) and isinstance(item.get("slug"), str):
            slugs.append(item["slug"])
        elif isinstance(item, str):
            slugs.append(item)
    return slugs


def _extract_folder_slugs(folders: Any) -> list[str]:
    """Pull the slug chain from each folder's breadcrumbs.

    A folder filed under ``Proyectos / 2026 / Q1`` indexes its docs with
    ``folder_slugs = ['proyectos', '2026', 'q1']``. To filter "everything
    under Q1" we forward the leaf slug (``q1``); Typesense matches all docs
    whose ``folder_slugs`` array contains it. We collect every slug in the
    breadcrumb so a user picking ``Proyectos`` selects the whole subtree.
    """
    if not isinstance(folders, list):
        return []
    slugs: list[str] = []
    for item in folders:
        if not isinstance(item, dict):
            continue
        breadcrumbs = item.get("breadcrumbs")
        if isinstance(breadcrumbs, list):
            for crumb in breadcrumbs:
                if not isinstance(crumb, dict):
                    continue
                url = crumb.get("url")
                if isinstance(url, str) and url:
                    slug = url.lstrip("/")
                    if slug:
                        slugs.append(slug)
        else:
            # Fallback: depth=0 may give us only the slug column
            fallback_slug = item.get("slug")
            if isinstance(fallback_slug, str) and fallback_slug:
                slugs.append(fallback_slug)
    # Dedupe preserving order
    return list(dict.fromkeys(slugs))
