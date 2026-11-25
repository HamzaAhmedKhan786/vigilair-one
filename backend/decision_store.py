"""Local SQLite audit storage for a reviewable incident."""
from contextlib import contextmanager
from datetime import timezone
from pathlib import Path
import sqlite3

from .schemas import Observation, OperatorDecision


class DecisionStore:
    def __init__(self, path: Path):
        self.path = path

    @contextmanager
    def _connection(self):
        connection = sqlite3.connect(self.path, timeout=5)
        try:
            with connection:
                connection.execute("""
                    CREATE TABLE IF NOT EXISTS decisions (
                        id INTEGER PRIMARY KEY,
                        site_id TEXT NOT NULL,
                        track_id TEXT NOT NULL,
                        opened_at TEXT NOT NULL,
                        payload TEXT NOT NULL
                    )
                """)
                connection.execute("""
                    CREATE INDEX IF NOT EXISTS decisions_incident
                    ON decisions (site_id, track_id, opened_at)
                """)
                yield connection
        finally:
            connection.close()

    @staticmethod
    def _key(observation: Observation):
        return (
            observation.site_id, observation.track_id,
            observation.timestamp.astimezone(timezone.utc).isoformat(),
        )

    def add(self, first: Observation, decision: OperatorDecision) -> None:
        with self._connection() as connection:
            connection.execute("""
                INSERT INTO decisions (site_id, track_id, opened_at, payload)
                VALUES (?, ?, ?, ?)
            """, (*self._key(first), decision.model_dump_json()))

    def history(self, first: Observation) -> list[OperatorDecision]:
        with self._connection() as connection:
            rows = connection.execute("""
                SELECT payload FROM decisions
                WHERE site_id = ? AND track_id = ? AND opened_at = ?
                ORDER BY id
            """, self._key(first)).fetchall()
        return [OperatorDecision.model_validate_json(row[0]) for row in rows]
