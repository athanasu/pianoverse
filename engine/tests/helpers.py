import numpy as np
import pretty_midi

from pianoverse_engine.models import (
    Arrangement, ChordSegment, Key, Note, Song, Tempo,
)


def synth(notes: list[tuple[int, float, float]], sr: int) -> np.ndarray:
    """Sine-wave render of (pitch, start, end) tuples, peak 0.5."""
    pm = pretty_midi.PrettyMIDI()
    inst = pretty_midi.Instrument(program=0)
    inst.notes = [pretty_midi.Note(velocity=100, pitch=p, start=s, end=e) for p, s, e in notes]
    pm.instruments.append(inst)
    y = pm.synthesize(fs=sr).astype(np.float32)
    return y / (np.abs(y).max() + 1e-9) * 0.5


def make_song(**overrides) -> Song:
    base = dict(
        id="abc",
        title="Test",
        durationSec=8.0,
        sourceType="vocal",
        tempo=Tempo(bpm=120, beats=[0.5, 1.0], downbeats=[0.5]),
        timeSignature=(4, 4),
        key=Key(tonic="C", mode="major"),
        chords=[ChordSegment(start=0, end=2, symbol="C", root="C", quality="maj")],
        arrangements={
            "easy": Arrangement(notes=[
                Note(pitch=72, start=0, end=0.5, velocity=80, hand="R"),
                Note(pitch=48, start=0, end=2, velocity=60, hand="L"),
            ])
        },
        warnings=[],
    )
    base.update(overrides)
    return Song(**base)
