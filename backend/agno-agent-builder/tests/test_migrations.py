"""Tests for `agno_agent_builder.migrations`.

The migration itself is Agno's MigrationManager; these pin the wrapper's
contract with the pre-upgrade job: it builds the store like the runtime does,
always releases the connection pool, and lets failures surface so the job fails.
"""

from __future__ import annotations

from typing import Any, ClassVar

import pytest
from agno_agent_builder import migrations
from agno_agent_builder.migrations import MigrationReport, migrate_database

REPORT = MigrationReport(sessions_schema_version="3.0.0", sessions=5, legacy_runs=6, runs=6)


class FakeDb:
    instances: ClassVar[list[FakeDb]] = []

    def __init__(self, *, db_url: str, db_schema: str) -> None:
        self.db_url = db_url
        self.db_schema = db_schema
        self.closed = False
        FakeDb.instances.append(self)

    def close(self) -> None:
        self.closed = True


def _install(
    monkeypatch: pytest.MonkeyPatch, *, up_error: BaseException | None = None
) -> list[Any]:
    FakeDb.instances = []
    migrated: list[Any] = []

    class FakeManager:
        def __init__(self, db: FakeDb) -> None:
            self.db = db

        async def up(self) -> None:
            if up_error is not None:
                raise up_error
            migrated.append(self.db)

    monkeypatch.setattr(migrations, "PostgresDb", FakeDb)
    monkeypatch.setattr(migrations, "MigrationManager", FakeManager)
    monkeypatch.setattr(migrations, "_report", lambda db: REPORT)
    return migrated


async def test_migrates_the_runtime_store_and_returns_the_report(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    migrated = _install(monkeypatch)

    report = await migrate_database(
        database_url="postgresql://u:p@h:5432/db", database_schema="agno"
    )

    assert report == REPORT
    [db] = FakeDb.instances
    assert migrated == [db]
    assert db.db_url == "postgresql+psycopg://u:p@h:5432/db"
    assert db.db_schema == "agno"
    assert db.closed


async def test_failure_propagates_and_still_closes_the_pool(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install(monkeypatch, up_error=RuntimeError("migration blew up"))

    with pytest.raises(RuntimeError, match="migration blew up"):
        await migrate_database(database_url="postgresql://u:p@h:5432/db")

    [db] = FakeDb.instances
    assert db.closed
