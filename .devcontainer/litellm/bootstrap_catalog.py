"""Idempotently seed LiteLLM DB model catalog for local dev."""

from __future__ import annotations

import json
import os
import time
import urllib.request
from typing import Any


def _json_request(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(  # noqa: S310 - internal LiteLLM URL from compose env.
        f"{BASE_URL}{path}",
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {MASTER_KEY}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310
        raw = response.read().decode("utf-8")
    return json.loads(raw) if raw else {}


def _existing_model_names() -> set[str]:
    last_error: Exception | None = None
    for _ in range(60):
        try:
            body = _json_request("GET", "/model/info")
            return {
                item["model_name"]
                for item in body.get("data", [])
                if isinstance(item, dict) and isinstance(item.get("model_name"), str)
            }
        except Exception as exc:  # pragma: no cover - exercised by compose startup
            last_error = exc
            time.sleep(2)

    raise RuntimeError(f"LiteLLM did not become ready for catalog bootstrap: {last_error}")


def _model_payload(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "model_name": item["name"],
        "litellm_params": {"model": item["model"]},
        "model_info": {
            "description": item.get("description", ""),
            "requires_key": item.get("requiresKey", ""),
            "catalog_tier": item.get("tier", ""),
        },
    }


BASE_URL = os.environ["LITELLM_URL"].rstrip("/")
MASTER_KEY = os.environ["LITELLM_MASTER_KEY"]
CATALOG = json.loads(os.environ["LITELLM_CATALOG_JSON"])

existing = _existing_model_names()
created = 0

for catalog_item in CATALOG:
    name = catalog_item["name"]
    if name in existing:
        continue
    _json_request("POST", "/model/new", _model_payload(catalog_item))
    created += 1

print(f"LiteLLM catalog bootstrap complete: created={created}, existing={len(existing)}")
