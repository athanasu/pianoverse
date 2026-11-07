# Pianoverse Engine Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local CLI, `pianoverse-engine song.mp3 --out DIR`, that turns any song (vocal, instrumental or solo piano) into a Song JSON with easy/medium/hard piano arrangements (+ "original" for solo piano), MIDI files, and an evaluation script for listening tests. The plan ends at the spec's quality decision gate.

**Architecture:** A Python package `pianoverse_engine` in `engine/`. The pure parts (music theory, chord recognition, key, quantization, arranger, export) are small modules with fast unit tests. The ML parts (Demucs, beat_this, Basic Pitch, ByteDance piano transcription) are thin wrappers that `pipeline.run_pipeline` gets through an injectable `Engines` object, so the pipeline is testable with fakes.

**Tech Stack:** Python 3.11, uv, pydantic v2, numpy, librosa, soundfile, pretty_midi, mir_eval, pytest; later: torch, demucs 4.0.1, beat_this, basic-pitch, piano_transcription_inference; ffmpeg (system binary).

**Spec:** `docs/superpowers/specs/2026-11-07-pianoverse-design.md` (sections 3, 4.1, 7, 8, 9 step 1)

## Global Constraints

- Python `>=3.11,<3.12`; package manager `uv`; all commands run from `engine/`.
- Normalized audio: wav, 44100 Hz, 2 channels. Reject < 10 s, > 480 s (8 minutes), silence.
- Song JSON `schemaVersion: 1`, fields exactly as spec §4.1 plus `warnings`; levels `easy | medium | hard | original`; `sourceType` `vocal | instrumental | solo_piano`; hands `"L" | "R"`.
- Times are seconds (floats).
- Arranger constraints (easy/medium/hard): right hand pitches in [60, 84]; simultaneous notes in one hand span ≤ 12 semitones; left-hand notes always below right-hand notes; `original` is exempt.
- User-facing error/warning messages are Greek.
- Songs in `engine/samples/` and outputs in `engine/out/` are never committed (copyright).

## File Structure

```
engine/
  pyproject.toml, .python-version, README.md
  src/pianoverse_engine/
    __init__.py
    models.py      Song schema (pydantic) + RawNote
    schema.py      writes schema/song.schema.json
    errors.py      EngineError, AudioError, PipelineError
    theory.py      pitch names, chord qualities, symbols
    audio.py       ffmpeg normalize + validation, load_mono
    key.py         chroma_profile, estimate_key (Krumhansl–Schmuckler)
    chords.py      beat-synchronous template chord recognition + Viterbi
    rhythm.py      tempo_from_beats, time_signature
    melody.py      clean_notes, skyline, fit_octave
    arrange/
      __init__.py
      quantize.py  beat_grid, quantize_monophonic
      voicing.py   left-hand voicings + voice leading
      levels.py    arrange_easy/medium/hard/original
    export.py      arrangement_to_midi, write_outputs
    separate.py    Stems + Demucs wrapper
    classify.py    classify, lead_stem
    beats.py       beat_this wrapper
    transcribe.py  Basic Pitch + ByteDance wrappers
    pipeline.py    Engines, run_pipeline
    cli.py         pianoverse-engine command
    evaluate.py    folder evaluation → renders + report.md
  tests/
    helpers.py     synth(), make_song()
    test_*.py
schema/song.schema.json
```

---

### Task 1: Project scaffold + Song schema

**Files:**
- Create: `.gitignore`, `engine/pyproject.toml`, `engine/.python-version`, `engine/src/pianoverse_engine/__init__.py`, `engine/src/pianoverse_engine/models.py`, `engine/src/pianoverse_engine/schema.py`, `engine/tests/helpers.py`, `engine/tests/test_models.py`, `schema/song.schema.json`

**Interfaces:**
- Produces: `RawNote(pitch:int, start:float, end:float, velocity:int=80)` (frozen dataclass); pydantic models `Note, Arrangement, Tempo, Key, ChordSegment, SongWarning, Song`; type aliases `Hand, Level, SourceType`; test helpers `synth(notes, sr) -> np.ndarray`, `make_song(**overrides) -> Song`.

- [ ] **Step 1: Create the project files**

`.gitignore` (repo root):

```gitignore
.DS_Store
__pycache__/
.pytest_cache/
engine/.venv/
engine/samples/
engine/out/
```

`engine/.python-version`:

```
3.11
```

`engine/pyproject.toml`:

```toml
[project]
name = "pianoverse-engine"
version = "0.1.0"
description = "Song to playable piano arrangement"
requires-python = ">=3.11,<3.12"
dependencies = [
  "numpy>=1.26,<2",
  "scipy>=1.11",
  "librosa>=0.10.2",
  "soundfile>=0.12",
  "pretty_midi>=0.2.10",
  "setuptools<81",
  "mir_eval>=0.7",
  "pydantic>=2.6",
]

[project.scripts]
pianoverse-engine = "pianoverse_engine.cli:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/pianoverse_engine"]

[dependency-groups]
dev = ["pytest>=8"]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-m 'not slow'"
markers = ["slow: needs ML models and real audio (minutes)"]
```

`engine/src/pianoverse_engine/__init__.py`:

```python
"""Pianoverse engine: song audio to playable piano arrangements."""
```

Run: `cd engine && uv sync`
Expected: creates `.venv`, installs deps without errors.

- [ ] **Step 2: Write the test helpers**

`engine/tests/helpers.py`:

```python
import numpy as np
import pretty_midi

from pianoverse_engine.models import (
    Arrangement, ChordSegment, Key, Note, Song, Tempo,
)


def synth(notes: list[tuple[int, float, float]], sr: int) -> np.ndarray:
    """Sine-wave render of (pitch, start, end) tuples, peak 0.5."""
    pm = pretty_midi.PrettyMIDI()
    inst = pretty_midi.Instrument(program=0)
    inst.notes = [pretty_midi.Note(velocity=100, pitch=p, start=s, end=e) for p, s, e in notes]
    pm.instruments.append(inst)
    y = pm.synthesize(fs=sr).astype(np.float32)
    return y / (np.abs(y).max() + 1e-9) * 0.5


def make_song(**overrides) -> Song:
    base = dict(
        id="abc",
        title="Test",
        durationSec=8.0,
        sourceType="vocal",
        tempo=Tempo(bpm=120, beats=[0.5, 1.0], downbeats=[0.5]),
        timeSignature=(4, 4),
        key=Key(tonic="C", mode="major"),
        chords=[ChordSegment(start=0, end=2, symbol="C", root="C", quality="maj")],
        arrangements={
            "easy": Arrangement(notes=[
                Note(pitch=72, start=0, end=0.5, velocity=80, hand="R"),
                Note(pitch=48, start=0, end=2, velocity=60, hand="L"),
            ])
        },
        warnings=[],
    )
    base.update(overrides)
    return Song(**base)
```

- [ ] **Step 3: Write the failing tests**

`engine/tests/test_models.py`:

```python
import pytest
from pydantic import ValidationError

from helpers import make_song
from pianoverse_engine.models import Note, Song


def test_song_round_trips_through_json():
    song = make_song()
    assert Song.model_validate_json(song.model_dump_json()) == song


def test_note_end_must_follow_start():
    with pytest.raises(ValidationError):
        Note(pitch=60, start=1.0, end=1.0, velocity=80, hand="R")


def test_note_pitch_must_be_on_piano():
    with pytest.raises(ValidationError):
        Note(pitch=120, start=0, end=1, velocity=80, hand="R")


def test_unknown_level_rejected():
    with pytest.raises(ValidationError):
        make_song(arrangements={"expert": {"notes": []}})


def test_schema_has_all_top_level_fields():
    props = set(Song.model_json_schema()["properties"])
    assert props == {
        "schemaVersion", "id", "title", "durationSec", "sourceType", "tempo",
        "timeSignature", "key", "chords", "arrangements", "warnings",
    }
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `uv run pytest tests/test_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'pianoverse_engine.models'`

- [ ] **Step 5: Implement the models**

`engine/src/pianoverse_engine/models.py`:

```python
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field, model_validator

Hand = Literal["L", "R"]
Level = Literal["easy", "medium", "hard", "original"]
SourceType = Literal["vocal", "instrumental", "solo_piano"]


@dataclass(frozen=True)
class RawNote:
    """Engine-internal note before hands are assigned."""
    pitch: int
    start: float
    end: float
    velocity: int = 80


class Note(BaseModel):
    pitch: int = Field(ge=21, le=108)
    start: float = Field(ge=0)
    end: float
    velocity: int = Field(ge=1, le=127)
    hand: Hand

    @model_validator(mode="after")
    def _end_after_start(self) -> "Note":
        if self.end <= self.start:
            raise ValueError("note end must be after start")
        return self


class Arrangement(BaseModel):
    notes: list[Note]


class Tempo(BaseModel):
    bpm: float = Field(gt=0)
    beats: list[float]
    downbeats: list[float]


class Key(BaseModel):
    tonic: str
    mode: Literal["major", "minor"]


class ChordSegment(BaseModel):
    start: float
    end: float
    symbol: str
    root: str
    quality: str
    bass: str | None = None


class SongWarning(BaseModel):
    code: str
    message: str
    start: float | None = None
    end: float | None = None


class Song(BaseModel):
    schemaVersion: Literal[1] = 1
    id: str
    title: str
    durationSec: float
    sourceType: SourceType
    tempo: Tempo
    timeSignature: tuple[int, int]
    key: Key
    chords: list[ChordSegment]
    arrangements: dict[Level, Arrangement]
    warnings: list[SongWarning] = []
```

`engine/src/pianoverse_engine/schema.py`:

```python
"""Write the Song JSON Schema: `uv run python -m pianoverse_engine.schema ../schema/song.schema.json`."""
import json
import sys
from pathlib import Path

from .models import Song


def main(out: str | None = None) -> None:
    text = json.dumps(Song.model_json_schema(), indent=2, ensure_ascii=False) + "\n"
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        Path(out).write_text(text)
    else:
        sys.stdout.write(text)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `uv run pytest tests/test_models.py -v`
Expected: 5 passed

- [ ] **Step 7: Generate the schema file**

Run: `uv run python -m pianoverse_engine.schema ../schema/song.schema.json && head -5 ../schema/song.schema.json`
Expected: JSON starting with `{` and containing `"$defs"`.

- [ ] **Step 8: Commit**

```bash
git add .gitignore engine/pyproject.toml engine/uv.lock engine/.python-version engine/src engine/tests schema/song.schema.json
git commit -m "feat(engine): scaffold package and Song schema"
```

---

### Task 2: Music theory helpers

**Files:**
- Create: `engine/src/pianoverse_engine/theory.py`, `engine/tests/test_theory.py`

**Interfaces:**
- Produces: `PITCH_NAMES: tuple[str,...]`, `QUALITY_INTERVALS: dict[str, tuple[int,...]]` (keys `maj, min, 7, maj7, m7, sus2, sus4, dim, aug`), `pc_name(pc:int)->str`, `pc_of(name:str)->int`, `chord_pcs(root_pc:int, quality:str)->list[int]`, `chord_symbol(root_pc:int, quality:str, bass_pc:int|None=None)->str`, `to_mirex(root_pc:int, quality:str)->str`, `pitch_at_or_above(pc:int, lo:int)->int`.

