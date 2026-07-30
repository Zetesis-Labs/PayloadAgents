"""Env-loaded Settings → RuntimeConfig."""

from __future__ import annotations

from pydantic import HttpUrl, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Same shape as `payload_documents_worker_builder.RuntimeConfig` but populated from env.

    Kept separate so the lib stays decoupled from any specific env-loading
    strategy — consumers in other repos may load from Vault, Helm values, etc.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    nats_url: str = "nats://nats:4222"

    payload_url: HttpUrl = HttpUrl("http://app:3000")
    documents_collection_slug: str = "documents"

    llama_cloud_api_key: SecretStr = SecretStr("")
    llama_parse_base_url: HttpUrl = HttpUrl("https://api.cloud.llamaindex.ai")
    llama_parse_poll_interval_s: float = 5.0
    llama_parse_poll_timeout_s: float = 600.0

    internal_secret: SecretStr = SecretStr("")

    log_level: str = "INFO"

    @field_validator("llama_cloud_api_key", "internal_secret")
    @classmethod
    def _require_secret(cls, value: SecretStr, info: object) -> SecretStr:
        if not value.get_secret_value():
            field_name = getattr(info, "field_name", "secret")
            raise ValueError(f"{field_name.upper()} environment variable is required")
        return value
