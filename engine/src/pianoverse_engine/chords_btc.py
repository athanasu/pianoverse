"""Chord recognition with the BTC transformer (vendor/btc), trained on full song mixes."""
import hashlib
import io
import urllib.request
from collections import Counter
from functools import lru_cache
from pathlib import Path

import librosa
import numpy as np

from .chords import _bounds, _merge_ranges, with_bass
from .errors import PipelineError
from .models import ChordSegment
from .separate import Stems
from .theory import chord_symbol, pc_name, pc_of
from .vendor.btc.config import CONFIG
from .vendor.btc.vocab import idx2voca_chord

LOW_CONFIDENCE = 0.5    # mean max-probability below this → uncertain range
WEIGHTS_URL = ("https://raw.githubusercontent.com/jayg996/BTC-ISMIR19/"
               "2682317be668032e6e4b269ded36adaa2ad57df0/test/btc_model_large_voca.pt")
WEIGHTS_SHA256 = "1673d23f8f9a55ae7f9e8b80a51da616debb22675b8d8b67ea6ce0ef37b0ab51"
CACHE_DIR = Path.home() / ".cache" / "pianoverse"
DOWNLOAD_TIMEOUT = 60  # seconds without data before giving up

SR = CONFIG["mp3"]["song_hz"]
CHUNK_SECONDS = CONFIG["mp3"]["inst_len"]
HOP = CONFIG["feature"]["hop_length"]
TIMESTEP = CONFIG["model"]["timestep"]

_QUALITY = {"maj": "maj", "min": "min", "7": "7", "maj7": "maj7", "min7": "m7",
            "sus2": "sus2", "sus4": "sus4", "dim": "dim", "aug": "aug",
            "maj6": "maj", "min6": "min", "minmaj7": "min", "dim7": "dim", "hdim7": "dim"}
_LABELS = idx2voca_chord()


def map_label(label: str) -> tuple[str, str] | None:
    """BTC label ("A:min7", "G", "N") → (root name, our quality); None for no chord."""
    if label in ("N", "X"):
        return None
    root, _, quality = label.partition(":")
    return pc_name(pc_of(root)), _QUALITY[quality or "maj"]


def frames_to_segments(
    frame_times: np.ndarray, frame_labels: list[str], frame_probs: np.ndarray,
    beats: list[float], duration: float,
) -> tuple[list[ChordSegment], list[tuple[float, float]]]:
    """Per-frame BTC predictions → beat-aligned chord segments (no bass) and uncertain ranges."""
    times = np.asarray(frame_times, dtype=float)
    probs = np.asarray(frame_probs, dtype=float)
    mapped = [map_label(label) for label in frame_labels]
    bounds = _bounds(beats, duration)

    runs: list[tuple[tuple[str, str] | None, float, float, list[float]]] = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        idx = np.flatnonzero((times >= a) & (times < b))
        if idx.size == 0:
            idx = np.array([int(np.abs(times - (a + b) / 2).argmin())])
        votes = Counter(mapped[k] for k in idx)
        top = max(votes.values())
        label = max((lab for lab, n in votes.items() if n == top),
                    key=lambda lab: probs[[k for k in idx if mapped[k] == lab]].mean())
        if runs and runs[-1][0] == label:
            runs[-1] = (label, runs[-1][1], float(b), runs[-1][3] + list(probs[idx]))
        else:
            runs.append((label, float(a), float(b), list(probs[idx])))

    segments: list[ChordSegment] = []
    uncertain: list[tuple[float, float]] = []
    for label, start, end, run_probs in runs:
        if label is None:
            continue
        root, quality = label
        segments.append(ChordSegment(start=start, end=end, symbol=chord_symbol(pc_of(root), quality),
                                     root=root, quality=quality))
        if float(np.mean(run_probs)) < LOW_CONFIDENCE:
            uncertain.append((start, end))
    return segments, _merge_ranges(uncertain)


