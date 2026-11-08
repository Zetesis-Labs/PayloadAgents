"""Agno schema migrations for the runtime's Postgres store.

Agno does not migrate on boot: a runtime on Agno 3 that finds tables written by
Agno 2 raises ``MigrationRequiredError`` when it touches them. Call
:func:`migrate_database` before the upgraded runtime serves traffic — consumers
expose it as a CLI that a pre-upgrade job runs.

The migration is Agno's own ``MigrationManager``: idempotent, and it leaves the
legacy ``agno_sessions.runs`` column in place as a backup (Agno merges it with
``agno_runs`` on read). Nothing here drops that column.
"""

from __future__ import annotations

from dataclasses import dataclass

from agno.db.migrations.manager import MigrationManager
from agno.db.postgres import PostgresDb
from sqlalchemy import column, func, select, table, text
from sqlalchemy.engine import Connection
from sqlalchemy.sql import Select

from agno_agent_builder.db import normalize_pg_url
from agno_agent_builder.logging import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class MigrationReport:
    """Counts taken right after the migration, for the job log.

    ``legacy_runs`` keeps growing while a pre-upgrade runtime still serves, so a
    gap against ``runs`` is expected during a rollout and is not a failure.
    """

    sessions_schema_version: str
    sessions: int
    legacy_runs: int
    runs: int


async def migrate_database(*, database_url: str, database_schema: str = "agno") -> MigrationReport:
    """Apply every pending Agno migration to the runtime's store.

    Builds the ``PostgresDb`` exactly as ``AgentRegistry`` does, so the migrated
    tables are the ones the runtime reads.
    """
    db = PostgresDb(db_url=normalize_pg_url(database_url), db_schema=database_schema)
    try:
        await MigrationManager(db).up()
        report = _report(db)
    finally:
        db.close()
    logger.info(
        "Agno migrations applied",
        schema=database_schema,
        sessions_schema_version=report.sessions_schema_version,
        sessions=report.sessions,
        legacy_runs=report.legacy_runs,
        runs=report.runs,
    )
    return report


def _report(db: PostgresDb) -> MigrationReport:
    schema = db.db_schema
    sessions = table(db.session_table_name, column("runs"), schema=schema)
    runs = table(db.runs_table_name, schema=schema)
    with db.db_engine.connect() as conn:
        sessions_exists = _table_exists(conn, schema, db.session_table_name)
        runs_exists = _table_exists(conn, schema, db.runs_table_name)
        legacy_column = sessions_exists and _column_exists(
            conn, schema, db.session_table_name, "runs"
        )

        sessions_count = (
            _scalar(conn, select(func.count()).select_from(sessions)) if sessions_exists else 0
        )
        runs_count = _scalar(conn, select(func.count()).select_from(runs)) if runs_exists else 0
        legacy_runs = (
            _scalar(
                conn,
                select(func.coalesce(func.sum(func.jsonb_array_length(sessions.c.runs)), 0)).where(
                    func.jsonb_typeof(sessions.c.runs) == "array"
                ),
            )
            if legacy_column
            else 0
        )
    return MigrationReport(
        sessions_schema_version=str(db.get_latest_schema_version(db.session_table_name)),
        sessions=sessions_count,
        legacy_runs=legacy_runs,
        runs=runs_count,
    )


def _table_exists(conn: Connection, schema: str, name: str) -> bool:
    statement = text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
        "WHERE table_schema = :schema AND table_name = :name)"
    )
    return bool(conn.execute(statement, {"schema": schema, "name": name}).scalar())


def _column_exists(conn: Connection, schema: str, name: str, column_name: str) -> bool:
    statement = text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
        "WHERE table_schema = :schema AND table_name = :name AND column_name = :column)"
    )
    return bool(
        conn.execute(statement, {"schema": schema, "name": name, "column": column_name}).scalar()
    )


def _scalar(conn: Connection, statement: Select[tuple[int]]) -> int:
    return int(conn.execute(statement).scalar() or 0)
