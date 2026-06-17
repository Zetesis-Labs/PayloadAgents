"""Broker factory — the one place that builds a namespaced, middleware-wrapped broker.

Consumers never instantiate ``RedisStreamBroker`` directly: that is how ZP and
nixon ended up on the default global ``"taskiq"`` stream (which collides across
projects). Here the stream and consumer group are always
``nq:{project}:{queue}`` / ``…:cg``.
"""

from __future__ import annotations

from taskiq import AsyncBroker
from taskiq_redis import RedisStreamBroker

from nexus_queue.config import RuntimeConfig
from nexus_queue.middleware.metrics import MetricsMiddleware
from nexus_queue.middleware.retry_dlq import RetryDlqMiddleware


def create_broker(config: RuntimeConfig) -> AsyncBroker:
    """Build the standard broker: namespaced streams + the Nexus-Queue middleware stack."""
    broker: AsyncBroker = RedisStreamBroker(
        url=config.redis_url,
        queue_name=config.work_stream,
        consumer_group_name=config.consumer_group,
    )
    return broker.with_middlewares(
        MetricsMiddleware(config),
        RetryDlqMiddleware(config),
    )
