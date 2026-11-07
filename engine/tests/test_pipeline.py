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
