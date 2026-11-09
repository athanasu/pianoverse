"""A stand-in for run_pipeline that needs no audio or models."""
from pathlib import Path
from typing import Any

from helpers import make_song
from pianoverse_engine.models import Key, Preview, Song

PREVIEW = Preview(key=Key(tonic="C", mode="major"), bpm=120.0, timeSignature=(4, 4), chords=["C"])
STAGES = [("separating", 0.05), ("analyzing", 0.35), ("melody", 0.6), ("arranging", 0.85)]


def fake_run(src: Path, workdir: Path, *, title: str, mode: str, song_id: str,
             progress: Any, on_preview: Any, **_: Any) -> Song:
    """Reports progress and the preview the way run_pipeline does, then returns helpers.make_song."""
    for stage, fraction in STAGES[:2]:
        progress(stage, fraction)
    on_preview(PREVIEW)
    for stage, fraction in STAGES[2:]:
        progress(stage, fraction)
    progress("done", 1.0)
    return make_song(id=song_id, title=title)
