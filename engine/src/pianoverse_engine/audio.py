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


def _require_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        raise AudioError("ffmpeg_missing", "ffmpeg is not installed on this system.")


def _unreadable() -> AudioError:
    return AudioError("unsupported_format", "Could not read this audio file.")


def _decoded_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-nostats", "-i", str(path), "-map", "0:a:0",
         "-f", "null", "-", "-progress", "pipe:1"],
        capture_output=True, text=True,
    )
    times = [line.removeprefix("out_time_us=") for line in result.stdout.splitlines()
             if line.startswith("out_time_us=")]
    if result.returncode != 0 or not times or not times[-1].isdigit():
        raise _unreadable()
    return int(times[-1]) / 1_000_000


def probe_duration(path: Path) -> float:
    """Duration of an audio file in seconds, read from its header when it has one."""
    _require_ffmpeg()
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise _unreadable()
    try:
        duration = float(result.stdout.strip())
    except ValueError:
        # Browser recordings (MediaRecorder webm) are streamed and carry no duration header.
        duration = _decoded_duration(path)
    if not duration > 0:
        raise _unreadable()
    return duration


def check_duration(duration: float) -> None:
    if duration < MIN_SEC:
        raise AudioError("too_short", "The recording is too short (at least 10 seconds are needed).")
    if duration > MAX_SEC:
        raise AudioError("too_long", "The song is too long (8 minutes at most).")


def normalize(src: Path, dst: Path) -> float:
    """Convert any audio file to 44.1 kHz stereo wav; return its duration."""
    _require_ffmpeg()
    result = subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(src),
         "-ac", "2", "-ar", str(TARGET_SR), "-c:a", "pcm_s16le", str(dst)],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise _unreadable()
    data, sr = sf.read(dst, always_2d=True, dtype="float32")
    duration = len(data) / sr
    check_duration(duration)
    if float(np.sqrt(np.mean(data ** 2))) < SILENCE_RMS:
        raise AudioError("silent", "Nothing is audible in the recording.")
    return duration


def load_mono(path: Path, sr: int | None = None) -> tuple[np.ndarray, int]:
    data, file_sr = sf.read(path, always_2d=True, dtype="float32")
    y = data.mean(axis=1)
    if sr is not None and sr != file_sr:
        y = librosa.resample(y, orig_sr=file_sr, target_sr=sr)
        return y.astype(np.float32), sr
    return y, file_sr
