from importlib.metadata import entry_points

import pytest

from fake_pipeline import fake_run
from helpers import make_song
from pianoverse_engine.errors import PipelineError
from pianoverse_engine.models import Song
from pianoverse_engine.server import reanalyze
from pianoverse_engine.server.blobs import LocalBlobs
from pianoverse_engine.server.store import Store
from pianoverse_engine.server.worker import process_job


@pytest.fixture
def library(tmp_path, monkeypatch):
    """Two finished songs in a data folder the command finds through the environment."""
    for name in ("PIANOVERSE_API_KEY", "PIANOVERSE_HOST", "PIANOVERSE_DATABASE_URL", "PIANOVERSE_RUNNER"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("PIANOVERSE_DATA_DIR", str(tmp_path))
    store = Store(f"sqlite:///{tmp_path / 'pianoverse.db'}")
    blobs = LocalBlobs(tmp_path / "blobs")
    ids = []
    for title in ("First", "Second"):
        job = store.create_job(title=title, mode="auto", source="file", duration_sec=30.0, audio_key="")
        store.update_job(job.id, audio_key=f"audio/{job.id}.mp3")
        blobs.put_bytes(f"audio/{job.id}.mp3", b"audio", "audio/mpeg")
        process_job(job.id, store, blobs, run=fake_run)
        ids.append(job.id)
    return ids, blobs


def _retitled(src, workdir, *, title, song_id, **kwargs):
    return make_song(id=song_id, title=title, durationSec=9.0)


def _duration(blobs, song_id):
    return Song.model_validate_json(blobs.get_bytes(f"songs/{song_id}/song.json")).durationSec


def test_script_is_registered():
    scripts = {ep.name: ep.value for ep in entry_points(group="console_scripts")}
    assert scripts["pianoverse-reanalyze"] == "pianoverse_engine.server.reanalyze:main"


def test_without_arguments_every_song_is_redone(library, monkeypatch, capsys):
    ids, blobs = library
    monkeypatch.setattr(reanalyze, "run_pipeline", _retitled)
    assert reanalyze.main([]) == 0
    assert [_duration(blobs, song_id) for song_id in ids] == [9.0, 9.0]
    out = capsys.readouterr().out
    assert "First" in out and "Second" in out


def test_named_songs_only(library, monkeypatch):
    ids, blobs = library
    monkeypatch.setattr(reanalyze, "run_pipeline", _retitled)
    assert reanalyze.main([ids[1]]) == 0
    assert [_duration(blobs, song_id) for song_id in ids] == [8.0, 9.0]


def test_unknown_song_is_reported_and_the_rest_still_run(library, monkeypatch, capsys):
    ids, blobs = library
    monkeypatch.setattr(reanalyze, "run_pipeline", _retitled)
    assert reanalyze.main(["missing", ids[0]]) == 1
    assert _duration(blobs, ids[0]) == 9.0
    assert "missing" in capsys.readouterr().err


def test_engine_error_is_reported_and_the_rest_still_run(library, monkeypatch, capsys):
    ids, blobs = library

    def run(src, workdir, *, title, song_id, **kwargs):
        if title == "First":
            raise PipelineError("no_melody", "Could not find a melody in the song.")
        return _retitled(src, workdir, title=title, song_id=song_id)

    monkeypatch.setattr(reanalyze, "run_pipeline", run)
    assert reanalyze.main([]) == 1
    assert [_duration(blobs, song_id) for song_id in ids] == [8.0, 9.0]
    assert "no_melody" in capsys.readouterr().err
