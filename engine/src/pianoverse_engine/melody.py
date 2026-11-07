from dataclasses import replace

import numpy as np

from .models import RawNote

MIN_NOTE_SEC = 0.06
R_LO, R_HI = 60, 84
GHOST_RATIO = 0.6


def clean_notes(notes: list[RawNote], min_dur: float = MIN_NOTE_SEC) -> list[RawNote]:
    return [n for n in notes if n.end - n.start >= min_dur]


def drop_ghost_notes(notes: list[RawNote], ratio: float = GHOST_RATIO) -> list[RawNote]:
    """Drop quiet notes (Basic Pitch overtone ghosts) that sound under a much louder note."""
    ordered = sorted(notes, key=lambda n: (n.start, n.pitch))
    loudest = [n.velocity for n in ordered]
    for i, n in enumerate(ordered):
        for j in range(i + 1, len(ordered)):
            other = ordered[j]
            if other.start >= n.end:
                break
            loudest[i] = max(loudest[i], other.velocity)
            loudest[j] = max(loudest[j], n.velocity)
    return [n for n, top in zip(ordered, loudest) if n.velocity >= ratio * top]


def skyline(notes: list[RawNote]) -> list[RawNote]:
    """Monophonic top line: at any moment keep only the highest note."""
    out: list[RawNote] = []
    for n in sorted(notes, key=lambda n: (n.start, -n.pitch)):
        if out and n.start < out[-1].end:
            last = out[-1]
            if n.pitch > last.pitch:
                if n.start - last.start < MIN_NOTE_SEC:
                    out.pop()
                else:
                    out[-1] = replace(last, end=n.start)
                out.append(n)
            continue
        out.append(n)
    return out


def fit_octave(notes: list[RawNote], lo: int = R_LO, hi: int = R_HI) -> list[RawNote]:
    """Shift the line by whole octaves so it sits around C5, then fold outliers into [lo, hi]."""
    if not notes:
        return []
    median = float(np.median([n.pitch for n in notes]))
    shift = 12 * round((72 - median) / 12)
    fitted = []
    for n in notes:
        p = n.pitch + shift
        while p < lo:
            p += 12
        while p > hi:
            p -= 12
        fitted.append(replace(n, pitch=p))
    return fitted
