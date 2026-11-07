from ..melody import fit_octave
from ..models import Arrangement, ChordSegment, Note, RawNote
from ..theory import chord_pcs, pc_of, pitch_at_or_above
from .quantize import beat_grid, quantize_monophonic
from .voicing import bass_below, voice_lead

EASY_BASS_LO = 43          # easy left hand stays in G2–F#3
SPLIT = 60                 # middle C: right hand at/above, left hand below
R_VEL, HARMONY_VEL, L_VEL = 80, 64, 60
ON_BEAT_TOLERANCE = 0.03
EPS = 1e-6


def _sorted(notes: list[Note]) -> Arrangement:
    return Arrangement(notes=sorted(notes, key=lambda n: (n.start, n.pitch)))


def _melody(melody: list[RawNote], beats: list[float], duration: float, subdivisions: int) -> list[RawNote]:
    return quantize_monophonic(fit_octave(melody), beat_grid(beats, duration, subdivisions))


def _right(notes: list[RawNote]) -> list[Note]:
    return [Note(pitch=n.pitch, start=n.start, end=n.end, velocity=R_VEL, hand="R") for n in notes]


def _bass_pc(chord: ChordSegment) -> int:
    return pc_of(chord.bass) if chord.bass else pc_of(chord.root)


def _split_at(start: float, end: float, points: list[float]) -> list[tuple[float, float]]:
    cuts = [start, *[p for p in points if start + EPS < p < end - EPS], end]
    return list(zip(cuts[:-1], cuts[1:]))


def _chord_at(chords: list[ChordSegment], t: float) -> ChordSegment | None:
    for c in chords:
        if c.start - EPS <= t < c.end:
            return c
    return None


def _harmony_below(pitch: int, chord: ChordSegment) -> int | None:
    pcs = set(chord_pcs(pc_of(chord.root), chord.quality))
    for interval in range(3, 10):
        candidate = pitch - interval
        if candidate < SPLIT:
            return None
        if candidate % 12 in pcs:
            return candidate
    return None


def _voicings(chords: list[ChordSegment]) -> list[tuple[int, ...]]:
    return voice_lead([(pc_of(c.root), c.quality) for c in chords])


def arrange_easy(melody, chords, beats, downbeats, duration) -> Arrangement:
    right = _right(_melody(melody, beats, duration, subdivisions=2))
    left = [Note(pitch=pitch_at_or_above(_bass_pc(c), EASY_BASS_LO),
                 start=c.start, end=c.end, velocity=L_VEL, hand="L") for c in chords]
    return _sorted(right + left)


def arrange_medium(melody, chords, beats, downbeats, duration) -> Arrangement:
    right = _right(_melody(melody, beats, duration, subdivisions=4))
    left: list[Note] = []
    for chord, voicing in zip(chords, _voicings(chords)):
        for start, end in _split_at(chord.start, chord.end, downbeats):
            left += [Note(pitch=p, start=start, end=end, velocity=L_VEL, hand="L") for p in voicing]
    return _sorted(right + left)


def arrange_hard(melody, chords, beats, downbeats, duration) -> Arrangement:
    line = _melody(melody, beats, duration, subdivisions=4)
    right = _right(line)
    for n in line:
        chord = _chord_at(chords, n.start)
        on_beat = any(abs(n.start - b) < ON_BEAT_TOLERANCE for b in beats)
        if chord is None or not on_beat:
            continue
        harmony = _harmony_below(n.pitch, chord)
        if harmony is not None:
            right.append(Note(pitch=harmony, start=n.start, end=n.end, velocity=HARMONY_VEL, hand="R"))

    eighths = beat_grid(beats, duration, subdivisions=2)
    left: list[Note] = []
    for chord, voicing in zip(chords, _voicings(chords)):
        pattern = [bass_below(_bass_pc(chord), voicing[0]), *voicing]
        ticks = sorted({chord.start, *[float(t) for t in eighths if chord.start + EPS < t < chord.end - EPS]})
        ends = ticks[1:] + [chord.end]
        for i, (start, end) in enumerate(zip(ticks, ends)):
            left.append(Note(pitch=pattern[i % len(pattern)], start=start, end=end, velocity=L_VEL, hand="L"))
    return _sorted(right + left)


def arrange_original(notes: list[RawNote]) -> Arrangement:
    out = [
        Note(pitch=n.pitch, start=n.start, end=n.end,
             velocity=max(1, min(127, n.velocity)), hand="R" if n.pitch >= SPLIT else "L")
        for n in notes if 21 <= n.pitch <= 108 and n.end > n.start
    ]
    return _sorted(out)
