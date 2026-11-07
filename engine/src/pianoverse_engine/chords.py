import librosa
import numpy as np

from .models import ChordSegment
from .theory import QUALITY_INTERVALS, chord_pcs, chord_symbol, pc_name

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


def _bounds(beats: list[float], duration: float) -> np.ndarray:
    inner = sorted(t for t in beats if 0 < t < duration)
    return np.array([0.0, *inner, duration])


def _segment_chroma(y: np.ndarray, sr: int, bounds: np.ndarray) -> np.ndarray:
    """(n_segments, 12) unit-norm chroma; silent segments are all-zero rows."""
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP)
    c_times = librosa.times_like(chroma, sr=sr, hop_length=HOP)
    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    r_times = librosa.times_like(rms, sr=sr, hop_length=HOP)
    n = len(bounds) - 1
    out = np.zeros((n, 12))
    energy = np.zeros(n)
    for i, (a, b) in enumerate(zip(bounds[:-1], bounds[1:])):
        cm = (c_times >= a) & (c_times < b)
        if cm.any():
            out[i] = chroma[:, cm].mean(axis=1)
        rm = (r_times >= a) & (r_times < b)
        if rm.any():
            energy[i] = rms[rm].mean()
    peak = energy.max()
    out[energy < SILENCE_RATIO * (peak if peak > 0 else 1.0)] = 0.0
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


def recognize_chords(
    y: np.ndarray, sr: int, beats: list[float], duration: float,
    bass_y: np.ndarray | None = None,
) -> tuple[list[ChordSegment], list[tuple[float, float]]]:
    bounds = _bounds(beats, duration)
    seg = _segment_chroma(y, sr, bounds)
    scores = np.hstack([seg @ _TEMPLATES.T, np.full((len(seg), 1), NO_CHORD_SCORE)])
    path = _viterbi(scores, SWITCH_PENALTY)
    no_chord = len(_STATES)
    bass_seg = _segment_chroma(bass_y, sr, bounds) if bass_y is not None else None

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
            bass_pc = None
            if bass_seg is not None:
                weights = bass_seg[i:j + 1].sum(axis=0)
                if weights.max() > 0:
                    candidate = int(weights.argmax())
                    if candidate in chord_pcs(root, quality) and candidate != root:
                        bass_pc = candidate
            segments.append(ChordSegment(
                start=start, end=end,
                symbol=chord_symbol(root, quality, bass_pc),
                root=pc_name(root), quality=quality,
                bass=pc_name(bass_pc) if bass_pc is not None else None,
            ))
            if float(scores[i:j + 1, state].mean()) < LOW_CONFIDENCE:
                uncertain.append((start, end))
        i = j + 1
    return segments, _merge_ranges(uncertain)
