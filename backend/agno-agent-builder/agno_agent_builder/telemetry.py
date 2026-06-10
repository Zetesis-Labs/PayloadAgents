"""Langfuse/OpenTelemetry wiring for the Agno runtime.

Single-project mode: all spans are exported to one Langfuse project
configured via ``LANGFUSE_PUBLIC_KEY`` / ``LANGFUSE_SECRET_KEY``.
Per-tenant isolation lives in the trace metadata + tags so a superadmin
can filter the global project by ``tenant_id`` in the Langfuse UI.

Per-tenant projects (one Langfuse project per Payload tenant) requires
Langfuse Enterprise license for the SCIM / org-scoped API surface; that
path is intentionally not wired here.
"""

from __future__ import annotations

import base64
import os
from typing import Any

from openinference.instrumentation.agno import AgnoInstrumentor
from opentelemetry import baggage
from opentelemetry import context as otel_context
from opentelemetry import trace as trace_api
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import ReadableSpan, Span, SpanProcessor, TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from agno_agent_builder.config import RuntimeConfig

TENANT_ID_ATTRIBUTE = "tenant_id"
LANGFUSE_TENANT_METADATA_ATTRIBUTE = "langfuse.trace.metadata.tenant_id"
LANGFUSE_TAGS_ATTRIBUTE = "langfuse.trace.tags"
OPENINFERENCE_SPAN_KIND_ATTRIBUTE = "openinference.span.kind"
HTTP_URL_ATTRIBUTE = "http.url"


class BaggageAttributeSpanProcessor(SpanProcessor):
    """Copy the tenant_id baggage value to every started span so Langfuse
    can filter and tag traces per tenant in the single shared project."""

    def on_start(self, span: Span, parent_context: otel_context.Context | None = None) -> None:
        ctx = parent_context or otel_context.get_current()
        tenant_id = baggage.get_baggage(TENANT_ID_ATTRIBUTE, context=ctx)
        if not tenant_id:
            return

        tenant_id_str = str(tenant_id)
        span.set_attribute(TENANT_ID_ATTRIBUTE, tenant_id_str)
        span.set_attribute(LANGFUSE_TENANT_METADATA_ATTRIBUTE, tenant_id_str)
        tags = baggage.get_baggage(LANGFUSE_TAGS_ATTRIBUTE, context=ctx)
        span.set_attribute(
            LANGFUSE_TAGS_ATTRIBUTE,
            str(tags).split(",") if tags else [f"tenant:{tenant_id_str}"],
        )

    def on_end(self, span: ReadableSpan) -> None:
        return None

    def shutdown(self) -> None:
        return None

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True


class GatewayAwareBatchSpanProcessor(BatchSpanProcessor):
    """BatchSpanProcessor that skips the runtime's own LLM-call spans when the
    LiteLLM gateway reports to Langfuse.

    Behind the gateway the runtime only knows the catalog PRESET (e.g.
    ``chat-estandar``), so its model-call spans always carry the alias with $0
    cost — a strict duplicate of the gateway's generation (real model, real
    cost, same messages). Exporting both pollutes the Langfuse model table
    with alias rows and double-counts tokens. We drop the Agno LLM-view span
    and its child httpx POST to the proxy; traceparent injection happens at
    request time, so dropping the span from export does not break the link.
    """

    def __init__(self, exporter: OTLPSpanExporter, proxy_url: str | None) -> None:
        super().__init__(exporter)
        self._proxy_base = proxy_url.rstrip("/") if proxy_url else None

    def on_end(self, span: ReadableSpan) -> None:
        if self._proxy_base and self._is_gateway_duplicate(span):
            return
        super().on_end(span)

    def _is_gateway_duplicate(self, span: ReadableSpan) -> bool:
        attributes = span.attributes or {}
        if attributes.get(OPENINFERENCE_SPAN_KIND_ATTRIBUTE) == "LLM":
            return True
        url = attributes.get(HTTP_URL_ATTRIBUTE)
        return (
            isinstance(url, str)
            and self._proxy_base is not None
            and url.startswith(self._proxy_base)
        )