- [ ] **Step 1: Write the failing tests**

`engine/tests/test_theory.py`:

```python
import pytest

from pianoverse_engine.theory import (
    chord_pcs, chord_symbol, pc_name, pc_of, pitch_at_or_above, to_mirex,
)


def test_pc_names_round_trip():
    for pc in range(12):
        assert pc_of(pc_name(pc)) == pc


def test_pc_of_accepts_enharmonic_aliases():
    assert pc_of("Db") == 1
    assert pc_of("A#") == 10


def test_pc_of_rejects_garbage():
    with pytest.raises(ValueError):
        pc_of("H")


@pytest.mark.parametrize("root,quality,bass,expected", [
    (9, "min", None, "Am"),
    (0, "maj", 4, "C/E"),
    (0, "maj", 0, "C"),
    (7, "7", None, "G7"),
    (2, "m7", None, "Dm7"),
    (5, "maj7", None, "Fmaj7"),
    (11, "dim", None, "Bdim"),
])
def test_chord_symbol(root, quality, bass, expected):
    assert chord_symbol(root, quality, bass) == expected


def test_chord_pcs_dominant_seventh():
    assert chord_pcs(7, "7") == [7, 11, 2, 5]


def test_to_mirex():
    assert to_mirex(9, "m7") == "A:min7"
    assert to_mirex(0, "maj") == "C:maj"


def test_pitch_at_or_above():
    assert pitch_at_or_above(4, 43) == 52   # first E at/above G2 is E3
    assert pitch_at_or_above(7, 43) == 43
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_theory.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement**

`engine/src/pianoverse_engine/theory.py`:

```python
PITCH_NAMES = ("C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")
_ALIASES = {"Db": 1, "D#": 3, "Gb": 6, "G#": 8, "A#": 10, "Cb": 11, "Fb": 4, "E#": 5, "B#": 0}

QUALITY_INTERVALS: dict[str, tuple[int, ...]] = {
    "maj": (0, 4, 7),
    "min": (0, 3, 7),
    "7": (0, 4, 7, 10),
    "maj7": (0, 4, 7, 11),
    "m7": (0, 3, 7, 10),
    "sus2": (0, 2, 7),
    "sus4": (0, 5, 7),
    "dim": (0, 3, 6),
    "aug": (0, 4, 8),
}
_SUFFIX = {"maj": "", "min": "m", "7": "7", "maj7": "maj7", "m7": "m7",
           "sus2": "sus2", "sus4": "sus4", "dim": "dim", "aug": "aug"}
_MIREX = {"maj": "maj", "min": "min", "7": "7", "maj7": "maj7", "m7": "min7",
          "sus2": "sus2", "sus4": "sus4", "dim": "dim", "aug": "aug"}


def pc_name(pc: int) -> str:
    return PITCH_NAMES[pc % 12]


def pc_of(name: str) -> int:
    if name in PITCH_NAMES:
        return PITCH_NAMES.index(name)
    if name in _ALIASES:
        return _ALIASES[name]
    raise ValueError(f"unknown pitch name: {name!r}")


def chord_pcs(root_pc: int, quality: str) -> list[int]:
    return [(root_pc + i) % 12 for i in QUALITY_INTERVALS[quality]]


def chord_symbol(root_pc: int, quality: str, bass_pc: int | None = None) -> str:
    symbol = pc_name(root_pc) + _SUFFIX[quality]
    if bass_pc is not None and bass_pc % 12 != root_pc % 12:
        symbol += "/" + pc_name(bass_pc)
    return symbol


def to_mirex(root_pc: int, quality: str) -> str:
    return f"{pc_name(root_pc)}:{_MIREX[quality]}"


def pitch_at_or_above(pc: int, lo: int) -> int:
    """Lowest MIDI pitch >= lo whose pitch class is pc."""
    return lo + ((pc - lo) % 12)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_theory.py -v`
Expected: all passed

- [ ] **Step 5: Commit**

```bash
git add engine/src/pianoverse_engine/theory.py engine/tests/test_theory.py
git commit -m "feat(engine): music theory helpers"
```

---

### Task 3: Audio normalization and validation

**Files:**
- Create: `engine/src/pianoverse_engine/errors.py`, `engine/src/pianoverse_engine/audio.py`, `engine/tests/test_audio.py`

**Interfaces:**
- Produces: `EngineError(code:str, message:str)` with `.code`, `.message`; subclasses `AudioError`, `PipelineError`; constants `TARGET_SR=44100, MIN_SEC=10, MAX_SEC=480`; `normalize(src:Path, dst:Path) -> float` (duration in seconds); `load_mono(path:Path, sr:int|None=None) -> tuple[np.ndarray, int]`.

- [ ] **Step 1: Check ffmpeg is installed**

Run: `ffmpeg -version | head -1`
Expected: a line starting with `ffmpeg version`. If missing: `brew install ffmpeg`.

- [ ] **Step 2: Write the failing tests**

`engine/tests/test_audio.py`:

```python
import numpy as np
import pytest
import soundfile as sf

from pianoverse_engine.audio import load_mono, normalize
from pianoverse_engine.errors import AudioError


def _sine(seconds: float, sr: int) -> np.ndarray:
    t = np.arange(int(seconds * sr)) / sr
    return (0.3 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)


def test_normalize_resamples_to_stereo_44k(tmp_path):
    src = tmp_path / "in.wav"
    sf.write(src, _sine(12, 22050), 22050)
    dst = tmp_path / "out.wav"
    duration = normalize(src, dst)
    assert duration == pytest.approx(12.0, abs=0.05)
    info = sf.info(dst)
    assert info.samplerate == 44100
    assert info.channels == 2


@pytest.mark.parametrize("make,code", [
    (lambda: (_sine(5, 22050), 22050), "too_short"),
    (lambda: (np.zeros(12 * 22050, dtype=np.float32), 22050), "silent"),
    (lambda: (_sine(481, 8000), 8000), "too_long"),
])
def test_normalize_rejects(tmp_path, make, code):
    y, sr = make()
    src = tmp_path / "in.wav"
    sf.write(src, y, sr)
    with pytest.raises(AudioError) as err:
        normalize(src, tmp_path / "out.wav")
    assert err.value.code == code


def test_normalize_rejects_non_audio(tmp_path):
    src = tmp_path / "in.mp3"
    src.write_bytes(b"definitely not audio")
    with pytest.raises(AudioError) as err:
        normalize(src, tmp_path / "out.wav")
    assert err.value.code == "unsupported_format"


def test_load_mono_resamples(tmp_path):
    src = tmp_path / "in.wav"
    sf.write(src, np.stack([_sine(2, 44100)] * 2, axis=1), 44100)
    y, sr = load_mono(src, sr=22050)
    assert sr == 22050
    assert y.ndim == 1
    assert len(y) == pytest.approx(2 * 22050, abs=2)
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `uv run pytest tests/test_audio.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 4: Implement**

`engine/src/pianoverse_engine/errors.py`:

```python
class EngineError(Exception):
    """Failure with a stable code and a Greek, user-facing message."""

    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


class AudioError(EngineError):
    pass


class PipelineError(EngineError):
    pass
```

`engine/src/pianoverse_engine/audio.py`:

```python
import shutil
import subprocess
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

from .errors import AudioError

TARGET_SR = 44100
MIN_SEC = 10
MAX_SEC = 480
SILENCE_RMS = 1e-3


def normalize(src: Path, dst: Path) -> float:
    """Convert any audio file to 44.1 kHz stereo wav; return its duration."""
    if shutil.which("ffmpeg") is None:
        raise AudioError("ffmpeg_missing", "Λείπει το ffmpeg από το σύστημα.")
    result = subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(src),
         "-ac", "2", "-ar", str(TARGET_SR), "-c:a", "pcm_s16le", str(dst)],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise AudioError("unsupported_format", "Δεν μπόρεσα να διαβάσω αυτό το αρχείο ήχου.")
    data, sr = sf.read(dst, always_2d=True, dtype="float32")
    duration = len(data) / sr
    if duration < MIN_SEC:
        raise AudioError("too_short", "Η ηχογράφηση είναι πολύ μικρή (χρειάζονται τουλάχιστον 10 δευτερόλεπτα).")
    if duration > MAX_SEC:
        raise AudioError("too_long", "Το κομμάτι είναι πολύ μεγάλο (μέγιστο 8 λεπτά).")
    if float(np.sqrt(np.mean(data ** 2))) < SILENCE_RMS:
        raise AudioError("silent", "Δεν ακούγεται τίποτα στην ηχογράφηση.")
    return duration


def load_mono(path: Path, sr: int | None = None) -> tuple[np.ndarray, int]:
    data, file_sr = sf.read(path, always_2d=True, dtype="float32")
    y = data.mean(axis=1)
    if sr is not None and sr != file_sr:
        y = librosa.resample(y, orig_sr=file_sr, target_sr=sr)
        return y.astype(np.float32), sr
    return y, file_sr
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/test_audio.py -v`
Expected: all passed

- [ ] **Step 6: Commit**

```bash
git add engine/src/pianoverse_engine/errors.py engine/src/pianoverse_engine/audio.py engine/tests/test_audio.py
git commit -m "feat(engine): audio normalization with validation"
```

---

### Task 4: Key estimation

**Files:**
- Create: `engine/src/pianoverse_engine/key.py`, `engine/tests/test_key.py`

**Interfaces:**
- Consumes: `Key` (Task 1), `pc_name` (Task 2).
- Produces: `MAJOR_PROFILE`, `MINOR_PROFILE` (np arrays), `chroma_profile(y:np.ndarray, sr:int) -> np.ndarray` (shape (12,)), `estimate_key(profile:np.ndarray) -> Key`.

- [ ] **Step 1: Write the failing tests**

`engine/tests/test_key.py`:

```python
import numpy as np

from helpers import synth
from pianoverse_engine.key import MAJOR_PROFILE, MINOR_PROFILE, chroma_profile, estimate_key
from pianoverse_engine.models import Key


def test_rolled_major_profile_is_g_major():
    assert estimate_key(np.roll(MAJOR_PROFILE, 7)) == Key(tonic="G", mode="major")


def test_rolled_minor_profile_is_a_minor():
    assert estimate_key(np.roll(MINOR_PROFILE, 9)) == Key(tonic="A", mode="minor")


def test_chroma_profile_peaks_on_played_notes():
    y = synth([(60, 0, 2), (64, 0, 2), (67, 0, 2)], 22050)
    profile = chroma_profile(y, 22050)
    assert profile.shape == (12,)
    assert int(profile.argmax()) in (0, 4, 7)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_key.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement**

`engine/src/pianoverse_engine/key.py`:

```python
import librosa
import numpy as np

from .models import Key
from .theory import pc_name

HOP = 2048
# Krumhansl–Kessler key profiles, index 0 = tonic.
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def chroma_profile(y: np.ndarray, sr: int) -> np.ndarray:
    return librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP).sum(axis=1)


def estimate_key(profile: np.ndarray) -> Key:
    best: tuple[float, int, str] = (-2.0, 0, "major")
    for tonic in range(12):
        for mode, template in (("major", MAJOR_PROFILE), ("minor", MINOR_PROFILE)):
            r = float(np.corrcoef(profile, np.roll(template, tonic))[0, 1])
            if r > best[0]:
                best = (r, tonic, mode)
    return Key(tonic=pc_name(best[1]), mode=best[2])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_key.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add engine/src/pianoverse_engine/key.py engine/tests/test_key.py
git commit -m "feat(engine): key estimation"
```

