import warnings

import librosa
import numpy as np

from .models import ChordSegment
from .separate import HARMONIC_STEMS, Stems
from .theory import QUALITY_INTERVALS, chord_pcs, chord_symbol, pc_name, pc_of

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


def estimate_tuning(y: np.ndarray, sr: int) -> float:
    """Tuning offset in fractions of a bin; 0.0 when the signal has no pitched content."""
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message="Trying to estimate tuning from empty frequency set")
        tuning = float(librosa.estimate_tuning(y=y, sr=sr))
    return tuning if np.isfinite(tuning) else 0.0


def _bounds(beats: list[float], duration: float) -> np.ndarray:
    inner = sorted(t for t in beats if 0 < t < duration)
    return np.array([0.0, *inner, duration])


def sounding_segments(y: np.ndarray, sr: int, bounds: np.ndarray) -> np.ndarray:
    """Per segment: is its mean RMS at least SILENCE_RATIO of the loudest segment's?"""
    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    r_times = librosa.times_like(rms, sr=sr, hop_length=HOP)
    energy = np.zeros(len(bounds) - 1)
    for i, (a, b) in enumerate(zip(bounds[:-1], bounds[1:])):
        rm = (r_times >= a) & (r_times < b)
        if rm.any():
            energy[i] = rms[rm].mean()
    peak = energy.max()
    return energy >= SILENCE_RATIO * (peak if peak > 0 else 1.0)


def _segment_chroma(y: np.ndarray, sr: int, bounds: np.ndarray) -> np.ndarray:
    """(n_segments, 12) unit-norm chroma; silent segments are all-zero rows."""
    n = len(bounds) - 1
    if np.max(np.abs(y), initial=0.0) == 0:
        return np.zeros((n, 12))
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP, tuning=estimate_tuning(y, sr))
    c_times = librosa.times_like(chroma, sr=sr, hop_length=HOP)
    out = np.zeros((n, 12))
    for i, (a, b) in enumerate(zip(bounds[:-1], bounds[1:])):
        cm = (c_times >= a) & (c_times < b)
        if cm.any():
            out[i] = chroma[:, cm].mean(axis=1)
    out[~sounding_segments(y, sr, bounds)] = 0.0
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


def with_bass(
    segments: list[ChordSegment], bass_y: np.ndarray, sr: int, bounds: np.ndarray,
) -> list[ChordSegment]:
    """Slash chords: the strongest bass pitch class over each segment, if it is a chord tone other than the root."""
    bass_seg = _segment_chroma(bass_y, sr, bounds)
    out: list[ChordSegment] = []
    for seg in segments:
        rows = (bounds[:-1] >= seg.start - 1e-9) & (bounds[1:] <= seg.end + 1e-9)
        weights = bass_seg[rows].sum(axis=0)
        root = pc_of(seg.root)
        bass_pc = None
        if weights.max(initial=0.0) > 0:
            candidate = int(weights.argmax())
            if candidate in chord_pcs(root, seg.quality) and candidate != root:
                bass_pc = candidate
        if bass_pc is None:
            out.append(seg)
        else:
            out.append(seg.model_copy(update={"symbol": chord_symbol(root, seg.quality, bass_pc),
                                              "bass": pc_name(bass_pc)}))
    return out


def recognize_chords(
    y: np.ndarray, sr: int, beats: list[float], duration: float,
    bass_y: np.ndarray | None = None,
) -> tuple[list[ChordSegment], list[tuple[float, float]]]:
    bounds = _bounds(beats, duration)
    seg = _segment_chroma(y, sr, bounds)
    scores = np.hstack([seg @ _TEMPLATES.T, np.full((len(seg), 1), NO_CHORD_SCORE)])
    path = _viterbi(scores, SWITCH_PENALTY)
    no_chord = len(_STATES)

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
            segments.append(ChordSegment(start=start, end=end, symbol=chord_symbol(root, quality),
                                         root=pc_name(root), quality=quality))
            if float(scores[i:j + 1, state].mean()) < LOW_CONFIDENCE:
                uncertain.append((start, end))
        i = j + 1
    if bass_y is not None:
        segments = with_bass(segments, bass_y, sr, bounds)
    return segments, _merge_ranges(uncertain)


def recognize_chords_from_stems(
    stems: Stems, beats: list[float], duration: float,
) -> tuple[list[ChordSegment], list[tuple[float, float]]]:
    """Template recognizer on the harmonic stems, with the bass stem for slash chords."""
    bass = stems.mono("bass") if "bass" in stems.tracks else None
    return recognize_chords(stems.mix(HARMONIC_STEMS), stems.sr, beats, duration, bass_y=bass)
