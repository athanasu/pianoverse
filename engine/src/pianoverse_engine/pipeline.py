import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from .arrange.levels import arrange_easy, arrange_hard, arrange_medium, arrange_original
from .audio import normalize
from .classify import classify, lead_stem
from .errors import PipelineError
from .key import chroma_profile, estimate_key
from .melody import clean_notes, drop_ghost_notes, skyline
from .models import Arrangement, ChordSegment, RawNote, Song, SongWarning
from .rhythm import tempo_from_beats, time_signature
from .separate import HARMONIC_STEMS, Stems

Mode = Literal["auto", "vocal", "instrumental", "solo_piano"]
ProgressFn = Callable[[str, float], None]
SPARSE_MELODY = 0.3


@dataclass
class Engines:
    separate: Callable[[Path], Stems]
    track_beats: Callable[[Path], tuple[list[float], list[float]]]
    transcribe_polyphonic: Callable[[Path], list[RawNote]]
    transcribe_piano: Callable[[Path], list[RawNote]]
    recognize_chords: Callable[[Stems, list[float], float],
                               tuple[list[ChordSegment], list[tuple[float, float]]]]
    prepare: Callable[[], object] | None = None   # fetch model weights before the slow stages


def default_engines() -> Engines:
    from .beats import track_beats
    from .chords_btc import ensure_weights, recognize_chords_btc
    from .separate import separate
    from .transcribe import transcribe_piano, transcribe_polyphonic
    return Engines(separate=separate, track_beats=track_beats,
                   transcribe_polyphonic=transcribe_polyphonic, transcribe_piano=transcribe_piano,
                   recognize_chords=recognize_chords_btc, prepare=ensure_weights)


def _no_progress(stage: str, fraction: float) -> None:
    pass


def _mmss(seconds: float) -> str:
    total = int(seconds)
    return f"{total // 60}:{total % 60:02d}"


def _warnings(melody: list[RawNote], duration: float,
              uncertain: list[tuple[float, float]]) -> list[SongWarning]:
    out: list[SongWarning] = []
    coverage = sum(n.end - n.start for n in melody) / duration
    if coverage < SPARSE_MELODY:
        out.append(SongWarning(code="melody_sparse",
                               message=f"Melody detected in only {coverage:.0%} of the song."))
    for start, end in uncertain:
        out.append(SongWarning(code="chords_uncertain", message=f"Uncertain chords at {_mmss(start)}–{_mmss(end)}.",
                               start=round(start, 2), end=round(end, 2)))
    return out


def run_pipeline(
    src: Path, workdir: Path, *, title: str, mode: Mode = "auto", song_id: str | None = None,
    engines: Engines | None = None, progress: ProgressFn = _no_progress,
) -> Song:
    engines = engines or default_engines()
    workdir.mkdir(parents=True, exist_ok=True)
    norm = workdir / "input.wav"
    duration = normalize(src, norm)
    if engines.prepare is not None:
        engines.prepare()

    progress("separating", 0.05)
    stems = engines.separate(norm)
    stem_paths = stems.save(workdir / "stems")
    energies = stems.energies()
    source_type = classify(energies) if mode == "auto" else mode

    progress("analyzing", 0.4)
    beats, downbeats = engines.track_beats(norm)
    if len(beats) < 4:
        raise PipelineError("no_beats", "No steady beat found in the song.")
    chords, uncertain = engines.recognize_chords(stems, beats, duration)
    key = estimate_key(chroma_profile(stems.mix(HARMONIC_STEMS), stems.sr))

    full_piano: list[RawNote] = []
    if source_type == "solo_piano":
        full_piano = clean_notes(engines.transcribe_piano(norm))
        raw = full_piano
    elif source_type == "vocal":
        raw = drop_ghost_notes(clean_notes(engines.transcribe_polyphonic(stem_paths["vocals"])))
    else:
        raw = drop_ghost_notes(clean_notes(engines.transcribe_polyphonic(stem_paths[lead_stem(energies)])))
    melody = skyline(raw)
    if not melody:
        raise PipelineError("no_melody", "Could not find a melody in the song.")

    progress("arranging", 0.75)
    args = (melody, chords, beats, downbeats, duration)
    arrangements: dict[str, Arrangement] = {
        "easy": arrange_easy(*args), "medium": arrange_medium(*args), "hard": arrange_hard(*args),
    }
    if full_piano:
        arrangements["original"] = arrange_original(full_piano)

    song = Song(
        id=song_id or uuid.uuid4().hex[:12],
        title=title,
        durationSec=round(duration, 3),
        sourceType=source_type,
        tempo=tempo_from_beats(beats, downbeats),
        timeSignature=time_signature(beats, downbeats),
        key=key,
        chords=chords,
        arrangements=arrangements,
        warnings=_warnings(melody, duration, uncertain),
    )
    progress("done", 1.0)
    return song