---

### Task 5: Chord recognition

Baseline recognizer: beat-synchronous chroma matched against chord templates, smoothed with Viterbi. Task 12 decides whether it is good enough or needs a learned model (e.g. BTC).

**Files:**
- Create: `engine/src/pianoverse_engine/chords.py`, `engine/tests/test_chords.py`

**Interfaces:**
- Consumes: `ChordSegment` (Task 1); `QUALITY_INTERVALS, chord_pcs, chord_symbol, pc_name` (Task 2).
- Produces: `recognize_chords(y:np.ndarray, sr:int, beats:list[float], duration:float, bass_y:np.ndarray|None=None) -> tuple[list[ChordSegment], list[tuple[float,float]]]`. Returns chord segments (no "N" segments; `quality` is a key of `QUALITY_INTERVALS`; `root`/`bass` are pitch names) plus merged low-confidence time ranges.

- [ ] **Step 1: Write the failing tests**

`engine/tests/test_chords.py`:

```python
import numpy as np
import pytest

from helpers import synth
from pianoverse_engine.chords import recognize_chords

SR = 22050
BEATS = [i * 0.5 for i in range(1, 16)]


def test_recognizes_pop_progression():
    prog = [([48, 52, 55, 60], 0, 2), ([45, 48, 52, 57], 2, 4),
            ([41, 48, 53, 57], 4, 6), ([43, 50, 55, 59], 6, 8)]
    y = synth([(p, s, e) for ps, s, e in prog for p in ps], SR)
    segments, uncertain = recognize_chords(y, SR, BEATS, duration=8.0)
    assert [s.symbol for s in segments] == ["C", "Am", "F", "G"]
    assert segments[1].start == pytest.approx(2.0, abs=0.01)
    assert segments[1].root == "A" and segments[1].quality == "min"
    assert uncertain == []


def test_detects_dominant_seventh():
    y = synth([(p, 0, 4) for p in (43, 47, 50, 53)], SR)
    segments, _ = recognize_chords(y, SR, BEATS[:7], duration=4.0)
    assert [s.symbol for s in segments] == ["G7"]


def test_slash_chord_from_bass_stem():
    y = synth([(p, 0, 4) for p in (60, 64, 67)], SR)
    bass = synth([(40, 0, 4)], SR)
    segments, _ = recognize_chords(y, SR, BEATS[:7], duration=4.0, bass_y=bass)
    assert [s.symbol for s in segments] == ["C/E"]
    assert segments[0].bass == "E"


def test_silence_has_no_chords():
    segments, _ = recognize_chords(np.zeros(SR * 4, dtype=np.float32), SR, BEATS[:7], duration=4.0)
    assert segments == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_chords.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement**

`engine/src/pianoverse_engine/chords.py`:

```python
import librosa
import numpy as np

from .models import ChordSegment
from .theory import QUALITY_INTERVALS, chord_pcs, chord_symbol, pc_name

HOP = 2048
NO_CHORD_SCORE = 0.35      # cosine score of the "no chord" state
SWITCH_PENALTY = 0.3       # cost of changing chord between beats
LOW_CONFIDENCE = 0.6       # mean best score below this → uncertain range
SILENCE_RATIO = 0.05       # segment RMS below this × max RMS → silence

_STATES: list[tuple[int, str]] = [(r, q) for q in QUALITY_INTERVALS for r in range(12)]


def _build_templates() -> np.ndarray:
    t = np.zeros((len(_STATES), 12))
    for i, (root, quality) in enumerate(_STATES):
        t[i, chord_pcs(root, quality)] = 1.0
    return t / np.linalg.norm(t, axis=1, keepdims=True)


_TEMPLATES = _build_templates()


def _bounds(beats: list[float], duration: float) -> np.ndarray:
    inner = sorted(t for t in beats if 0 < t < duration)
    return np.array([0.0, *inner, duration])


def _segment_chroma(y: np.ndarray, sr: int, bounds: np.ndarray) -> np.ndarray:
    """(n_segments, 12) unit-norm chroma; silent segments are all-zero rows."""
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP)
    c_times = librosa.times_like(chroma, sr=sr, hop_length=HOP)
    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    r_times = librosa.times_like(rms, sr=sr, hop_length=HOP)
    n = len(bounds) - 1
    out = np.zeros((n, 12))
    energy = np.zeros(n)
    for i, (a, b) in enumerate(zip(bounds[:-1], bounds[1:])):
        cm = (c_times >= a) & (c_times < b)
        if cm.any():
            out[i] = chroma[:, cm].mean(axis=1)
        rm = (r_times >= a) & (r_times < b)
        if rm.any():
            energy[i] = rms[rm].mean()
    peak = energy.max()
    out[energy < SILENCE_RATIO * (peak if peak > 0 else 1.0)] = 0.0
    norms = np.linalg.norm(out, axis=1, keepdims=True)
    return np.divide(out, norms, out=np.zeros_like(out), where=norms > 0)


def _viterbi(scores: np.ndarray, switch_penalty: float) -> np.ndarray:
    """Best state path where staying is free and any switch costs switch_penalty."""
    n_t, n_s = scores.shape
    dp = scores[0].copy()
    back = np.zeros((n_t, n_s), dtype=int)
    states = np.arange(n_s)
    for t in range(1, n_t):
        best_prev = int(dp.argmax())
        switch = dp[best_prev] - switch_penalty
        stay = dp >= switch
        back[t] = np.where(stay, states, best_prev)
        dp = np.where(stay, dp, switch) + scores[t]
    path = np.empty(n_t, dtype=int)
    path[-1] = int(dp.argmax())
    for t in range(n_t - 1, 0, -1):
        path[t - 1] = back[t, path[t]]
    return path


def _merge_ranges(ranges: list[tuple[float, float]]) -> list[tuple[float, float]]:
    merged: list[tuple[float, float]] = []
    for a, b in ranges:
        if merged and a <= merged[-1][1] + 1e-6:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    return merged


def recognize_chords(
    y: np.ndarray, sr: int, beats: list[float], duration: float,
    bass_y: np.ndarray | None = None,
) -> tuple[list[ChordSegment], list[tuple[float, float]]]:
    bounds = _bounds(beats, duration)
    seg = _segment_chroma(y, sr, bounds)
    scores = np.hstack([seg @ _TEMPLATES.T, np.full((len(seg), 1), NO_CHORD_SCORE)])
    path = _viterbi(scores, SWITCH_PENALTY)
    no_chord = len(_STATES)
    bass_seg = _segment_chroma(bass_y, sr, bounds) if bass_y is not None else None

    segments: list[ChordSegment] = []
    uncertain: list[tuple[float, float]] = []
    i = 0
    while i < len(path):
        j = i
        while j + 1 < len(path) and path[j + 1] == path[i]:
            j += 1
        state = int(path[i])
        if state != no_chord:
            root, quality = _STATES[state]
            start, end = float(bounds[i]), float(bounds[j + 1])
            bass_pc = None
            if bass_seg is not None:
                weights = bass_seg[i:j + 1].sum(axis=0)
                if weights.max() > 0:
                    candidate = int(weights.argmax())
                    if candidate in chord_pcs(root, quality) and candidate != root:
                        bass_pc = candidate
            segments.append(ChordSegment(
                start=start, end=end,
                symbol=chord_symbol(root, quality, bass_pc),
                root=pc_name(root), quality=quality,
                bass=pc_name(bass_pc) if bass_pc is not None else None,
            ))
            if float(scores[i:j + 1, state].mean()) < LOW_CONFIDENCE:
                uncertain.append((start, end))
        i = j + 1
    return segments, _merge_ranges(uncertain)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_chords.py -v`
Expected: 4 passed. If `test_recognizes_pop_progression` shows an extra short chord at a boundary, raise `SWITCH_PENALTY` to `0.4` and re-run; do not change the test.

- [ ] **Step 5: Commit**

```bash
git add engine/src/pianoverse_engine/chords.py engine/tests/test_chords.py
git commit -m "feat(engine): beat-synchronous chord recognition"
```

---

### Task 6: Rhythm, melody cleanup and quantization

**Files:**
- Create: `engine/src/pianoverse_engine/rhythm.py`, `engine/src/pianoverse_engine/melody.py`, `engine/src/pianoverse_engine/arrange/__init__.py`, `engine/src/pianoverse_engine/arrange/quantize.py`, `engine/tests/test_rhythm.py`, `engine/tests/test_melody.py`, `engine/tests/test_quantize.py`

**Interfaces:**
- Consumes: `RawNote, Tempo` (Task 1).
- Produces:
  - `tempo_from_beats(beats:list[float], downbeats:list[float]) -> Tempo`; `time_signature(beats:list[float], downbeats:list[float]) -> tuple[int,int]`
  - `MIN_NOTE_SEC=0.06`, `R_LO=60`, `R_HI=84`; `clean_notes(notes:list[RawNote], min_dur:float=MIN_NOTE_SEC) -> list[RawNote]`; `skyline(notes:list[RawNote]) -> list[RawNote]`; `fit_octave(notes:list[RawNote], lo:int=R_LO, hi:int=R_HI) -> list[RawNote]`
  - `beat_grid(beats:list[float], duration:float, subdivisions:int) -> np.ndarray`; `quantize_monophonic(notes:list[RawNote], grid:np.ndarray) -> list[RawNote]`

- [ ] **Step 1: Write the failing tests**

`engine/tests/test_rhythm.py`:

```python
import pytest

from pianoverse_engine.rhythm import tempo_from_beats, time_signature

BEATS = [i * 0.5 for i in range(1, 25)]


def test_tempo_from_even_beats_is_120():
    tempo = tempo_from_beats(BEATS, [0.5, 2.5])
    assert tempo.bpm == pytest.approx(120.0)
    assert tempo.downbeats == [0.5, 2.5]


def test_three_beats_per_bar():
    assert time_signature(BEATS, [0.5, 2.0, 3.5, 5.0]) == (3, 4)


def test_default_four_four_without_downbeats():
    assert time_signature(BEATS, []) == (4, 4)
```

`engine/tests/test_melody.py`:

```python
from pianoverse_engine.melody import clean_notes, fit_octave, skyline
from pianoverse_engine.models import RawNote


def test_clean_notes_drops_blips():
    notes = [RawNote(60, 0.0, 0.03), RawNote(62, 0.1, 0.5)]
    assert clean_notes(notes) == [RawNote(62, 0.1, 0.5)]


def test_skyline_keeps_highest_of_a_chord():
    notes = [RawNote(60, 0, 1), RawNote(64, 0, 1), RawNote(67, 0, 1)]
    assert skyline(notes) == [RawNote(67, 0, 1)]


def test_skyline_truncates_lower_note_when_higher_enters():
    notes = [RawNote(60, 0.0, 1.0), RawNote(72, 0.5, 1.0)]
    assert skyline(notes) == [RawNote(60, 0.0, 0.5), RawNote(72, 0.5, 1.0)]


