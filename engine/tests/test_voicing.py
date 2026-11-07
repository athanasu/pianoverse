import pytest

from pianoverse_engine.arrange.voicing import (
    LH_HI, LH_LO, bass_below, chord_tones, voice_lead, voicings,
)
from pianoverse_engine.theory import QUALITY_INTERVALS


def test_seventh_chords_drop_the_fifth():
    assert chord_tones(7, "7") == [7, 11, 5]


def test_c_major_voicings():
    vs = voicings(0, "maj")
    assert {(48, 52, 55), (43, 48, 52), (40, 43, 48)} <= set(vs)


@pytest.mark.parametrize("quality", list(QUALITY_INTERVALS))
@pytest.mark.parametrize("root", range(12))
def test_every_chord_has_a_playable_voicing(root, quality):
    vs = voicings(root, quality)
    assert vs
    for v in vs:
        assert LH_LO <= v[0] and v[-1] <= LH_HI
        assert v[-1] - v[0] <= 12


def test_voice_leading_moves_minimally():
    assert voice_lead([(0, "maj"), (5, "maj")]) == [(48, 52, 55), (48, 53, 57)]


def test_bass_below():
    assert bass_below(0, 48) == 36
    assert bass_below(4, 48) == 40
