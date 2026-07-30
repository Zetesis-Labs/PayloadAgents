"""Prometheus counters for the Nexus-Queue runtime.

Only the metric definitions live here now; the NATS receiver increments them
directly. (The taskiq middleware layer is gone with the v1 runtime.)
"""