def test_skyline_drops_lower_overlapping_note():
    notes = [RawNote(72, 0.0, 1.0), RawNote(60, 0.5, 1.5)]
    assert skyline(notes) == [RawNote(72, 0.0, 1.0)]


def test_fit_octave_moves_low_melody_into_right_hand_range():
    notes = [RawNote(p, i, i + 0.5) for i, p in enumerate([48, 50, 52, 53, 55])]
    fitted = fit_octave(notes)
    assert [n.pitch for n in fitted] == [72, 74, 76, 77, 79]


def test_fit_octave_folds_outliers():
    fitted = fit_octave([RawNote(72, 0, 1), RawNote(96, 1, 2), RawNote(40, 2, 3)])
    assert all(60 <= n.pitch <= 84 for n in fitted)
```

`engine/tests/test_quantize.py`:

```python
import numpy as np
import pytest

from pianoverse_engine.arrange.quantize import beat_grid, quantize_monophonic
from pianoverse_engine.models import RawNote


def test_beat_grid_extends_before_and_after_beats():
    grid = beat_grid([0.5, 1.0, 1.5, 2.0], duration=2.5, subdivisions=2)
    assert np.allclose(grid, np.arange(0.0, 2.51, 0.25))


def test_quantize_snaps_to_grid():
    grid = np.arange(0.0, 2.01, 0.25)
    out = quantize_monophonic([RawNote(72, 0.26, 0.74)], grid)
    assert out == [RawNote(72, 0.25, 0.75)]


def test_quantize_extends_zero_length_notes():
    grid = np.arange(0.0, 2.01, 0.25)
    out = quantize_monophonic([RawNote(72, 0.49, 0.51)], grid)
    assert out == [RawNote(72, 0.5, 0.75)]


def test_quantize_trims_overlaps():
    grid = np.arange(0.0, 2.01, 0.25)
    out = quantize_monophonic([RawNote(72, 0.0, 1.0), RawNote(74, 0.5, 1.0)], grid)
    assert out == [RawNote(72, 0.0, 0.5), RawNote(74, 0.5, 1.0)]


def test_quantize_keeps_one_note_per_onset():
    grid = np.arange(0.0, 2.01, 0.25)
    out = quantize_monophonic([RawNote(76, 0.01, 0.5), RawNote(72, 0.02, 0.5)], grid)
    assert [n.pitch for n in out] == [76]
    assert out[0].start == pytest.approx(0.0)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_rhythm.py tests/test_melody.py tests/test_quantize.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement**

`engine/src/pianoverse_engine/rhythm.py`:

```python
from collections import Counter

import numpy as np

from .models import Tempo


def tempo_from_beats(beats: list[float], downbeats: list[float]) -> Tempo:
    if len(beats) < 2:
        raise ValueError("need at least two beats")
    bpm = 60.0 / float(np.median(np.diff(beats)))
    return Tempo(
        bpm=round(bpm, 1),
        beats=[round(float(b), 3) for b in beats],
        downbeats=[round(float(d), 3) for d in downbeats],
    )


def time_signature(beats: list[float], downbeats: list[float]) -> tuple[int, int]:
    if len(downbeats) < 2:
        return (4, 4)
    b = np.asarray(beats)
    counts = [int(((b >= a - 1e-3) & (b < c - 1e-3)).sum())
              for a, c in zip(downbeats[:-1], downbeats[1:])]
    counts = [c for c in counts if c > 0]
    if not counts:
        return (4, 4)
    n = Counter(counts).most_common(1)[0][0]
    return (n, 4) if 2 <= n <= 7 else (4, 4)
```

`engine/src/pianoverse_engine/melody.py`:

```python
from dataclasses import replace

import numpy as np

from .models import RawNote

MIN_NOTE_SEC = 0.06
R_LO, R_HI = 60, 84


def clean_notes(notes: list[RawNote], min_dur: float = MIN_NOTE_SEC) -> list[RawNote]:
    return [n for n in notes if n.end - n.start >= min_dur]


def skyline(notes: list[RawNote]) -> list[RawNote]:
    """Monophonic top line: at any moment keep only the highest note."""
    out: list[RawNote] = []
    for n in sorted(notes, key=lambda n: (n.start, -n.pitch)):
        if out and n.start < out[-1].end:
            last = out[-1]
            if n.pitch > last.pitch:
                if n.start - last.start < MIN_NOTE_SEC:
                    out.pop()
                else:
                    out[-1] = replace(last, end=n.start)
                out.append(n)
            continue
        out.append(n)
    return out


def fit_octave(notes: list[RawNote], lo: int = R_LO, hi: int = R_HI) -> list[RawNote]:
    """Shift the line by whole octaves so it sits around C5, then fold outliers into [lo, hi]."""
    if not notes:
        return []
    median = float(np.median([n.pitch for n in notes]))
    shift = 12 * round((72 - median) / 12)
    fitted = []
    for n in notes:
        p = n.pitch + shift
        while p < lo:
            p += 12
        while p > hi:
            p -= 12
        fitted.append(replace(n, pitch=p))
    return fitted
```

`engine/src/pianoverse_engine/arrange/__init__.py`:

```python
"""Turn melody + chords into playable two-hand arrangements."""
```

`engine/src/pianoverse_engine/arrange/quantize.py`:

```python
from dataclasses import replace

import numpy as np

from ..models import RawNote


def beat_grid(beats: list[float], duration: float, subdivisions: int) -> np.ndarray:
    """Grid of `subdivisions` points per beat, extrapolated to cover [0, duration]."""
    b = np.asarray(sorted(beats), dtype=float)
    step = float(np.median(np.diff(b)))
    pre = np.arange(b[0], -1e-9, -step)[::-1][:-1]
    post = np.arange(b[-1] + step, duration + step, step)
    full = np.concatenate([pre, b, post])
    points: list[float] = []
    for a, c in zip(full[:-1], full[1:]):
        points.extend(np.linspace(a, c, subdivisions, endpoint=False))
    points.append(float(full[-1]))
    grid = np.asarray(points)
    return grid[grid >= -1e-9]


def quantize_monophonic(notes: list[RawNote], grid: np.ndarray) -> list[RawNote]:
    g = np.asarray(grid)

    def nearest(t: float) -> int:
        return int(np.abs(g - t).argmin())

    snapped: list[RawNote] = []
    for n in sorted(notes, key=lambda n: (n.start, -n.pitch)):
        i, j = nearest(n.start), nearest(n.end)
        if j <= i:
            j = min(i + 1, len(g) - 1)
        if j <= i:
            continue
        start = round(float(g[i]), 6)
        if snapped and snapped[-1].start == start:
            continue
        snapped.append(replace(n, start=start, end=round(float(g[j]), 6)))
    for k in range(len(snapped) - 1):
        if snapped[k].end > snapped[k + 1].start:
            snapped[k] = replace(snapped[k], end=snapped[k + 1].start)
    return snapped
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_rhythm.py tests/test_melody.py tests/test_quantize.py -v`
Expected: all passed

- [ ] **Step 5: Commit**

```bash
git add engine/src/pianoverse_engine/rhythm.py engine/src/pianoverse_engine/melody.py engine/src/pianoverse_engine/arrange engine/tests/test_rhythm.py engine/tests/test_melody.py engine/tests/test_quantize.py
git commit -m "feat(engine): tempo, melody cleanup and quantization"
```

---

### Task 7: Arranger — voicings and difficulty levels

**Files:**
- Create: `engine/src/pianoverse_engine/arrange/voicing.py`, `engine/src/pianoverse_engine/arrange/levels.py`, `engine/tests/test_voicing.py`, `engine/tests/test_levels.py`

**Interfaces:**
- Consumes: `RawNote, Note, Arrangement, ChordSegment` (Task 1); `chord_pcs, pc_of, pitch_at_or_above` (Task 2); `fit_octave` (Task 6); `beat_grid, quantize_monophonic` (Task 6).
- Produces:
  - `LH_LO=38, LH_HI=59, LH_CENTER=50`; `chord_tones(root_pc:int, quality:str) -> list[int]`; `voicings(root_pc:int, quality:str, lo:int=LH_LO, hi:int=LH_HI) -> list[tuple[int,...]]`; `voice_lead(chords:list[tuple[int,str]], lo=LH_LO, hi=LH_HI, center=LH_CENTER) -> list[tuple[int,...]]`; `bass_below(pc:int, ceiling:int) -> int`
  - `arrange_easy / arrange_medium / arrange_hard(melody:list[RawNote], chords:list[ChordSegment], beats:list[float], downbeats:list[float], duration:float) -> Arrangement`; `arrange_original(notes:list[RawNote]) -> Arrangement`

- [ ] **Step 1: Write the failing tests**

`engine/tests/test_voicing.py`:

```python
import pytest

from pianoverse_engine.arrange.voicing import (
    LH_HI, LH_LO, bass_below, chord_tones, voice_lead, voicings,
)
from pianoverse_engine.theory import QUALITY_INTERVALS


def test_seventh_chords_drop_the_fifth():
    assert chord_tones(7, "7") == [7, 11, 5]


def test_c_major_voicings():
    vs = voicings(0, "maj")
    assert {(48, 52, 55), (43, 48, 52), (40, 43, 48)} <= set(vs)


@pytest.mark.parametrize("quality", list(QUALITY_INTERVALS))
@pytest.mark.parametrize("root", range(12))
def test_every_chord_has_a_playable_voicing(root, quality):
    vs = voicings(root, quality)
    assert vs
    for v in vs:
        assert LH_LO <= v[0] and v[-1] <= LH_HI
        assert v[-1] - v[0] <= 12


def test_voice_leading_moves_minimally():
    assert voice_lead([(0, "maj"), (5, "maj")]) == [(48, 52, 55), (48, 53, 57)]


def test_bass_below():
    assert bass_below(0, 48) == 36
    assert bass_below(4, 48) == 40
```

`engine/tests/test_levels.py`:

