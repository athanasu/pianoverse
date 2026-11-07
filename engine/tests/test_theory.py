import pytest

from pianoverse_engine.theory import (
    chord_pcs, chord_symbol, pc_name, pc_of, pitch_at_or_above, to_mirex,
)


def test_pc_names_round_trip():
    for pc in range(12):
        assert pc_of(pc_name(pc)) == pc


def test_pc_of_accepts_enharmonic_aliases():
    assert pc_of("Db") == 1
    assert pc_of("A#") == 10


def test_pc_of_rejects_garbage():
    with pytest.raises(ValueError):
        pc_of("H")


@pytest.mark.parametrize("root,quality,bass,expected", [
    (9, "min", None, "Am"),
    (0, "maj", 4, "C/E"),
    (0, "maj", 0, "C"),
    (7, "7", None, "G7"),
    (2, "m7", None, "Dm7"),
    (5, "maj7", None, "Fmaj7"),
    (11, "dim", None, "Bdim"),
])
def test_chord_symbol(root, quality, bass, expected):
    assert chord_symbol(root, quality, bass) == expected


def test_chord_pcs_dominant_seventh():
    assert chord_pcs(7, "7") == [7, 11, 2, 5]


def test_to_mirex():
    assert to_mirex(9, "m7") == "A:min7"
    assert to_mirex(0, "maj") == "C:maj"


def test_pitch_at_or_above():
    assert pitch_at_or_above(4, 43) == 52   # first E at/above G2 is E3
    assert pitch_at_or_above(7, 43) == 43