def configure_langfuse_tracing(config: RuntimeConfig, logger: Any) -> TracerProvider | None:
    """Configure process-wide OpenTelemetry export to the shared Langfuse
    project. Returns None when Langfuse is not configured."""

    if not config.langfuse_host:
        return None

    public_key = config.langfuse_public_key.get_secret_value() if config.langfuse_public_key else ""
    secret_key = config.langfuse_secret_key.get_secret_value() if config.langfuse_secret_key else ""
    if not public_key or not secret_key:
        logger.warning(
            "LANGFUSE_HOST is set but LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY are missing — tracing disabled"
        )
        return None

    provider = TracerProvider(
        resource=Resource.create(
            {
                "service.name": config.app_name,
                "service.namespace": "zetesis",
            }
        )
    )
    provider.add_span_processor(BaggageAttributeSpanProcessor())

    auth = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()
    exporter = OTLPSpanExporter(
        endpoint=_otel_traces_endpoint(config.langfuse_host),
        headers={
            "Authorization": f"Basic {auth}",
            "x-langfuse-ingestion-version": "4",
        },
    )
    provider.add_span_processor(GatewayAwareBatchSpanProcessor(exporter, config.litellm_proxy_url))

    trace_api.set_tracer_provider(provider)
    AgnoInstrumentor().instrument()

    if config.litellm_proxy_url:
        # Propagate the W3C `traceparent` header on outbound HTTP so the LiteLLM
        # proxy can nest its Langfuse generation under THIS trace — one trace
        # with the real cost. The proxy side is a pre-call hook that copies the
        # traceparent into `metadata.existing_trace_id` for the classic
        # `langfuse` callback (`langfuse_otel` drops inbound traceparent in
        # v1.82.0; BerriAI/litellm#15940).
        if config.payload_url:
            # Internal CMS calls (agent/installation polling, reads during a
            # run) add nothing in Langfuse, and outside a run each becomes a
            # detached root "GET" trace. The global instrumentor only reads
            # exclusions from this env var; respect an operator override.
            os.environ.setdefault(
                "OTEL_PYTHON_HTTPX_EXCLUDED_URLS",
                f"{config.payload_url.rstrip('/')}/api/.*",
            )
        HTTPXClientInstrumentor().instrument()
        logger.info("HTTPX traceparent propagation enabled for LiteLLM proxy")

    logger.info("Langfuse tracing enabled", host=config.langfuse_host)
    return provider


def tenant_baggage_context(
    tenant_id: str,
    *,
    agent_slug: str | None = None,
    llm_model: str | None = None,
) -> Any:
    """Attach run-scoped baggage so every span gets trace-level Langfuse tags.

    Tags are the only trace-level facet Langfuse can filter by, so anything
    operators want to slice traces on (tenant, agent, preset) must land here.
    The model behind a preset is only visible on the gateway generation —
    ``preset:`` is the trace-level handle for it.
    """
    tags = [f"tenant:{tenant_id}"]
    if agent_slug:
        tags.append(f"agent:{agent_slug}")
    if llm_model:
        tags.append(f"preset:{llm_model}")
    ctx = otel_context.get_current()
    ctx = baggage.set_baggage(TENANT_ID_ATTRIBUTE, tenant_id, context=ctx)
    ctx = baggage.set_baggage(LANGFUSE_TENANT_METADATA_ATTRIBUTE, tenant_id, context=ctx)
    ctx = baggage.set_baggage(LANGFUSE_TAGS_ATTRIBUTE, ",".join(tags), context=ctx)
    return otel_context.attach(ctx)


def detach_tenant_baggage(token: Any) -> None:
    otel_context.detach(token)


def _otel_traces_endpoint(host: str) -> str:
    base = host.rstrip("/")
    if base.endswith("/api/public/otel/v1/traces"):
        return base
    if base.endswith("/api/public/otel"):
        return f"{base}/v1/traces"
    return f"{base}/api/public/otel/v1/traces"
