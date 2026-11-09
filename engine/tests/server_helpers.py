"""Shared pieces for the API tests."""
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from pianoverse_engine.server.blobs import LocalBlobs
from pianoverse_engine.server.config import Settings
from pianoverse_engine.server.runner import LocalRunner
from pianoverse_engine.server.store import Store

API_KEY = "test-key"
AUTH = {"Authorization": f"Bearer {API_KEY}"}


def thirty_seconds(path: Path) -> float:
    """Stands in for ffprobe so uploads need no real audio."""
    return 30.0


def make_settings(tmp_path: Path, **overrides: Any) -> Settings:
    values: dict[str, Any] = dict(
        api_key=API_KEY, data_dir=tmp_path, database_url=f"sqlite:///{tmp_path / 'test.db'}",
        cors_origins=["http://localhost:5173"], runner="local", host="127.0.0.1", port=8000,
        supabase_url=None, supabase_service_key=None,
    )
    values.update(overrides)
    return Settings(**values)


@dataclass
class Server:
    client: TestClient
    store: Store
    blobs: LocalBlobs
    runner: LocalRunner


def upload(client: TestClient, *, audio: bytes = b"fake-audio", filename: str = "song.m4a",
           headers: dict[str, str] | None = None, **form: str):
    data = {"title": "My song", "mode": "auto", "source": "file"} | form
    return client.post("/api/jobs", headers=AUTH if headers is None else headers,
                       files={"audio": (filename, audio, "application/octet-stream")}, data=data)
