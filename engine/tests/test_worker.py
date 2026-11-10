import json
import logging

import pretty_midi
import pytest

from fake_pipeline import PREVIEW, STAGES, fake_run
from helpers import make_song
from pianoverse_engine.errors import PipelineError
from pianoverse_engine.models import Arrangement, Note, Song, Tempo
from pianoverse_engine.server.blobs import LocalBlobs
from pianoverse_engine.server.store import Store
from pianoverse_engine.server.worker import process_job, reprocess_song


@pytest.fixture
def store(tmp_path) -> Store:
    return Store(f"sqlite:///{tmp_path / 'test.db'}")


@pytest.fixture
def blobs(tmp_path) -> LocalBlobs:
    return LocalBlobs(tmp_path / "blobs")


@pytest.fixture
def job(store, blobs):
    job = store.create_job(title="My song", mode="vocal", source="recording", duration_sec=30.0,
                           audio_key="audio/j.webm")
    blobs.put_bytes("audio/j.webm", b"recorded-audio", "audio/webm")
    return job


def test_success_stores_song_midi_and_record(store, blobs, job, tmp_path):
    seen = {}

    def run(src, workdir, **kwargs):
        seen.update(kwargs, audio=src.read_bytes(), suffix=src.suffix)
        return fake_run(src, workdir, **kwargs)

    process_job(job.id, store, blobs, run=run, workdir_root=tmp_path)
    assert (seen["audio"], seen["suffix"]) == (b"recorded-audio", ".webm")
    assert (seen["title"], seen["mode"], seen["song_id"]) == ("My song", "vocal", job.id)

    done = store.get_job(job.id)
    assert (done.status, done.progress, done.song_id, done.attempts) == ("done", 1.0, job.id, 1)
    assert done.preview == {"key": {"tonic": "C", "mode": "major"}, "bpm": 120.0,
                            "timeSignature": [4, 4], "chords": ["C"]}
    song = Song.model_validate_json(blobs.get_bytes(f"songs/{job.id}/song.json"))
    assert song == make_song(id=job.id, title="My song")
    assert "bass" not in json.loads(blobs.get_bytes(f"songs/{job.id}/song.json"))["chords"][0]
    midi_path = tmp_path / "easy.mid"
    midi_path.write_bytes(blobs.get_bytes(f"songs/{job.id}/easy.mid"))
    assert [len(i.notes) for i in pretty_midi.PrettyMIDI(str(midi_path)).instruments] == [1, 1]
    record = store.get_song(job.id)
    assert (record.title, record.source_type, record.key_tonic, record.key_mode) == ("My song", "vocal", "C", "major")
    assert (record.duration_sec, record.bpm, record.chords) == (8.0, 120.0, ["C"])


def test_each_stage_is_written_while_running(store, blobs, job):
    snapshots = []

    def run(src, workdir, *, progress, on_preview, **kwargs):
        for stage, fraction in STAGES:
            progress(stage, fraction)
            current = store.get_job(job.id)
            snapshots.append((current.status, current.progress))
        on_preview(PREVIEW)
        progress("done", 1.0)
        current = store.get_job(job.id)
        snapshots.append((current.status, current.progress))
        return make_song(id=kwargs["song_id"])

    process_job(job.id, store, blobs, run=run)
    assert snapshots == STAGES + [("arranging", 0.85)]   # "done" waits for the stored outputs


def test_engine_error_fails_the_job_with_its_code(store, blobs, job):
    def run(*args, **kwargs):
        raise PipelineError("no_melody", "Could not find a melody in the song.")

    process_job(job.id, store, blobs, run=run)
    failed = store.get_job(job.id)
    assert (failed.status, failed.error_code, failed.error_message) == (
        "failed", "no_melody", "Could not find a melody in the song.")
    assert store.get_song(job.id) is None


def test_unexpected_error_fails_as_internal_and_logs(store, blobs, job, caplog):
    def run(*args, **kwargs):
        raise RuntimeError("boom")

    with caplog.at_level(logging.ERROR):
        process_job(job.id, store, blobs, run=run)
    failed = store.get_job(job.id)
    assert (failed.status, failed.error_code) == ("failed", "internal")
    assert "RuntimeError: boom" in caplog.text


