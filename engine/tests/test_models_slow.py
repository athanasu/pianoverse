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
