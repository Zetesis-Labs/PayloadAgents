"""Apply pending Agno migrations — `python -m agno_agent.migrate`.

Run it against the devcontainer database after upgrading Agno, before starting the runtime.
Reads only the runtime's database settings.
"""

from __future__ import annotations

import asyncio
from typing import Any

from agno_agent_builder import migrate_database
from agno_agent_builder.logging import configure_logging
from pydantic_settings import BaseSettings, SettingsConfigDict


class MigrationSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = ""
    database_schema: str = "agno"
    log_level: str = "INFO"

    def model_post_init(self, __context: Any) -> None:
        if not self.database_url:
            raise ValueError("DATABASE_URL environment variable is required")


def main() -> None:
    settings = MigrationSettings()
    configure_logging(settings.log_level)
    asyncio.run(
        migrate_database(
            database_url=settings.database_url,
            database_schema=settings.database_schema,
        )
    )


if __name__ == "__main__":
    main()