def test_missing_audio_fails_as_internal(store, blobs):
    job = store.create_job(title="x", mode="auto", source="file", duration_sec=30.0, audio_key="audio/none.m4a")
    process_job(job.id, store, blobs, run=fake_run)
    assert store.get_job(job.id).error_code == "internal"


@pytest.mark.parametrize("status", ["done", "failed"])
def test_finished_jobs_are_not_run_again(store, blobs, job, status):
    store.update_job(job.id, status=status)
    calls = []
    process_job(job.id, store, blobs, run=lambda *a, **k: calls.append(1))
    assert calls == []
    assert store.get_job(job.id).attempts == 0


def test_unknown_job_is_ignored(store, blobs):
    process_job("missing", store, blobs, run=fake_run)


def test_workdir_is_removed_afterwards(store, blobs, job, tmp_path):
    root = tmp_path / "work"
    root.mkdir()
    process_job(job.id, store, blobs, run=fake_run, workdir_root=root)
    assert list(root.iterdir()) == []


def test_reprocess_replaces_the_arrangements_and_keeps_the_song(store, blobs, job, tmp_path):
    process_job(job.id, store, blobs, run=fake_run)
    before = store.get_song(job.id)
    seen = {}

    def run(src, workdir, **kwargs):
        seen.update(kwargs, audio=src.read_bytes(), suffix=src.suffix)
        return make_song(id=kwargs["song_id"], title=kwargs["title"], sourceType="instrumental",
                         tempo=Tempo(bpm=90, beats=[0.5, 1.0], downbeats=[0.5]),
                         arrangements={"easy": Arrangement(notes=[
                             Note(pitch=60, start=0, end=1, velocity=80, hand="R")])})

    song = reprocess_song(job.id, store, blobs, run=run, workdir_root=tmp_path)
    assert (seen["audio"], seen["suffix"]) == (b"recorded-audio", ".webm")
    assert (seen["title"], seen["mode"], seen["song_id"]) == ("My song", "vocal", job.id)
    assert Song.model_validate_json(blobs.get_bytes(f"songs/{job.id}/song.json")) == song
    midi_path = tmp_path / "easy.mid"
    midi_path.write_bytes(blobs.get_bytes(f"songs/{job.id}/easy.mid"))
    assert [len(i.notes) for i in pretty_midi.PrettyMIDI(str(midi_path)).instruments] == [1]
    after = store.get_song(job.id)
    assert (after.title, after.created_at) == (before.title, before.created_at)
    assert (after.source_type, after.bpm) == ("instrumental", 90.0)
    assert len(store.list_songs()) == 1
    assert store.get_job(job.id).attempts == 1   # the job row is history, not touched


def test_reprocess_reports_progress(store, blobs, job):
    process_job(job.id, store, blobs, run=fake_run)
    stages = []

    def run(src, workdir, *, progress, **kwargs):
        for stage, fraction in STAGES:
            progress(stage, fraction)
        progress("done", 1.0)
        return make_song(id=kwargs["song_id"])

    reprocess_song(job.id, store, blobs, run=run, progress=lambda stage, fraction: stages.append(stage))
    assert stages == [stage for stage, _ in STAGES] + ["done"]


def test_reprocess_failure_leaves_the_old_song(store, blobs, job):
    process_job(job.id, store, blobs, run=fake_run)
    old = blobs.get_bytes(f"songs/{job.id}/song.json")

    def run(*args, **kwargs):
        raise PipelineError("no_melody", "Could not find a melody in the song.")

    with pytest.raises(PipelineError):
        reprocess_song(job.id, store, blobs, run=run)
    assert blobs.get_bytes(f"songs/{job.id}/song.json") == old


def test_reprocess_unknown_song_is_a_key_error(store, blobs, job):
    with pytest.raises(KeyError):
        reprocess_song(job.id, store, blobs, run=fake_run)   # the job never produced a song