```python
import pytest

from pianoverse_engine.arrange.levels import (
    arrange_easy, arrange_hard, arrange_medium, arrange_original,
)
from pianoverse_engine.models import Arrangement, ChordSegment, RawNote

BEATS = [i * 0.5 for i in range(16)]
DOWNBEATS = [0.0, 2.0, 4.0, 6.0]
DURATION = 8.0
CHORDS = [
    ChordSegment(start=0, end=2, symbol="C", root="C", quality="maj"),
    ChordSegment(start=2, end=4, symbol="Am", root="A", quality="min"),
    ChordSegment(start=4, end=6, symbol="F", root="F", quality="maj"),
    ChordSegment(start=6, end=8, symbol="G7", root="G", quality="7"),
]
MELODY = [RawNote(p, i * 0.5 + 0.02, i * 0.5 + 0.45, 90)
          for i, p in enumerate([48, 50, 52, 53, 55, 57, 59, 60, 59, 57, 55, 53, 52, 50, 48, 47])]
LEVELS = [arrange_easy, arrange_medium, arrange_hard]


def _sounding(arr: Arrangement, hand: str, t: float) -> list[int]:
    return [n.pitch for n in arr.notes if n.hand == hand and n.start <= t < n.end]


def assert_playable(arr: Arrangement) -> None:
    for n in arr.notes:
        left, right = _sounding(arr, "L", n.start), _sounding(arr, "R", n.start)
        for pitches in (left, right):
            if pitches:
                assert max(pitches) - min(pitches) <= 12
        if left and right:
            assert max(left) < min(right)
    assert all(60 <= n.pitch <= 84 for n in arr.notes if n.hand == "R")


@pytest.mark.parametrize("arrange", LEVELS)
def test_levels_are_playable(arrange):
    arr = arrange(MELODY, CHORDS, BEATS, DOWNBEATS, DURATION)
    assert any(n.hand == "R" for n in arr.notes)
    assert any(n.hand == "L" for n in arr.notes)
    assert_playable(arr)


@pytest.mark.parametrize("arrange", LEVELS)
def test_every_chord_starts_a_left_hand_note(arrange):
    arr = arrange(MELODY, CHORDS, BEATS, DOWNBEATS, DURATION)
    for chord in CHORDS:
        assert any(n.hand == "L" and abs(n.start - chord.start) < 1e-6 for n in arr.notes)


def test_easy_left_hand_is_one_bass_note_per_chord():
    arr = arrange_easy(MELODY, CHORDS, BEATS, DOWNBEATS, DURATION)
    left = [n for n in arr.notes if n.hand == "L"]
    assert [n.pitch % 12 for n in left] == [0, 9, 5, 7]


def test_easy_uses_slash_bass():
    chords = [ChordSegment(start=0, end=2, symbol="C/E", root="C", quality="maj", bass="E")]
    arr = arrange_easy(MELODY[:4], chords, BEATS, DOWNBEATS, DURATION)
    assert [n.pitch % 12 for n in arr.notes if n.hand == "L"] == [4]


def test_medium_restrikes_on_downbeats():
    chords = [ChordSegment(start=0, end=4, symbol="C", root="C", quality="maj")]
    arr = arrange_medium(MELODY[:8], chords, BEATS, [0.0, 2.0], DURATION)
    assert sorted({n.start for n in arr.notes if n.hand == "L"}) == [0.0, 2.0]


def test_hard_adds_harmony_to_the_right_hand():
    melody_only = arrange_medium(MELODY, CHORDS, BEATS, DOWNBEATS, DURATION)
    hard = arrange_hard(MELODY, CHORDS, BEATS, DOWNBEATS, DURATION)
    r_medium = [n for n in melody_only.notes if n.hand == "R"]
    r_hard = [n for n in hard.notes if n.hand == "R"]
    assert len(r_hard) > len(r_medium)


def test_original_splits_hands_at_middle_c():
    arr = arrange_original([RawNote(48, 0, 1, 70), RawNote(64, 0, 1, 70)])
    assert [(n.pitch, n.hand) for n in arr.notes] == [(48, "L"), (64, "R")]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_voicing.py tests/test_levels.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement voicings**

`engine/src/pianoverse_engine/arrange/voicing.py`:

```python
from ..theory import chord_pcs

# Left-hand chord range D2–B3: wide enough (21 semitones) that every
# inversion of every supported chord fits somewhere.
LH_LO, LH_HI, LH_CENTER = 38, 59, 50


def chord_tones(root_pc: int, quality: str) -> list[int]:
    pcs = chord_pcs(root_pc, quality)
    return [pcs[0], pcs[1], pcs[3]] if len(pcs) == 4 else pcs


def voicings(root_pc: int, quality: str, lo: int = LH_LO, hi: int = LH_HI) -> list[tuple[int, ...]]:
    """All close-position inversions of the chord that fit inside [lo, hi]."""
    tones = chord_tones(root_pc, quality)
    found: set[tuple[int, ...]] = set()
    for k in range(len(tones)):
        order = tones[k:] + tones[:k]
        for octave in range(11):
            v = [octave * 12 + order[0]]
            for pc in order[1:]:
                p = v[-1] + 1
                while p % 12 != pc:
                    p += 1
                v.append(p)
            if v[0] >= lo and v[-1] <= hi:
                found.add(tuple(v))
    return sorted(found)


def _mean(v: tuple[int, ...]) -> float:
    return sum(v) / len(v)


def voice_lead(
    chords: list[tuple[int, str]], lo: int = LH_LO, hi: int = LH_HI, center: int = LH_CENTER,
) -> list[tuple[int, ...]]:
    """Pick one voicing per chord, minimising hand movement between chords."""
    out: list[tuple[int, ...]] = []
    prev: tuple[int, ...] | None = None
    for root, quality in chords:
        options = voicings(root, quality, lo, hi)
        if prev is None:
            best = min(options, key=lambda v: (abs(_mean(v) - center), v))
        else:
            p = prev
            best = min(options, key=lambda v: (
                sum(abs(a - b) for a, b in zip(v, p)), abs(_mean(v) - center), v))
        out.append(best)
        prev = best
    return out


def bass_below(pc: int, ceiling: int) -> int:
    """Highest pitch with pitch class pc strictly below ceiling."""
    p = ceiling - 1
    while p % 12 != pc:
        p -= 1
    return p
```

- [ ] **Step 4: Implement levels**

`engine/src/pianoverse_engine/arrange/levels.py`:

```python
from ..melody import fit_octave
from ..models import Arrangement, ChordSegment, Note, RawNote
from ..theory import chord_pcs, pc_of, pitch_at_or_above
from .quantize import beat_grid, quantize_monophonic
from .voicing import bass_below, voice_lead

EASY_BASS_LO = 43          # easy left hand stays in G2–F#3
SPLIT = 60                 # middle C: right hand at/above, left hand below
R_VEL, HARMONY_VEL, L_VEL = 80, 64, 60
ON_BEAT_TOLERANCE = 0.03
EPS = 1e-6


def _sorted(notes: list[Note]) -> Arrangement:
    return Arrangement(notes=sorted(notes, key=lambda n: (n.start, n.pitch)))


def _melody(melody: list[RawNote], beats: list[float], duration: float, subdivisions: int) -> list[RawNote]:
    return quantize_monophonic(fit_octave(melody), beat_grid(beats, duration, subdivisions))


def _right(notes: list[RawNote]) -> list[Note]:
    return [Note(pitch=n.pitch, start=n.start, end=n.end, velocity=R_VEL, hand="R") for n in notes]


def _bass_pc(chord: ChordSegment) -> int:
    return pc_of(chord.bass) if chord.bass else pc_of(chord.root)


def _split_at(start: float, end: float, points: list[float]) -> list[tuple[float, float]]:
    cuts = [start, *[p for p in points if start + EPS < p < end - EPS], end]
    return list(zip(cuts[:-1], cuts[1:]))


def _chord_at(chords: list[ChordSegment], t: float) -> ChordSegment | None:
    for c in chords:
        if c.start - EPS <= t < c.end:
            return c
    return None


def _harmony_below(pitch: int, chord: ChordSegment) -> int | None:
    pcs = set(chord_pcs(pc_of(chord.root), chord.quality))
    for interval in range(3, 10):
        candidate = pitch - interval
        if candidate < SPLIT:
            return None
        if candidate % 12 in pcs:
            return candidate
    return None


def _voicings(chords: list[ChordSegment]) -> list[tuple[int, ...]]:
    return voice_lead([(pc_of(c.root), c.quality) for c in chords])


def arrange_easy(melody, chords, beats, downbeats, duration) -> Arrangement:
    right = _right(_melody(melody, beats, duration, subdivisions=2))
    left = [Note(pitch=pitch_at_or_above(_bass_pc(c), EASY_BASS_LO),
                 start=c.start, end=c.end, velocity=L_VEL, hand="L") for c in chords]
    return _sorted(right + left)


def arrange_medium(melody, chords, beats, downbeats, duration) -> Arrangement:
    right = _right(_melody(melody, beats, duration, subdivisions=4))
    left: list[Note] = []
    for chord, voicing in zip(chords, _voicings(chords)):
        for start, end in _split_at(chord.start, chord.end, downbeats):
            left += [Note(pitch=p, start=start, end=end, velocity=L_VEL, hand="L") for p in voicing]
    return _sorted(right + left)


def arrange_hard(melody, chords, beats, downbeats, duration) -> Arrangement:
    line = _melody(melody, beats, duration, subdivisions=4)
    right = _right(line)
    for n in line:
        chord = _chord_at(chords, n.start)
        on_beat = any(abs(n.start - b) < ON_BEAT_TOLERANCE for b in beats)
        if chord is None or not on_beat:
            continue
        harmony = _harmony_below(n.pitch, chord)
        if harmony is not None:
            right.append(Note(pitch=harmony, start=n.start, end=n.end, velocity=HARMONY_VEL, hand="R"))

    eighths = beat_grid(beats, duration, subdivisions=2)
    left: list[Note] = []
    for chord, voicing in zip(chords, _voicings(chords)):
        pattern = [bass_below(_bass_pc(chord), voicing[0]), *voicing]
        ticks = sorted({chord.start, *[float(t) for t in eighths if chord.start + EPS < t < chord.end - EPS]})
        ends = ticks[1:] + [chord.end]
        for i, (start, end) in enumerate(zip(ticks, ends)):
            left.append(Note(pitch=pattern[i % len(pattern)], start=start, end=end, velocity=L_VEL, hand="L"))
    return _sorted(right + left)


def arrange_original(notes: list[RawNote]) -> Arrangement:
    out = [
        Note(pitch=n.pitch, start=n.start, end=n.end,
             velocity=max(1, min(127, n.velocity)), hand="R" if n.pitch >= SPLIT else "L")
        for n in notes if 21 <= n.pitch <= 108 and n.end > n.start
    ]
    return _sorted(out)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/test_voicing.py tests/test_levels.py -v`
Expected: all passed

- [ ] **Step 6: Commit**

```bash
git add engine/src/pianoverse_engine/arrange engine/tests/test_voicing.py engine/tests/test_levels.py
git commit -m "feat(engine): left-hand voicings and difficulty levels"
```

---

### Task 8: Export (Song JSON + MIDI)

**Files:**
- Create: `engine/src/pianoverse_engine/export.py`, `engine/tests/test_export.py`

**Interfaces:**
- Consumes: `Song, Arrangement` (Task 1).
- Produces: `arrangement_to_midi(arr:Arrangement, bpm:float) -> pretty_midi.PrettyMIDI` (instruments in order "Right hand", "Left hand"); `write_outputs(song:Song, out_dir:Path) -> None` (writes `song.json` and `<level>.mid`).

- [ ] **Step 1: Write the failing tests**

`engine/tests/test_export.py`:

```python
import pretty_midi

from helpers import make_song
from pianoverse_engine.export import write_outputs
from pianoverse_engine.models import Song


def test_write_outputs(tmp_path):
    song = make_song()
    write_outputs(song, tmp_path / "out")
    text = (tmp_path / "out" / "song.json").read_text()
    assert '"bass"' not in text   # None fields are omitted
    assert Song.model_validate_json(text) == song
    pm = pretty_midi.PrettyMIDI(str(tmp_path / "out" / "easy.mid"))
    assert [i.name for i in pm.instruments] == ["Right hand", "Left hand"]
    assert [len(i.notes) for i in pm.instruments] == [1, 1]
    assert pm.instruments[0].notes[0].pitch == 72
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_export.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement**

`engine/src/pianoverse_engine/export.py`:

