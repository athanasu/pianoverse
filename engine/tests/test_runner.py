import threading

import pytest

from fake_pipeline import fake_run
from pianoverse_engine.server.blobs import LocalBlobs
from pianoverse_engine.server.runner import LocalRunner
from pianoverse_engine.server.store import Store


@pytest.fixture
def store(tmp_path) -> Store:
    return Store(f"sqlite:///{tmp_path / 'test.db'}")


@pytest.fixture
def blobs(tmp_path) -> LocalBlobs:
    return LocalBlobs(tmp_path / "blobs")


def _queued(store: Store, blobs: LocalBlobs, title: str) -> str:
    job = store.create_job(title=title, mode="auto", source="file", duration_sec=30.0,
                           audio_key=f"audio/{title}.m4a")
    blobs.put_bytes(job.audio_key, b"audio", "audio/mp4")
    return job.id


def test_runs_submitted_jobs_in_order(store, blobs):
    order: list[str] = []

    def run(src, workdir, **kwargs):
        order.append(kwargs["title"])
        return fake_run(src, workdir, **kwargs)

    runner = LocalRunner(store, blobs, run=run)
    runner.start()
    ids = [_queued(store, blobs, title) for title in ("one", "two", "three")]
    for job_id in ids:
        runner.submit(job_id)
    assert runner.join_idle(10)
    runner.stop()
    assert order == ["one", "two", "three"]
    assert {store.get_job(job_id).status for job_id in ids} == {"done"}


def test_join_idle_times_out_while_a_job_is_running(store, blobs):
    release = threading.Event()

    def run(src, workdir, **kwargs):
        release.wait(5)
        return fake_run(src, workdir, **kwargs)

    runner = LocalRunner(store, blobs, run=run)
    runner.start()
    runner.submit(_queued(store, blobs, "slow"))
    assert runner.join_idle(0.1) is False
    release.set()
    assert runner.join_idle(5) is True
    runner.stop()


def test_stop_is_safe_twice_and_before_start(store, blobs):
    runner = LocalRunner(store, blobs, run=fake_run)
    runner.stop()
    runner.start()
    runner.stop()
    runner.stop()
