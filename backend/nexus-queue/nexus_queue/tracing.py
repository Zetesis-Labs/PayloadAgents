"""Optional OpenTelemetry tracing setup for the worker.

The runtime instruments spans through the OTel *API* (see :mod:`nexus_queue.handlers`),
but emitting them needs an SDK + exporter. A deployment opts in by setting the
standard ``OTEL_EXPORTER_OTLP_ENDPOINT``; with it unset the spans stay no-op, so
the same image runs untraced where no collector exists.
"""

from __future__ import annotations

import os

import structlog
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from nexus_queue.config import RuntimeConfig

logger = structlog.get_logger("nexus_queue.tracing")

OTLP_ENDPOINT_ENV = "OTEL_EXPORTER_OTLP_ENDPOINT"


def configure_tracing(config: RuntimeConfig) -> None:
    """Wire an OTLP span exporter when a collector endpoint is configured.

    No-op unless ``OTEL_EXPORTER_OTLP_ENDPOINT`` is set. The exporter reads the
    endpoint (and any other ``OTEL_*`` options) from the environment itself."""
    endpoint = os.environ.get(OTLP_ENDPOINT_ENV)
    if not endpoint:
        return
    provider = TracerProvider(resource=Resource.create({"service.name": config.app_name}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    logger.info("tracing-configured", endpoint=endpoint, service=config.app_name)
