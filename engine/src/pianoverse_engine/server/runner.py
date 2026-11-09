import logging
import queue
import threading
from typing import Protocol

from ..pipeline import run_pipeline
from .blobs import Blobs
from .store import Store
from .worker import RunFn, process_job

log = logging.getLogger(__name__)


class Runner(Protocol):
    def submit(self, job_id: str) -> None: ...


class LocalRunner:
    """One background thread that processes jobs in submission order, one at a time."""

    def __init__(self, store: Store, blobs: Blobs, *, run: RunFn = run_pipeline):
        self._store = store
        self._blobs = blobs
        self._run = run
        self._queue: queue.Queue[str | None] = queue.Queue()
        self._thread: threading.Thread | None = None
        self._pending = 0
        self._idle = threading.Condition()

    def start(self) -> None:
        if self._thread is None:
            self._thread = threading.Thread(target=self._loop, name="pianoverse-worker", daemon=True)
            self._thread.start()

    def stop(self, timeout: float = 5.0) -> None:
        if self._thread is not None:
            self._queue.put(None)
            self._thread.join(timeout)
            self._thread = None

    def submit(self, job_id: str) -> None:
        with self._idle:
            self._pending += 1
        self._queue.put(job_id)

    def join_idle(self, timeout: float = 10.0) -> bool:
        """Wait until every submitted job has been processed (for tests)."""
        with self._idle:
            return self._idle.wait_for(lambda: self._pending == 0, timeout)

    def _loop(self) -> None:
        while (job_id := self._queue.get()) is not None:
            try:
                process_job(job_id, self._store, self._blobs, run=self._run)
            except Exception:   # a broken database must not kill the worker thread
                log.exception("worker crashed on job %s", job_id)
            finally:
                with self._idle:
                    self._pending -= 1
                    self._idle.notify_all()