```python
from pathlib import Path

import pretty_midi

from .models import Arrangement, Song


def arrangement_to_midi(arr: Arrangement, bpm: float) -> pretty_midi.PrettyMIDI:
    pm = pretty_midi.PrettyMIDI(initial_tempo=bpm)
    for hand, name in (("R", "Right hand"), ("L", "Left hand")):
        inst = pretty_midi.Instrument(program=0, name=name)
        inst.notes = [pretty_midi.Note(velocity=n.velocity, pitch=n.pitch, start=n.start, end=n.end)
                      for n in arr.notes if n.hand == hand]
        pm.instruments.append(inst)
    return pm


def write_outputs(song: Song, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "song.json").write_text(song.model_dump_json(indent=2, exclude_none=True))
    for level, arr in song.arrangements.items():
        arrangement_to_midi(arr, song.tempo.bpm).write(str(out_dir / f"{level}.mid"))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_export.py -v`
Expected: 1 passed

- [ ] **Step 5: Run the whole fast suite**

Run: `uv run pytest -v`
Expected: all passed

- [ ] **Step 6: Commit**

```bash
git add engine/src/pianoverse_engine/export.py engine/tests/test_export.py
git commit -m "feat(engine): JSON and MIDI export"
```

---

### Task 9: ML model wrappers (separation, classification, beats, transcription)

**Files:**
- Modify: `engine/pyproject.toml` (via `uv add`)
- Create: `engine/src/pianoverse_engine/separate.py`, `engine/src/pianoverse_engine/classify.py`, `engine/src/pianoverse_engine/beats.py`, `engine/src/pianoverse_engine/transcribe.py`, `engine/tests/test_stems.py`, `engine/tests/test_classify.py`, `engine/tests/test_models_slow.py`

**Interfaces:**
- Consumes: `RawNote, SourceType` (Task 1).
- Produces:
  - `Stems(sr:int, tracks:dict[str,np.ndarray])` with `.mono(name)->np.ndarray`, `.mix(names:Iterable[str])->np.ndarray`, `.energies()->dict[str,float]`, `.save(directory:Path)->dict[str,Path]` (files `<name>.wav`); `separate(path:Path, model_name:str="htdemucs_6s") -> Stems`; `pick_device() -> str`
  - `VOCAL_SHARE=0.15`, `PIANO_SHARE=0.6`; `classify(energies:dict[str,float]) -> SourceType`; `lead_stem(energies:dict[str,float]) -> str`
  - `track_beats(path:Path) -> tuple[list[float], list[float]]`
  - `transcribe_polyphonic(path:Path) -> list[RawNote]`; `transcribe_piano(path:Path) -> list[RawNote]`

- [ ] **Step 1: Write the failing fast tests**

`engine/tests/test_classify.py`:

```python
from pianoverse_engine.classify import classify, lead_stem


def test_song_with_vocals():
    assert classify({"vocals": 0.3, "other": 0.5, "drums": 0.2}) == "vocal"


def test_solo_piano():
    assert classify({"piano": 0.9, "other": 0.05, "vocals": 0.01}) == "solo_piano"


def test_instrumental():
    assert classify({"guitar": 0.4, "other": 0.3, "drums": 0.3, "vocals": 0.02}) == "instrumental"


def test_silent_input_is_instrumental():
    assert classify({}) == "instrumental"


def test_lead_stem_is_loudest_melodic_stem():
    assert lead_stem({"piano": 0.1, "guitar": 0.5, "other": 0.2, "drums": 0.9}) == "guitar"
```

`engine/tests/test_stems.py`:

```python
import numpy as np
import soundfile as sf

from pianoverse_engine.separate import Stems


def _stems() -> Stems:
    ones = np.ones((2, 100), dtype=np.float32)
    return Stems(sr=1000, tracks={"vocals": ones * 0.5, "bass": ones * 0.1})


def test_energies_are_mean_square():
    e = _stems().energies()
    assert np.isclose(e["vocals"], 0.25) and np.isclose(e["bass"], 0.01)


def test_mix_sums_mono_tracks_and_ignores_missing():
    mixed = _stems().mix(["vocals", "bass", "piano"])
    assert mixed.shape == (100,)
    assert np.allclose(mixed, 0.6)


def test_save_writes_wav_per_stem(tmp_path):
    paths = _stems().save(tmp_path)
    assert set(paths) == {"vocals", "bass"}
    data, sr = sf.read(paths["vocals"], always_2d=True)
    assert sr == 1000 and data.shape == (100, 2)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_classify.py tests/test_stems.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement classification and Stems**

`engine/src/pianoverse_engine/classify.py`:

```python
from .models import SourceType

VOCAL_SHARE = 0.15
PIANO_SHARE = 0.6
MELODIC_STEMS = ("piano", "guitar", "other")


def classify(energies: dict[str, float]) -> SourceType:
    total = sum(energies.values())
    if total <= 0:
        return "instrumental"
    if energies.get("vocals", 0.0) / total >= VOCAL_SHARE:
        return "vocal"
    if energies.get("piano", 0.0) / total >= PIANO_SHARE:
        return "solo_piano"
    return "instrumental"


def lead_stem(energies: dict[str, float]) -> str:
    return max(MELODIC_STEMS, key=lambda name: energies.get(name, 0.0))
```

`engine/src/pianoverse_engine/separate.py`:

```python
import os
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf


@dataclass
class Stems:
    sr: int
    tracks: dict[str, np.ndarray]   # name -> (channels, samples)

    def mono(self, name: str) -> np.ndarray:
        return self.tracks[name].mean(axis=0).astype(np.float32)

    def mix(self, names: Iterable[str]) -> np.ndarray:
        present = [self.mono(n) for n in names if n in self.tracks]
        if not present:
            length = next(iter(self.tracks.values())).shape[1]
            return np.zeros(length, dtype=np.float32)
        return np.sum(present, axis=0).astype(np.float32)

    def energies(self) -> dict[str, float]:
        return {name: float(np.mean(t ** 2)) for name, t in self.tracks.items()}

    def save(self, directory: Path) -> dict[str, Path]:
        directory.mkdir(parents=True, exist_ok=True)
        paths = {}
        for name, track in self.tracks.items():
            path = directory / f"{name}.wav"
            sf.write(path, track.T, self.sr)
            paths[name] = path
        return paths


def pick_device() -> str:
    import torch
    if os.environ.get("PIANOVERSE_DEVICE"):
        return os.environ["PIANOVERSE_DEVICE"]
    return "cuda" if torch.cuda.is_available() else "cpu"


def separate(path: Path, model_name: str = "htdemucs_6s") -> Stems:
    """Split a 44.1 kHz stereo wav into drums/bass/other/vocals/guitar/piano."""
    import torch
    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    data, sr = sf.read(path, always_2d=True, dtype="float32")
    model = get_model(model_name)
    model.eval()
    if sr != model.samplerate:
        raise ValueError(f"expected {model.samplerate} Hz input, got {sr}")
    wav = torch.from_numpy(data.T.copy())
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    with torch.no_grad():
        out = apply_model(model, ((wav - mean) / std)[None], device=pick_device(),
                          split=True, overlap=0.25, progress=False)[0]
    out = out * std + mean
    return Stems(sr=sr, tracks={name: out[i].cpu().numpy() for i, name in enumerate(model.sources)})
```

- [ ] **Step 4: Run fast tests to verify they pass**

Run: `uv run pytest tests/test_classify.py tests/test_stems.py -v`
Expected: all passed (no ML dependencies needed yet).

- [ ] **Step 5: Install the ML dependencies**

Run:

```bash
uv add "torch>=2.2,<2.9" "torchaudio>=2.2,<2.9" "demucs==4.0.1" "basic-pitch>=0.4" "piano_transcription_inference>=0.0.6" "beat_this @ https://github.com/CPJKU/beat_this/archive/main.zip"
uv run python -c "import demucs.apply, basic_pitch.inference, piano_transcription_inference, beat_this.inference; print('ok')"
```

Expected: `ok`. If dependency resolution fails, stop and report the exact conflict to the user (do not swap libraries silently); the choice of replacement is a spec decision.

- [ ] **Step 6: Implement the beat and transcription wrappers**

`engine/src/pianoverse_engine/beats.py`:

```python
from pathlib import Path


def track_beats(path: Path) -> tuple[list[float], list[float]]:
    """Beat and downbeat times in seconds (beat_this, CPJKU 2024)."""
    from beat_this.inference import File2Beats

    from .separate import pick_device

    f2b = File2Beats(checkpoint_path="final0", device=pick_device(), dbn=False)
    beats, downbeats = f2b(str(path))
    return [float(b) for b in beats], [float(d) for d in downbeats]
```

`engine/src/pianoverse_engine/transcribe.py`:

```python
import tempfile
from pathlib import Path

from .models import RawNote


def transcribe_polyphonic(path: Path) -> list[RawNote]:
    """Any instrument or voice → notes (Spotify Basic Pitch)."""
    from basic_pitch.inference import predict

    _, _, note_events = predict(str(path))
    return [
        RawNote(int(pitch), float(start), float(end), max(1, min(127, int(round(amp * 127)))))
        for start, end, pitch, amp, _bends in note_events
    ]


def transcribe_piano(path: Path) -> list[RawNote]:
    """Solo piano → faithful notes (ByteDance high-resolution piano transcription)."""
    from piano_transcription_inference import PianoTranscription, load_audio, sample_rate

    from .separate import pick_device

    audio, _ = load_audio(str(path), sr=sample_rate, mono=True)
    transcriptor = PianoTranscription(device=pick_device(), checkpoint_path=None)
    with tempfile.TemporaryDirectory() as tmp:
        result = transcriptor.transcribe(audio, str(Path(tmp) / "out.mid"))
    return [
        RawNote(int(e["midi_note"]), float(e["onset_time"]), float(e["offset_time"]), int(e["velocity"]))
        for e in result["est_note_events"]
    ]
```

- [ ] **Step 7: Write the slow smoke tests**

`engine/tests/test_models_slow.py`:

```python
import numpy as np
import pytest
import soundfile as sf

from helpers import synth
from pianoverse_engine.audio import normalize

pytestmark = pytest.mark.slow
SR = 44100


