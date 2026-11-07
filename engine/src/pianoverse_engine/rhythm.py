from collections import Counter

import numpy as np

from .models import Tempo


def tempo_from_beats(beats: list[float], downbeats: list[float]) -> Tempo:
    if len(beats) < 2:
        raise ValueError("need at least two beats")
    bpm = 60.0 / float(np.median(np.diff(beats)))
    return Tempo(
        bpm=round(bpm, 1),
        beats=[round(float(b), 3) for b in beats],
        downbeats=[round(float(d), 3) for d in downbeats],
    )


def time_signature(beats: list[float], downbeats: list[float]) -> tuple[int, int]:
    if len(downbeats) < 2:
        return (4, 4)
    b = np.asarray(beats)
    counts = [int(((b >= a - 1e-3) & (b < c - 1e-3)).sum())
              for a, c in zip(downbeats[:-1], downbeats[1:])]
    counts = [c for c in counts if c > 0]
    if not counts:
        return (4, 4)
    n = Counter(counts).most_common(1)[0][0]
    return (n, 4) if 2 <= n <= 7 else (4, 4)
