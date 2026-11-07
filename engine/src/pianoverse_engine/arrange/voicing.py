from ..theory import chord_pcs

# Left-hand chord range D2–B3: wide enough (21 semitones) that every
# inversion of every supported chord fits somewhere.
LH_LO, LH_HI, LH_CENTER = 38, 59, 50


def chord_tones(root_pc: int, quality: str) -> list[int]:
    pcs = chord_pcs(root_pc, quality)
    return [pcs[0], pcs[1], pcs[3]] if len(pcs) == 4 else pcs


def voicings(root_pc: int, quality: str, lo: int = LH_LO, hi: int = LH_HI) -> list[tuple[int, ...]]:
    """All close-position inversions of the chord that fit inside [lo, hi]."""
    tones = chord_tones(root_pc, quality)
    found: set[tuple[int, ...]] = set()
    for k in range(len(tones)):
        order = tones[k:] + tones[:k]
        for octave in range(11):
            v = [octave * 12 + order[0]]
            for pc in order[1:]:
                p = v[-1] + 1
                while p % 12 != pc:
                    p += 1
                v.append(p)
            if v[0] >= lo and v[-1] <= hi:
                found.add(tuple(v))
    return sorted(found)


def _mean(v: tuple[int, ...]) -> float:
    return sum(v) / len(v)


def voice_lead(
    chords: list[tuple[int, str]], lo: int = LH_LO, hi: int = LH_HI, center: int = LH_CENTER,
) -> list[tuple[int, ...]]:
    """Pick one voicing per chord, minimising hand movement between chords."""
    out: list[tuple[int, ...]] = []
    prev: tuple[int, ...] | None = None
    for root, quality in chords:
        options = voicings(root, quality, lo, hi)
        if prev is None:
            best = min(options, key=lambda v: (abs(_mean(v) - center), v))
        else:
            p = prev
            best = min(options, key=lambda v: (
                sum(abs(a - b) for a, b in zip(v, p)), abs(_mean(v) - center), v))
        out.append(best)
        prev = best
    return out


def bass_below(pc: int, ceiling: int) -> int:
    """Highest pitch with pitch class pc strictly below ceiling."""
    p = ceiling - 1
    while p % 12 != pc:
        p -= 1
    return p
