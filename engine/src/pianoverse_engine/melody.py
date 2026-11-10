from dataclasses import replace

import numpy as np

from .models import RawNote

MIN_NOTE_SEC = 0.06
R_LO, R_HI = 60, 84
GHOST_RATIO = 0.6
REGISTER_WINDOW_SEC = 4.0   # how far around a note its "local register" looks
REGISTER_REACH = 9          # semitones a melody note may sit from that register
DIP_DEPTH = 7               # a note this far below both neighbours is an inner voice, not the tune
ORNAMENT_MAX_SEC = 0.25     # a neighbour-note flick shorter than this is an ornament
LEGATO_GAP_SEC = 0.06       # notes closer than this are heard as joined


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


def _local_register(notes: list[RawNote], window: float) -> list[float]:
    """Duration-weighted median pitch of the notes starting within `window` seconds of each note."""
    starts = np.asarray([n.start for n in notes])
    pitches = np.asarray([n.pitch for n in notes], dtype=float)
    weights = np.asarray([n.end - n.start for n in notes])
    centers: list[float] = []
    for t in starts:
        lo, hi = np.searchsorted(starts, [t - window, t + window])
        order = np.argsort(pitches[lo:hi], kind="stable")
        cumulative = np.cumsum(weights[lo:hi][order])
        centers.append(float(pitches[lo:hi][order][np.searchsorted(cumulative, cumulative[-1] / 2)]))
    return centers


def settle_register(notes: list[RawNote], *, polyphonic: bool, window: float = REGISTER_WINDOW_SEC,
                    reach: int = REGISTER_REACH) -> list[RawNote]:
    """Keep a monophonic line in the register of the notes around it.

    A note that strays more than `reach` semitones is not part of the tune: it is an octave
    error, which moves back by one octave, or, in a polyphonic stem, an accompaniment note
    showing through from below while the tune rests, which is dropped.
    """
    ordered = sorted(notes, key=lambda n: n.start)
    kept: list[RawNote] = []
    for n, center in zip(ordered, _local_register(ordered, window)):
        offset = n.pitch - center
        if abs(offset) <= reach:
            kept.append(n)
            continue
        if polyphonic and offset < 0:
            continue
        shift = -12 if offset > 0 else 12
        if abs(offset + shift) <= reach:
            kept.append(replace(n, pitch=n.pitch + shift))
    return _drop_dips(kept, window) if polyphonic else kept


def _drop_dips(notes: list[RawNote], window: float, depth: int = DIP_DEPTH) -> list[RawNote]:
    """Drop notes that dive well below the notes on both sides: the accompaniment between two tune notes."""
    out: list[RawNote] = []
    for n, after in zip(notes, [*notes[1:], None]):
        if out and after is not None:
            before = out[-1]
            near = n.start - before.end <= window and after.start - n.end <= window
            if near and before.pitch - n.pitch >= depth and after.pitch - n.pitch >= depth:
                continue
        out.append(n)
    return out


def plain_line(notes: list[RawNote], max_ornament: float = ORNAMENT_MAX_SEC,
               gap: float = LEGATO_GAP_SEC) -> list[RawNote]:
    """Simplify a monophonic line: a quick flick to the semitone next door and back becomes one held note."""
    out: list[RawNote] = []
    for n in sorted(notes, key=lambda n: n.start):
        if len(out) >= 2:
            held, flick = out[-2], out[-1]
            joined = flick.start - held.end <= gap and n.start - flick.end <= gap
            if (joined and held.pitch == n.pitch and abs(flick.pitch - n.pitch) == 1
                    and flick.end - flick.start <= max_ornament):
                out[-2:] = [replace(held, end=n.end)]
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