@pytest.fixture(scope="module")
def arpeggio_wav(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("audio")
    notes = [(p, i * 0.5, i * 0.5 + 0.45) for i, p in enumerate([60, 64, 67, 72] * 6)]
    y = synth(notes, SR)
    src = tmp / "src.wav"
    sf.write(src, np.stack([y, y], axis=1), SR)
    out = tmp / "norm.wav"
    normalize(src, out)
    return out


def test_separate_returns_six_stems(arpeggio_wav):
    from pianoverse_engine.separate import separate
    stems = separate(arpeggio_wav)
    assert set(stems.tracks) == {"drums", "bass", "other", "vocals", "guitar", "piano"}


def test_track_beats_finds_steady_pulse(arpeggio_wav):
    from pianoverse_engine.beats import track_beats
    beats, _ = track_beats(arpeggio_wav)
    assert len(beats) >= 8
    assert np.median(np.diff(beats)) == pytest.approx(0.5, abs=0.1)


def test_basic_pitch_hears_middle_c(arpeggio_wav):
    from pianoverse_engine.transcribe import transcribe_polyphonic
    assert 60 in {n.pitch for n in transcribe_polyphonic(arpeggio_wav)}


def test_piano_transcription_hears_middle_c(arpeggio_wav):
    from pianoverse_engine.transcribe import transcribe_piano
    assert 60 in {n.pitch for n in transcribe_piano(arpeggio_wav)}
```

- [ ] **Step 8: Run the slow tests**

Run: `uv run pytest -m slow -v`
Expected: 4 passed. The first run downloads model weights (Demucs ~80 MB, ByteDance ~170 MB, beat_this checkpoint) and may take several minutes. Sine waves are not a real piano, so if only the piano-transcription test fails on pitch 60, record that and continue: Task 12 judges that model on real recordings.

- [ ] **Step 9: Commit**

```bash
git add engine/pyproject.toml engine/uv.lock engine/src/pianoverse_engine/separate.py engine/src/pianoverse_engine/classify.py engine/src/pianoverse_engine/beats.py engine/src/pianoverse_engine/transcribe.py engine/tests/test_stems.py engine/tests/test_classify.py engine/tests/test_models_slow.py
git commit -m "feat(engine): separation, classification, beat and transcription wrappers"
```

---

### Task 10: Pipeline + CLI

**Files:**
- Create: `engine/src/pianoverse_engine/pipeline.py`, `engine/src/pianoverse_engine/cli.py`, `engine/tests/test_pipeline.py`, `engine/tests/test_cli.py`, `engine/README.md`

**Interfaces:**
- Consumes: everything above — `normalize` (T3), `recognize_chords` (T5), `chroma_profile, estimate_key` (T4), `tempo_from_beats, time_signature` (T6), `clean_notes, skyline` (T6), `arrange_*` (T7), `Stems, classify, lead_stem` (T9), `PipelineError, AudioError, EngineError` (T3), `write_outputs` (T8).
- Produces: `Mode = Literal["auto","vocal","instrumental","solo_piano"]`; `Engines(separate, track_beats, transcribe_polyphonic, transcribe_piano)` dataclass; `default_engines() -> Engines`; `run_pipeline(src:Path, workdir:Path, *, title:str, mode:Mode="auto", song_id:str|None=None, engines:Engines|None=None, progress:Callable[[str,float],None]=...) -> Song`. Progress stages: `"separating"`, `"analyzing"`, `"arranging"`, `"done"`. `cli.main(argv:list[str]|None=None) -> int`.

- [ ] **Step 1: Write the failing pipeline tests**

`engine/tests/test_pipeline.py`:

```python
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from helpers import synth
from pianoverse_engine.errors import PipelineError
from pianoverse_engine.models import RawNote, Song
from pianoverse_engine.pipeline import Engines, run_pipeline
from pianoverse_engine.separate import Stems

SR = 44100
DURATION = 12.0
PROGRESSION = [([48, 52, 55], "C"), ([45, 48, 52], "Am"), ([41, 45, 48], "F"),
               ([43, 47, 50], "G"), ([48, 52, 55], "C"), ([45, 48, 52], "Am")]
MELODY = [RawNote(72 + (i % 5), i * 0.5, i * 0.5 + 0.4, 90) for i in range(24)]


def _stereo(y: np.ndarray) -> np.ndarray:
    y = np.pad(y, (0, max(0, int(DURATION * SR) - len(y))))[: int(DURATION * SR)]
    return np.stack([y, y])


class FakeEngines:
    def __init__(self, vocal_level: float = 1.0):   # 1.0 → vocals ≈ 35% of energy → "vocal"
        self.vocal_level = vocal_level
        self.calls: list[tuple[str, str]] = []

    def separate(self, path: Path) -> Stems:
        chords = synth([(p, i * 2, i * 2 + 2) for i, (ps, _) in enumerate(PROGRESSION) for p in ps], SR)
        bass = synth([(ps[0] - 12, i * 2, i * 2 + 2) for i, (ps, _) in enumerate(PROGRESSION)], SR)
        vocals = synth([(n.pitch, n.start, n.end) for n in MELODY], SR) * self.vocal_level
        silent = np.zeros(int(DURATION * SR), dtype=np.float32)
        return Stems(sr=SR, tracks={
            "vocals": _stereo(vocals), "other": _stereo(chords), "bass": _stereo(bass),
            "drums": _stereo(silent), "guitar": _stereo(silent), "piano": _stereo(silent),
        })

    def track_beats(self, path: Path):
        return [i * 0.5 for i in range(1, 24)], [i * 2.0 for i in range(6)]

    def transcribe_polyphonic(self, path: Path):
        self.calls.append(("polyphonic", path.name))
        return MELODY

    def transcribe_piano(self, path: Path):
        self.calls.append(("piano", path.name))
        return MELODY + [RawNote(48, 0, 2, 70)]

    def engines(self) -> Engines:
        return Engines(separate=self.separate, track_beats=self.track_beats,
                       transcribe_polyphonic=self.transcribe_polyphonic,
                       transcribe_piano=self.transcribe_piano)


@pytest.fixture
def song_file(tmp_path) -> Path:
    path = tmp_path / "song.wav"
    y = synth([(60, 0, DURATION)], SR)
    sf.write(path, np.stack([y, y], axis=1), SR)
    return path


def test_vocal_song_end_to_end(tmp_path, song_file):
    fake = FakeEngines()
    stages: list[str] = []
    song = run_pipeline(song_file, tmp_path / "work", title="Test", engines=fake.engines(),
                        progress=lambda stage, _: stages.append(stage))
    assert song.sourceType == "vocal"
    assert set(song.arrangements) == {"easy", "medium", "hard"}
    assert [c.symbol for c in song.chords][:4] == ["C", "Am", "F", "G"]
    assert song.tempo.bpm == pytest.approx(120.0)
    assert fake.calls == [("polyphonic", "vocals.wav")]
    assert stages == ["separating", "analyzing", "arranging", "done"]
    assert Song.model_validate_json(song.model_dump_json()) == song


def test_mode_override_solo_piano_adds_original(tmp_path, song_file):
    fake = FakeEngines()
    song = run_pipeline(song_file, tmp_path / "work", title="Test", mode="solo_piano", engines=fake.engines())
    assert song.sourceType == "solo_piano"
    assert "original" in song.arrangements
    assert fake.calls == [("piano", "input.wav")]


def test_instrumental_uses_lead_stem(tmp_path, song_file):
    fake = FakeEngines(vocal_level=0.0)
    song = run_pipeline(song_file, tmp_path / "work", title="Test", engines=fake.engines())
    assert song.sourceType == "instrumental"
    assert fake.calls == [("polyphonic", "other.wav")]


def test_no_melody_is_an_error(tmp_path, song_file):
    fake = FakeEngines()
    fake.transcribe_polyphonic = lambda path: []
    with pytest.raises(PipelineError) as err:
        run_pipeline(song_file, tmp_path / "work", title="Test", engines=fake.engines())
    assert err.value.code == "no_melody"


def test_sparse_melody_warns(tmp_path, song_file):
    fake = FakeEngines()
    fake.transcribe_polyphonic = lambda path: MELODY[:2]
    song = run_pipeline(song_file, tmp_path / "work", title="Test", engines=fake.engines())
    assert "melody_sparse" in {w.code for w in song.warnings}
```

`engine/tests/test_cli.py`:

```python
from helpers import make_song
from pianoverse_engine import cli
from pianoverse_engine.errors import AudioError


def test_cli_writes_outputs(tmp_path, monkeypatch):
    monkeypatch.setattr(cli, "run_pipeline", lambda *a, **k: make_song())
    src = tmp_path / "in.mp3"
    src.write_bytes(b"x")
    assert cli.main([str(src), "--out", str(tmp_path / "out")]) == 0
    assert (tmp_path / "out" / "song.json").exists()
    assert (tmp_path / "out" / "easy.mid").exists()


def test_cli_reports_engine_errors(tmp_path, monkeypatch, capsys):
    def boom(*a, **k):
        raise AudioError("too_short", "Η ηχογράφηση είναι πολύ μικρή.")
    monkeypatch.setattr(cli, "run_pipeline", boom)
    src = tmp_path / "in.mp3"
    src.write_bytes(b"x")
    assert cli.main([str(src), "--out", str(tmp_path / "out")]) == 1
    assert "too_short" in capsys.readouterr().err
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_pipeline.py tests/test_cli.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement the pipeline**

`engine/src/pianoverse_engine/pipeline.py`:

```python
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from .arrange.levels import arrange_easy, arrange_hard, arrange_medium, arrange_original
from .audio import normalize
from .chords import recognize_chords
from .classify import classify, lead_stem
from .errors import PipelineError
from .key import chroma_profile, estimate_key
from .melody import clean_notes, skyline
from .models import Arrangement, RawNote, Song, SongWarning
from .rhythm import tempo_from_beats, time_signature
from .separate import Stems

Mode = Literal["auto", "vocal", "instrumental", "solo_piano"]
ProgressFn = Callable[[str, float], None]
HARMONIC_STEMS = ("bass", "other", "guitar", "piano")
SPARSE_MELODY = 0.3


@dataclass
class Engines:
    separate: Callable[[Path], Stems]
    track_beats: Callable[[Path], tuple[list[float], list[float]]]
    transcribe_polyphonic: Callable[[Path], list[RawNote]]
    transcribe_piano: Callable[[Path], list[RawNote]]


def default_engines() -> Engines:
    from .beats import track_beats
    from .separate import separate
    from .transcribe import transcribe_piano, transcribe_polyphonic
    return Engines(separate=separate, track_beats=track_beats,
                   transcribe_polyphonic=transcribe_polyphonic, transcribe_piano=transcribe_piano)


def _no_progress(stage: str, fraction: float) -> None:
    pass


def _warnings(melody: list[RawNote], duration: float,
              uncertain: list[tuple[float, float]]) -> list[SongWarning]:
    out: list[SongWarning] = []
    coverage = sum(n.end - n.start for n in melody) / duration
    if coverage < SPARSE_MELODY:
        out.append(SongWarning(code="melody_sparse",
                               message=f"Η μελωδία εντοπίστηκε μόνο στο {coverage:.0%} του κομματιού."))
    for start, end in uncertain:
        out.append(SongWarning(code="chords_uncertain", message="Αβέβαιες συγχορδίες σε αυτό το σημείο.",
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

    progress("separating", 0.05)
    stems = engines.separate(norm)
    stem_paths = stems.save(workdir / "stems")
    energies = stems.energies()
    source_type = classify(energies) if mode == "auto" else mode

    progress("analyzing", 0.4)
    beats, downbeats = engines.track_beats(norm)
    if len(beats) < 4:
        raise PipelineError("no_beats", "Δεν βρέθηκε σταθερός ρυθμός στο κομμάτι.")
    harmonic = stems.mix(HARMONIC_STEMS)
    bass = stems.mono("bass") if "bass" in stems.tracks else None
    chords, uncertain = recognize_chords(harmonic, stems.sr, beats, duration, bass_y=bass)
    key = estimate_key(chroma_profile(harmonic, stems.sr))

    full_piano: list[RawNote] = []
    if source_type == "solo_piano":
        full_piano = clean_notes(engines.transcribe_piano(norm))
        raw = full_piano
    elif source_type == "vocal":
        raw = clean_notes(engines.transcribe_polyphonic(stem_paths["vocals"]))
    else:
        raw = clean_notes(engines.transcribe_polyphonic(stem_paths[lead_stem(energies)]))
    melody = skyline(raw)
    if not melody:
        raise PipelineError("no_melody", "Δεν μπόρεσα να βρω μελωδία στο κομμάτι.")

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
```

- [ ] **Step 4: Implement the CLI**

`engine/src/pianoverse_engine/cli.py`:

```python
import argparse
import sys
from pathlib import Path

from .errors import EngineError
from .export import write_outputs
from .pipeline import run_pipeline


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pianoverse-engine",
                                     description="Τραγούδι → διασκευή για πιάνο")
    parser.add_argument("input", type=Path, help="αρχείο ήχου (mp3, wav, m4a, …)")
    parser.add_argument("--out", type=Path, required=True, help="φάκελος εξόδου")
    parser.add_argument("--title", help="τίτλος (προεπιλογή: όνομα αρχείου)")
    parser.add_argument("--mode", default="auto",
                        choices=["auto", "vocal", "instrumental", "solo_piano"])
    args = parser.parse_args(argv)

    def progress(stage: str, fraction: float) -> None:
        print(f"[{fraction:4.0%}] {stage}", file=sys.stderr)

    try:
        song = run_pipeline(args.input, args.out / "work", title=args.title or args.input.stem,
                            mode=args.mode, progress=progress)
    except EngineError as err:
        print(f"Σφάλμα ({err.code}): {err.message}", file=sys.stderr)
        return 1
    write_outputs(song, args.out)
    print(args.out / "song.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/test_pipeline.py tests/test_cli.py -v`
Expected: all passed

- [ ] **Step 6: Write the engine README**

`engine/README.md`:

````markdown
# pianoverse-engine

Song audio → playable piano arrangement (Song JSON + MIDI). Design: `docs/superpowers/specs/2026-11-07-pianoverse-design.md`.

## Setup

```bash
brew install ffmpeg
uv sync
```

## Run

```bash
uv run pianoverse-engine path/to/song.mp3 --out out/song
uv run pianoverse-engine piano.m4a --out out/piano --mode solo_piano
```

Writes `song.json` and `easy.mid`, `medium.mid`, `hard.mid` (and `original.mid` for solo piano). First run downloads model weights.

## Test

```bash
uv run pytest            # fast suite
uv run pytest -m slow    # real models (minutes)
```

## Evaluate

Put songs in `samples/` (git-ignored). Optional reference chords go in `samples/<name>.chords.lab` (MIREX format).

```bash
uv run python -m pianoverse_engine.evaluate samples out/eval
```

Then listen to `out/eval/<song>/overlay-<level>.wav` and read `out/eval/report.md`.
````

- [ ] **Step 7: Commit**

```bash
git add engine/src/pianoverse_engine/pipeline.py engine/src/pianoverse_engine/cli.py engine/tests/test_pipeline.py engine/tests/test_cli.py engine/README.md
git commit -m "feat(engine): pipeline orchestration and CLI"
```

---

### Task 11: Evaluation script

**Files:**
- Create: `engine/src/pianoverse_engine/evaluate.py`, `engine/tests/test_evaluate.py`

**Interfaces:**
- Consumes: `run_pipeline` (T10), `write_outputs, arrangement_to_midi` (T8), `load_mono` (T3), `EngineError` (T3), `pc_of, to_mirex` (T2).
- Produces: `overlay(original:np.ndarray, sr:int, arr:Arrangement, bpm:float) -> np.ndarray`; `chord_score(song:Song, lab:Path) -> float`; `main(argv:list[str]|None=None) -> int` writing `<out>/<song>/overlay-<level>.wav` and `<out>/report.md`.

- [ ] **Step 1: Write the failing tests**

`engine/tests/test_evaluate.py`:

```python
import numpy as np
import pytest

from helpers import make_song
from pianoverse_engine.evaluate import chord_score, overlay
from pianoverse_engine.models import ChordSegment


def test_overlay_covers_the_longer_signal():
    song = make_song()
    mixed = overlay(np.zeros(1000, dtype=np.float32), 1000, song.arrangements["easy"], 120)
    assert len(mixed) >= 2000          # the left-hand note lasts 2 s
    assert np.abs(mixed).max() <= 1.0


def test_chord_score_perfect_match(tmp_path):
    lab = tmp_path / "ref.chords.lab"
    lab.write_text("0.0 2.0 C:maj\n2.0 4.0 A:min\n")
    song = make_song(chords=[
        ChordSegment(start=0, end=2, symbol="C", root="C", quality="maj"),
        ChordSegment(start=2, end=4, symbol="Am", root="A", quality="min"),
    ])
    assert chord_score(song, lab) == pytest.approx(1.0)


def test_chord_score_counts_gaps_as_no_chord(tmp_path):
    lab = tmp_path / "ref.chords.lab"
    lab.write_text("0.0 2.0 C:maj\n2.0 4.0 A:min\n")
    song = make_song(chords=[ChordSegment(start=0, end=2, symbol="C", root="C", quality="maj")])
    assert chord_score(song, lab) == pytest.approx(0.5)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_evaluate.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement**

`engine/src/pianoverse_engine/evaluate.py`:

```python
"""Run the engine on every audio file in a folder; write listening renders and a report.

Usage: uv run python -m pianoverse_engine.evaluate SAMPLES_DIR OUT_DIR
"""
import sys
import time
from pathlib import Path

import mir_eval
import numpy as np
import soundfile as sf

from .audio import load_mono
from .errors import EngineError
from .export import arrangement_to_midi, write_outputs
from .models import Arrangement, Song
from .pipeline import run_pipeline
from .theory import pc_of, to_mirex

AUDIO_EXT = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac"}
RENDER_SR = 22050


def _peak_normalize(x: np.ndarray) -> np.ndarray:
    return x / (np.abs(x).max() + 1e-9)


def overlay(original: np.ndarray, sr: int, arr: Arrangement, bpm: float) -> np.ndarray:
    """Original song (quieter) under a sine render of the arrangement."""
    piano = arrangement_to_midi(arr, bpm).synthesize(fs=sr)
    n = max(len(original), len(piano))
    a = np.pad(original, (0, n - len(original)))
    b = np.pad(piano, (0, n - len(piano)))
    return (0.45 * _peak_normalize(a) + 0.55 * _peak_normalize(b)).astype(np.float32)


def chord_score(song: Song, lab: Path) -> float:
    """MIREX major/minor chord accuracy against a reference .lab file."""
    ref_intervals, ref_labels = mir_eval.io.load_labeled_intervals(str(lab))
    intervals: list[list[float]] = []
    labels: list[str] = []
    cursor = 0.0
    for c in song.chords:
        if c.start > cursor + 1e-6:
            intervals.append([cursor, c.start])
            labels.append("N")
        intervals.append([c.start, c.end])
        labels.append(to_mirex(pc_of(c.root), c.quality))
        cursor = c.end
    end = float(ref_intervals.max())
    if cursor < end:
        intervals.append([cursor, end])
        labels.append("N")
    scores = mir_eval.chord.evaluate(ref_intervals, ref_labels, np.array(intervals), labels)
    return float(scores["majmin"])


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    samples, out = Path(args[0]), Path(args[1])
    out.mkdir(parents=True, exist_ok=True)
    rows: list[str] = []
    for path in sorted(samples.iterdir()):
        if path.suffix.lower() not in AUDIO_EXT:
            continue
        dest = out / path.stem
        started = time.time()
        print(f"→ {path.name}", file=sys.stderr)
        try:
            song = run_pipeline(path, dest / "work", title=path.stem)
        except EngineError as err:
            rows.append(f"| {path.stem} | ✗ {err.code} | | | | | | |")
            continue
        write_outputs(song, dest)
        original, sr = load_mono(dest / "work" / "input.wav", sr=RENDER_SR)
        for level, arr in song.arrangements.items():
            sf.write(dest / f"overlay-{level}.wav", overlay(original, sr, arr, song.tempo.bpm), sr)
        lab = samples / f"{path.stem}.chords.lab"
        score = f"{chord_score(song, lab):.0%}" if lab.exists() else "—"
        rows.append(
            f"| {path.stem} | {song.sourceType} | {song.key.tonic} {song.key.mode} | "
            f"{song.tempo.bpm:.0f} | {len(song.chords)} | {score} | {len(song.warnings)} | "
            f"{time.time() - started:.0f}s |"
        )
    report = (
        "# Engine evaluation\n\n"
        "| Τραγούδι | Τύπος | Τονικότητα | BPM | Συγχορδίες | Chord acc. (majmin) | Warnings | Χρόνος |\n"
        "|---|---|---|---|---|---|---|---|\n" + "\n".join(rows) + "\n"
    )
    (out / "report.md").write_text(report)
    print(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_evaluate.py -v`
Expected: 3 passed

- [ ] **Step 5: Run the whole fast suite**

Run: `uv run pytest -v`
Expected: all passed

- [ ] **Step 6: Commit**

```bash
git add engine/src/pianoverse_engine/evaluate.py engine/tests/test_evaluate.py
git commit -m "feat(engine): evaluation script with listening renders"
```

---

### Task 12: Real-song evaluation and decision gate

This task needs the user: they supply songs and judge by ear. No code is planned here. Any model swap that comes out of it is a new plan.

**Files:**
- Modify: `docs/superpowers/specs/2026-11-07-pianoverse-design.md` (add §10 "Αποφάσεις spike")

- [ ] **Step 1: Collect samples from the user**

Ask the user for 3–4 files in `engine/samples/`: at least one song with vocals, one instrumental, one solo piano recording, and one phone-mic recording of a song playing from a speaker. These files are git-ignored and must never be committed.

- [ ] **Step 2: Run the evaluation**

Run: `uv run python -m pianoverse_engine.evaluate samples out/eval`
Expected: `out/eval/report.md` with one row per song and `overlay-*.wav` files. Note the wall-clock time per song (CPU).

- [ ] **Step 3: Listening review with the user**

Ask the user to listen to `overlay-easy.wav` and `overlay-medium.wav` for each song (plus `overlay-original.wav` for solo piano). For each song, record:
- Melody recognizable? (yes / partly / no)
- Chords right? (mostly / some wrong / mostly wrong)
- `sourceType` classified correctly?
- Playable and sounds like the song?

- [ ] **Step 4: Record decisions in the spec**

Append to the spec:

```markdown
## 10. Αποφάσεις spike (ημερομηνία)

| Τραγούδι | Τύπος (σωστός;) | Μελωδία | Συγχορδίες | Χρόνος (CPU) |
|---|---|---|---|---|
| … | … | … | … | … |

- Chord recognizer: κρατάμε template/Viterbi ή αλλάζουμε σε learned μοντέλο (π.χ. BTC);
- Melody: Basic Pitch αρκεί ή δοκιμάζουμε CREPE για τη φωνή;
- Solo piano: ByteDance αρκεί ή δοκιμάζουμε Transkun;
- Thresholds `VOCAL_SHARE` / `PIANO_SHARE`: χρειάζονται αλλαγή;
- **Απόφαση:** προχωράμε στα mockups / χρειάζεται δεύτερος γύρος στη μηχανή.
```

Fill every line with the actual results and the user's verdict.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-11-07-pianoverse-design.md
git commit -m "docs: record engine spike results and decisions"
```
