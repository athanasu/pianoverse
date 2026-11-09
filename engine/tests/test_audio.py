import subprocess

import numpy as np
import pytest
import soundfile as sf

from pianoverse_engine.audio import check_duration, load_mono, normalize, probe_duration
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


def test_probe_duration_reads_the_header(tmp_path):
    src = tmp_path / "in.wav"
    sf.write(src, _sine(12, 22050), 22050)
    assert probe_duration(src) == pytest.approx(12.0, abs=0.01)


def test_probe_duration_decodes_streamed_webm_without_a_duration_header(tmp_path):
    wav = tmp_path / "in.wav"
    sf.write(wav, _sine(11, 48000), 48000)
    # Writing to a pipe is how MediaRecorder-style webm ends up without a duration header.
    webm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(wav), "-c:a", "libopus", "-f", "webm", "pipe:1"],
                          capture_output=True, check=True).stdout
    src = tmp_path / "rec.webm"
    src.write_bytes(webm)
    assert probe_duration(src) == pytest.approx(11.0, abs=0.1)


def test_probe_duration_times_out_as_unsupported(tmp_path, monkeypatch):
    def hang(cmd, **kwargs):
        raise subprocess.TimeoutExpired(cmd, kwargs["timeout"])

    monkeypatch.setattr(subprocess, "run", hang)
    with pytest.raises(AudioError) as err:
        probe_duration(tmp_path / "in.mp3")
    assert err.value.code == "unsupported_format"


def test_probe_duration_rejects_non_audio(tmp_path):
    src = tmp_path / "in.mp3"
    src.write_bytes(b"definitely not audio")
    with pytest.raises(AudioError) as err:
        probe_duration(src)
    assert err.value.code == "unsupported_format"


@pytest.mark.parametrize("duration,code", [(9.9, "too_short"), (480.1, "too_long")])
def test_check_duration_rejects(duration, code):
    with pytest.raises(AudioError) as err:
        check_duration(duration)
    assert err.value.code == code


@pytest.mark.parametrize("duration", [10.0, 200.0, 480.0])
def test_check_duration_accepts(duration):
    check_duration(duration)
