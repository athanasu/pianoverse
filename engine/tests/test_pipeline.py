import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from helpers import synth
from pianoverse_engine.chords import recognize_chords_from_stems
from pianoverse_engine.chords_btc import ensure_weights, recognize_chords_btc
from pianoverse_engine.errors import PipelineError
from pianoverse_engine.models import ChordSegment, Preview, RawNote, Song
from pianoverse_engine.pipeline import (
    Engines, _mmss, _warnings, default_engines, preview_chords, run_pipeline,
)
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
        self.recognize_chords = recognize_chords_from_stems
        self.prepare = None

    def separate(self, path: Path) -> Stems:
        self.calls.append(("separate", path.name))
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
                       transcribe_piano=self.transcribe_piano, recognize_chords=self.recognize_chords,
                       prepare=self.prepare)


@pytest.fixture
def song_file(tmp_path) -> Path:
    path = tmp_path / "song.wav"
    y = synth([(60, 0, DURATION)], SR)
    sf.write(path, np.stack([y, y], axis=1), SR)
    return path


def test_vocal_song_end_to_end(tmp_path, song_file):
    fake = FakeEngines()
    song = run_pipeline(song_file, tmp_path / "work", title="Test", engines=fake.engines())
    assert song.sourceType == "vocal"
    assert set(song.arrangements) == {"easy", "medium", "hard"}
    assert [c.symbol for c in song.chords][:4] == ["C", "Am", "F", "G"]
    assert song.tempo.bpm == pytest.approx(120.0)
    assert fake.calls == [("separate", "input.wav"), ("polyphonic", "vocals.wav")]
    assert Song.model_validate_json(song.model_dump_json()) == song


def test_progress_stages_and_preview_arrive_in_order(tmp_path, song_file):
    events: list[tuple[str, float] | Preview] = []
    song = run_pipeline(song_file, tmp_path / "work", title="Test", engines=FakeEngines().engines(),
                        progress=lambda stage, fraction: events.append((stage, fraction)),
                        on_preview=events.append)
    previews = [e for e in events if isinstance(e, Preview)]
    assert [e if isinstance(e, tuple) else "preview" for e in events] == [
        ("separating", 0.05), ("analyzing", 0.35), "preview", ("melody", 0.6), ("arranging", 0.85), ("done", 1.0),
    ]
    assert previews == [Preview(key=song.key, bpm=song.tempo.bpm, timeSignature=song.timeSignature,
                                chords=["C", "Am", "F", "G"])]


def test_preview_chords_are_the_first_four_distinct_symbols_without_no_chord():
    symbols = ["N", "C", "C", "Am", "N", "C", "F", "G", "Em"]
    segments = [ChordSegment(start=i, end=i + 1, symbol=s, root=s[0], quality="maj") for i, s in enumerate(symbols)]
    assert preview_chords(segments) == ["C", "Am", "F", "G"]
    assert preview_chords(segments[:3]) == ["C"]


def test_mode_override_solo_piano_adds_original(tmp_path, song_file):
    fake = FakeEngines()
    song = run_pipeline(song_file, tmp_path / "work", title="Test", mode="solo_piano", engines=fake.engines())
    assert song.sourceType == "solo_piano"
    assert "original" in song.arrangements
    assert fake.calls == [("separate", "input.wav"), ("piano", "input.wav")]


def test_instrumental_uses_lead_stem(tmp_path, song_file):
    fake = FakeEngines(vocal_level=0.0)
    song = run_pipeline(song_file, tmp_path / "work", title="Test", engines=fake.engines())
    assert song.sourceType == "instrumental"
    assert fake.calls == [("separate", "input.wav"), ("polyphonic", "other.wav")]


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


def test_overtone_ghosts_do_not_garble_the_melody(tmp_path, song_file):
    fake = FakeEngines()
    ghosts = [RawNote(n.pitch + 19, n.start, n.end, 40) for n in MELODY]
    fake.transcribe_polyphonic = lambda path: MELODY + ghosts
    song = run_pipeline(song_file, tmp_path / "work", title="Test", engines=fake.engines())
    right = [n.pitch % 12 for n in song.arrangements["easy"].notes if n.hand == "R"]
    assert right == [n.pitch % 12 for n in MELODY]


def test_mmss_formats_minutes_and_two_digit_seconds():
    assert _mmss(80.4) == "1:20"
    assert _mmss(5.9) == "0:05"


def test_uncertain_chords_warning_names_the_time_range():
    warnings = _warnings(MELODY, 12.0, [(80.0, 105.0)])
    uncertain = [w for w in warnings if w.code == "chords_uncertain"]
    assert [w.message for w in uncertain] == ["Uncertain chords at 1:20–1:45."]
    assert (uncertain[0].start, uncertain[0].end) == (80.0, 105.0)


def test_pipeline_uses_the_chord_engine_with_stems_and_beats(tmp_path, song_file):
    fake = FakeEngines()
    seen = []

    def recognize(stems, beats, duration):
        seen.append((sorted(stems.tracks), len(beats), duration))
        return [ChordSegment(start=0, end=12, symbol="Dm", root="D", quality="min")], [(0.0, 12.0)]

    fake.recognize_chords = recognize
    song = run_pipeline(song_file, tmp_path / "work", title="Test", engines=fake.engines())
    assert [c.symbol for c in song.chords] == ["Dm"]
    assert seen == [(["bass", "drums", "guitar", "other", "piano", "vocals"], 23, pytest.approx(song.durationSec))]
    assert "chords_uncertain" in {w.code for w in song.warnings}


def test_default_engines_recognize_chords_with_btc():
    engines = default_engines()
    assert engines.recognize_chords is recognize_chords_btc
    assert engines.prepare is ensure_weights


def test_default_engines_do_not_import_torch():
    code = ("import sys; from pianoverse_engine.pipeline import default_engines; default_engines(); "
            "assert 'torch' not in sys.modules")
    assert subprocess.run([sys.executable, "-c", code]).returncode == 0


def test_failed_preparation_stops_before_separation(tmp_path, song_file):
    fake = FakeEngines()

    def offline():
        raise PipelineError("chord_model_download", "offline")

    fake.prepare = offline
    with pytest.raises(PipelineError) as err:
        run_pipeline(song_file, tmp_path / "work", title="Test", engines=fake.engines())
    assert err.value.code == "chord_model_download"
    assert fake.calls == []
