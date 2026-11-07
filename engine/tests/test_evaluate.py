import numpy as np
import pytest

from helpers import make_song
from pianoverse_engine.evaluate import chord_score, overlay
from pianoverse_engine.models import ChordSegment


def test_overlay_covers_the_longer_signal():
    song = make_song()
    mixed = overlay(np.zeros(1000, dtype=np.float32), 1000, song.arrangements["easy"], 120)
    assert len(mixed) >= 2000          # the left-hand note lasts 2 s
    assert np.abs(mixed).max() <= 1.0


def test_chord_score_perfect_match(tmp_path):
    lab = tmp_path / "ref.chords.lab"
    lab.write_text("0.0 2.0 C:maj\n2.0 4.0 A:min\n")
    song = make_song(chords=[
        ChordSegment(start=0, end=2, symbol="C", root="C", quality="maj"),
        ChordSegment(start=2, end=4, symbol="Am", root="A", quality="min"),
    ])
    assert chord_score(song, lab) == pytest.approx(1.0)


def test_chord_score_counts_gaps_as_no_chord(tmp_path):
    lab = tmp_path / "ref.chords.lab"
    lab.write_text("0.0 2.0 C:maj\n2.0 4.0 A:min\n")
    song = make_song(chords=[ChordSegment(start=0, end=2, symbol="C", root="C", quality="maj")])
    assert chord_score(song, lab) == pytest.approx(0.5)
