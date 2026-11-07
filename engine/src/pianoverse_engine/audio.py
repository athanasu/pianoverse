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
