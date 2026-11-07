import numpy as np
import pytest
import soundfile as sf

from helpers import synth
from pianoverse_engine import beats


@pytest.fixture
def click_track(tmp_path):
    sr = 22050
    y = synth([(84, i * 0.5, i * 0.5 + 0.05) for i in range(24)], sr)
    path = tmp_path / "clicks.wav"
    sf.write(path, y, sr)
    return path


def test_falls_back_to_librosa_when_beat_this_finds_nothing(click_track, monkeypatch):
    monkeypatch.setattr(beats, "_beat_this", lambda path: ([], []))
    found, downbeats = beats.track_beats(click_track)
    assert len(found) >= 8
    assert np.median(np.diff(found)) == pytest.approx(0.5, abs=0.05)
    assert downbeats == []


def test_keeps_beat_this_result_when_it_has_enough_beats(click_track, monkeypatch):
    expected = ([0.5, 1.0, 1.5, 2.0], [0.5])
    monkeypatch.setattr(beats, "_beat_this", lambda path: expected)
    assert beats.track_beats(click_track) == expected
