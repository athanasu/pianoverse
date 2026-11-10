import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON, Column, DateTime, Float, Integer, MetaData, RowMapping, String, Table, Text,
    create_engine, delete, insert, select, update,
)

ACTIVE_STATUSES = ("queued", "separating", "analyzing", "melody", "arranging")
INTERRUPTED_MESSAGE = "Processing was interrupted. Try again."

metadata = MetaData()

jobs = Table(
    "jobs", metadata,
    Column("id", String(32), primary_key=True),
    Column("title", Text, nullable=False),
    Column("mode", String(16), nullable=False),
    Column("source", String(16), nullable=False),
    Column("duration_sec", Float, nullable=False),
    Column("status", String(16), nullable=False, index=True),
    Column("progress", Float, nullable=False),
    Column("preview", JSON, nullable=True),
    Column("song_id", String(32), nullable=True),
    Column("error_code", String(64), nullable=True),
    Column("error_message", Text, nullable=True),
    Column("audio_key", Text, nullable=False),
    Column("attempts", Integer, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

songs = Table(
    "songs", metadata,
    Column("id", String(32), primary_key=True),
    Column("title", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("duration_sec", Float, nullable=False),
    Column("source_type", String(16), nullable=False),
    Column("key_tonic", String(4), nullable=False),
    Column("key_mode", String(8), nullable=False),
    Column("bpm", Float, nullable=False),
    Column("chords", JSON, nullable=False),
)


@dataclass
class JobRecord:
    id: str
    title: str
    mode: str
    source: str
    duration_sec: float
    status: str
    progress: float
    preview: dict[str, Any] | None
    song_id: str | None
    error_code: str | None
    error_message: str | None
    audio_key: str
    attempts: int
    created_at: datetime
    updated_at: datetime


@dataclass
class SongRecord:
    id: str
    title: str
    created_at: datetime
    duration_sec: float
    source_type: str
    key_tonic: str
    key_mode: str
    bpm: float
    chords: list[str]


def utcnow() -> datetime:
    return datetime.now(UTC)


def _utc(value: datetime) -> datetime:
    # SQLite hands back naive datetimes; everything stored here is UTC.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _job(row: RowMapping) -> JobRecord:
    return JobRecord(**{**row, "created_at": _utc(row["created_at"]), "updated_at": _utc(row["updated_at"])})


def _song(row: RowMapping) -> SongRecord:
    return SongRecord(**{**row, "created_at": _utc(row["created_at"])})


class Store:
    """Job and song metadata. One implementation for SQLite (local) and Postgres (cloud)."""

    def __init__(self, database_url: str):
        connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
        self._engine = create_engine(database_url, connect_args=connect_args)
        metadata.create_all(self._engine)

    def create_job(self, *, title: str, mode: str, source: str, duration_sec: float,
                   audio_key: str) -> JobRecord:
        now = utcnow()
        job = JobRecord(id=uuid.uuid4().hex[:12], title=title, mode=mode, source=source,
                        duration_sec=duration_sec, status="queued", progress=0.0, preview=None,
                        song_id=None, error_code=None, error_message=None, audio_key=audio_key,
                        attempts=0, created_at=now, updated_at=now)
        with self._engine.begin() as conn:
            conn.execute(insert(jobs).values(**vars(job)))
        return job

    def get_job(self, job_id: str) -> JobRecord | None:
        with self._engine.connect() as conn:
            row = conn.execute(select(jobs).where(jobs.c.id == job_id)).mappings().first()
        return _job(row) if row else None

    def list_active_jobs(self) -> list[JobRecord]:
        return self._list_jobs(jobs.c.status.in_(ACTIVE_STATUSES))

    def list_failed_jobs(self) -> list[JobRecord]:
        return self._list_jobs(jobs.c.status == "failed")

    def _list_jobs(self, condition: Any) -> list[JobRecord]:
        query = select(jobs).where(condition).order_by(jobs.c.created_at.desc())
        with self._engine.connect() as conn:
            return [_job(row) for row in conn.execute(query).mappings()]

    def update_job(self, job_id: str, **fields: Any) -> None:
        with self._engine.begin() as conn:
            conn.execute(update(jobs).where(jobs.c.id == job_id).values(**fields, updated_at=utcnow()))

    def fail_interrupted(self, *, older_than: datetime | None = None) -> int:
        condition = jobs.c.status.in_(ACTIVE_STATUSES)
        if older_than is not None:
            condition = condition & (jobs.c.updated_at < older_than)
        query = update(jobs).where(condition).values(
            status="failed", error_code="interrupted", error_message=INTERRUPTED_MESSAGE, updated_at=utcnow())
        with self._engine.begin() as conn:
            return conn.execute(query).rowcount

    def dismiss_job(self, job_id: str) -> None:
        with self._engine.begin() as conn:
            conn.execute(delete(jobs).where((jobs.c.id == job_id) & (jobs.c.status == "failed")))

    def save_song(self, rec: SongRecord) -> None:
        """Insert the song, replacing any earlier record with the same id."""
        with self._engine.begin() as conn:
            conn.execute(delete(songs).where(songs.c.id == rec.id))
            conn.execute(insert(songs).values(**vars(rec)))

    def list_songs(self) -> list[SongRecord]:
        with self._engine.connect() as conn:
            rows = conn.execute(select(songs).order_by(songs.c.created_at.desc())).mappings()
            return [_song(row) for row in rows]

    def get_song(self, song_id: str) -> SongRecord | None:
        with self._engine.connect() as conn:
            row = conn.execute(select(songs).where(songs.c.id == song_id)).mappings().first()
        return _song(row) if row else None
