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
from agno_agent_builder.sources.types import AgentConfig

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

    profile = (
        doc.get("defaultRetrievalProfile")
        if isinstance(doc.get("defaultRetrievalProfile"), dict)
        else None
    )
    if profile:
        taxonomy_slugs = _extract_taxonomy_slugs(profile.get("taxonomyFilters"))
        folder_slugs = _extract_folder_slugs(profile.get("folderFilters"))
        reranker = profile.get("reranker") if isinstance(profile.get("reranker"), dict) else None
        reranker_kind = (
            reranker.get("kind") if reranker and isinstance(reranker.get("kind"), str) else None
        )
        reranker_model = (
            reranker.get("model") if reranker and isinstance(reranker.get("model"), str) else None
        )
        hybrid_alpha = _coerce_float(profile.get("hybridAlpha"))
        input_k = _coerce_int(profile.get("inputK"))
        top_k = _coerce_int(profile.get("topK"))
        raw_rewrite = profile.get("queryRewrite")
        rewrite_template = (
            raw_rewrite.strip() if isinstance(raw_rewrite, str) and raw_rewrite.strip() else None
        )
        raw_collections = profile.get("searchCollections")
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
    )


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