def _download(url: str, dest: Path) -> None:
    part = dest.with_suffix(".part")
    try:
        with urllib.request.urlopen(url, timeout=DOWNLOAD_TIMEOUT) as response, open(part, "wb") as f:
            while chunk := response.read(1 << 20):
                f.write(chunk)
    except OSError as exc:   # URLError, HTTPError and TimeoutError are all OSErrors
        part.unlink(missing_ok=True)
        raise PipelineError("chord_model_download",
                            "Δεν μπόρεσα να κατεβάσω το μοντέλο συγχορδιών. Έλεγξε τη σύνδεση στο διαδίκτυο.") from exc
    part.replace(dest)


def ensure_weights(cache_dir: Path = CACHE_DIR) -> bytes:
    """The verified BTC checkpoint bytes, downloading the file on first use."""
    path = cache_dir / "btc_model_large_voca.pt"
    if not path.exists():
        cache_dir.mkdir(parents=True, exist_ok=True)
        _download(WEIGHTS_URL, path)
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != WEIGHTS_SHA256:
        path.unlink()
        raise PipelineError("chord_model_corrupt",
                            "Το μοντέλο συγχορδιών κατέβηκε αλλοιωμένο. Δοκίμασε ξανά.")
    return data


@lru_cache(maxsize=1)
def _load_model():
    import torch

    from .vendor.btc.btc_model import BTC_model

    # Pinned upstream checkpoint that pickles numpy mean/std; loaded from the SHA-256-checked bytes.
    checkpoint = torch.load(io.BytesIO(ensure_weights()), map_location="cpu", weights_only=False)
    model = BTC_model(config=CONFIG["model"])
    model.load_state_dict(checkpoint["model"])
    model.eval()
    return model, float(checkpoint["mean"]), float(checkpoint["std"])


def btc_features(y: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
    """BTC's audio_file_to_features: log-CQT of 10 s chunks → (n_frames, 144) features and frame times."""
    if sr != SR:
        y = librosa.resample(y, orig_sr=sr, target_sr=SR)
    chunk = int(SR * CHUNK_SECONDS)
    starts = list(range(0, len(y), chunk))
    pieces, times = [], []
    for start in starts:
        cqt = librosa.cqt(y[start:start + chunk], sr=SR, n_bins=CONFIG["feature"]["n_bins"],
                          bins_per_octave=CONFIG["feature"]["bins_per_octave"], hop_length=HOP)
        pieces.append(cqt)
        times.append(start / SR + np.arange(cqt.shape[1]) * HOP / SR)
    feature = np.log(np.abs(np.concatenate(pieces, axis=1)) + 1e-6)
    return feature.T, np.concatenate(times)


def predict_frames(y: np.ndarray, sr: int) -> tuple[np.ndarray, list[str], np.ndarray]:
    """Frame times, argmax BTC labels and their softmax probabilities."""
    import torch

    model, mean, std = _load_model()
    feature, times = btc_features(y, sr)
    n = feature.shape[0]
    feature = (feature - mean) / std
    feature = np.pad(feature, ((0, TIMESTEP - n % TIMESTEP), (0, 0)))
    windows = torch.tensor(feature, dtype=torch.float32).view(-1, TIMESTEP, feature.shape[1])
    with torch.no_grad():
        probs = torch.softmax(model(windows), dim=-1).reshape(-1, len(_LABELS))[:n].numpy()
    best = probs.argmax(axis=1)
    return times, [_LABELS[int(k)] for k in best], probs.max(axis=1)


def recognize_chords_btc(
    stems: Stems, beats: list[float], duration: float,
) -> tuple[list[ChordSegment], list[tuple[float, float]]]:
    """BTC on the full mix (it was trained on full songs); the bass stem adds slash chords."""
    times, labels, probs = predict_frames(stems.mix(stems.tracks), stems.sr)
    segments, uncertain = frames_to_segments(times, labels, probs, beats, duration)
    if "bass" in stems.tracks:
        segments = with_bass(segments, stems.mono("bass"), stems.sr, _bounds(beats, duration))
    return segments, uncertain
