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
