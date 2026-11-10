"""Store contract: every backend must pass these. Postgres joins the `store` fixture's params later."""
from datetime import UTC, datetime, timedelta

import pytest

from pianoverse_engine.server.store import SongRecord, Store


@pytest.fixture(params=["sqlite"])
def store(request, tmp_path) -> Store:
    return Store(f"sqlite:///{tmp_path / 'test.db'}")


def _job(store: Store, title: str = "Song"):
    return store.create_job(title=title, mode="auto", source="file", duration_sec=30.5,
                            audio_key="audio/x.m4a")


def _song(song_id: str, created_at: datetime) -> SongRecord:
    return SongRecord(id=song_id, title=f"Song {song_id}", created_at=created_at, duration_sec=200.0,
                      source_type="vocal", key_tonic="A", key_mode="minor", bpm=92.5,
                      chords=["Am", "F", "C", "G"])


def test_create_job_starts_queued(store):
    job = _job(store)
    assert len(job.id) == 12
    assert (job.status, job.progress, job.attempts) == ("queued", 0.0, 0)
    assert (job.preview, job.song_id, job.error_code, job.error_message) == (None, None, None, None)
    assert job.created_at.tzinfo is not None
    assert store.get_job(job.id) == job


def test_get_missing_job_is_none(store):
    assert store.get_job("nope") is None


def test_update_job_sets_fields_and_bumps_updated_at(store):
    job = _job(store)
    preview = {"key": {"tonic": "A", "mode": "minor"}, "bpm": 90.0, "timeSignature": [4, 4],
               "chords": ["Am", "F"]}
    store.update_job(job.id, status="analyzing", progress=0.35, preview=preview, attempts=1)
    got = store.get_job(job.id)
    assert (got.status, got.progress, got.preview, got.attempts) == ("analyzing", 0.35, preview, 1)
    assert got.updated_at > job.updated_at
    assert got.created_at == job.created_at


def test_active_and_failed_lists_are_newest_first(store):
    first, second, third, done = (_job(store, t) for t in ("first", "second", "third", "done"))
    store.update_job(second.id, status="melody")
    store.update_job(third.id, status="failed", error_code="silent", error_message="Nothing is audible.")
    store.update_job(done.id, status="done", progress=1.0, song_id=done.id)
    assert [j.id for j in store.list_active_jobs()] == [second.id, first.id]
    assert [j.id for j in store.list_failed_jobs()] == [third.id]


def test_fail_interrupted_fails_every_active_job(store):
    queued, running, done = _job(store), _job(store), _job(store)
    store.update_job(running.id, status="separating")
    store.update_job(done.id, status="done")
    assert store.fail_interrupted() == 2
    for job_id in (queued.id, running.id):
        got = store.get_job(job_id)
        assert (got.status, got.error_code) == ("failed", "interrupted")
        assert got.error_message
    assert store.get_job(done.id).status == "done"


def test_fail_interrupted_with_cutoff_spares_recent_jobs(store):
    job = _job(store)
    assert store.fail_interrupted(older_than=job.updated_at - timedelta(seconds=1)) == 0
    assert store.get_job(job.id).status == "queued"
    assert store.fail_interrupted(older_than=job.updated_at + timedelta(seconds=1)) == 1
    assert store.get_job(job.id).status == "failed"


def test_dismiss_deletes_only_failed_jobs(store):
    failed, active = _job(store), _job(store)
    store.update_job(failed.id, status="failed", error_code="silent")
    store.dismiss_job(failed.id)
    store.dismiss_job(active.id)
    assert store.get_job(failed.id) is None
    assert store.get_job(active.id) is not None


def test_songs_round_trip_newest_first(store):
    now = datetime.now(UTC).replace(microsecond=0)
    old, new = _song("old", now - timedelta(days=1)), _song("new", now)
    store.save_song(old)
    store.save_song(new)
    assert store.get_song("old") == old
    assert store.get_song("missing") is None
    assert [s.id for s in store.list_songs()] == ["new", "old"]


def test_saving_a_song_again_replaces_it(store):
    now = datetime.now(UTC).replace(microsecond=0)
    store.save_song(_song("s", now))
    changed = _song("s", now)
    changed.bpm = 77.0
    store.save_song(changed)
    assert store.get_song("s") == changed
    assert len(store.list_songs()) == 1


def test_tables_survive_a_second_store_on_the_same_database(tmp_path):
    url = f"sqlite:///{tmp_path / 'test.db'}"
    job = _job(Store(url))
    assert Store(url).get_job(job.id) == job
