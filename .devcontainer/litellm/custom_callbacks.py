"""Pre-call hook del proxy: enlaza la generation de Langfuse al trace OTel del runtime.

El callback clásico `langfuse` calcula el coste real pero crea su propia traza
salvo que la request lleve `metadata.existing_trace_id`. El runtime no puede
mandarlo (el extra_body del builder es estático y el trace nace en cada run),
pero SÍ propaga el header W3C `traceparent` (HTTPXClientInstrumentor). Este hook
copia el trace_id del traceparent a `metadata.existing_trace_id`, de modo que la
generation del proxy — con su coste — se anida bajo el MISMO trace que exporta
Agno via OTLP.

Nota: el callback `langfuse_otel` haría esto de serie, pero en v1.82.0 descarta
deliberadamente el traceparent (integrations/langfuse/langfuse_otel.py +
opentelemetry.py::_handle_success "is_langfuse_otel → parent_span = None"), así
que cada llamada acababa como traza raíz suelta y sin anidar.
"""

from litellm.integrations.custom_logger import CustomLogger

_TRACEPARENT_PARTS = 4
_TRACE_ID_LEN = 32
_NULL_TRACE_ID = "0" * _TRACE_ID_LEN


def _trace_id_from_traceparent(traceparent: str) -> str | None:
    """Extrae el trace-id de un header W3C `traceparent` (00-<32hex>-<16hex>-<flags>)."""
    parts = traceparent.split("-")
    if len(parts) != _TRACEPARENT_PARTS:
        return None
    trace_id = parts[1].lower()
    if len(trace_id) != _TRACE_ID_LEN or trace_id == _NULL_TRACE_ID:
        return None
    return trace_id


class TraceparentToLangfuse(CustomLogger):
    async def async_pre_call_hook(self, user_api_key_dict, cache, data: dict, call_type: str):
        headers = (data.get("proxy_server_request") or {}).get("headers") or {}
        traceparent = headers.get("traceparent")
        if not traceparent:
            return data
        trace_id = _trace_id_from_traceparent(traceparent)
        if not trace_id:
            return data
        metadata = data.setdefault("metadata", {})
        metadata.setdefault("existing_trace_id", trace_id)
        return data


proxy_handler_instance = TraceparentToLangfuse()
