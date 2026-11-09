import io
import logging
import tempfile
from collections.abc import Callable
from pathlib import Path

from ..errors import EngineError
from ..export import arrangement_to_midi
from ..models import Preview, Song
from ..pipeline import preview_chords, run_pipeline
from .blobs import Blobs
from .store import ACTIVE_STATUSES, SongRecord, Store, utcnow

log = logging.getLogger(__name__)

RunFn = Callable[..., Song]
INTERNAL_MESSAGE = "Something went wrong while processing the song."


def song_key(song_id: str, name: str) -> str:
    return f"songs/{song_id}/{name}"


def process_job(job_id: str, store: Store, blobs: Blobs, *, run: RunFn = run_pipeline,
                workdir_root: Path | None = None) -> None:
    """Run one job end to end. Shared by the local worker thread and the cloud GPU function."""
    job = store.get_job(job_id)
    if job is None or job.status not in ACTIVE_STATUSES:
        return   # dismissed, already finished, or failed as stale while it waited
    store.update_job(job_id, attempts=job.attempts + 1)

    def progress(stage: str, fraction: float) -> None:
        if stage != "done":   # "done" is written only once the outputs are stored
            store.update_job(job_id, status=stage, progress=fraction)

    def on_preview(preview: Preview) -> None:
        store.update_job(job_id, preview=preview.model_dump(mode="json"))

    try:
        with tempfile.TemporaryDirectory(dir=workdir_root) as tmp:
            src = Path(tmp) / f"source{Path(job.audio_key).suffix}"
            blobs.download(job.audio_key, src)
            song = run(src, Path(tmp) / "work", title=job.title, mode=job.mode, song_id=job_id,
                       progress=progress, on_preview=on_preview)
        _save_song(song, store, blobs)
    except EngineError as err:
        store.update_job(job_id, status="failed", error_code=err.code, error_message=err.message)
        return
    except Exception:
        log.exception("job %s failed", job_id)
        store.update_job(job_id, status="failed", error_code="internal", error_message=INTERNAL_MESSAGE)
        return
    store.update_job(job_id, status="done", progress=1.0, song_id=song.id)


def _save_song(song: Song, store: Store, blobs: Blobs) -> None:
    blobs.put_bytes(song_key(song.id, "song.json"),
                    song.model_dump_json(exclude_none=True).encode(), "application/json")
    for level, arrangement in song.arrangements.items():
        midi = io.BytesIO()
        arrangement_to_midi(arrangement, song.tempo.bpm).write(midi)
        blobs.put_bytes(song_key(song.id, f"{level}.mid"), midi.getvalue(), "audio/midi")
    store.create_song(SongRecord(
        id=song.id, title=song.title, created_at=utcnow(), duration_sec=song.durationSec,
        source_type=song.sourceType, key_tonic=song.key.tonic, key_mode=song.key.mode,
        bpm=song.tempo.bpm, chords=preview_chords(song.chords),
    ))
