import pytest

from pianoverse_engine.rhythm import tempo_from_beats, time_signature

BEATS = [i * 0.5 for i in range(1, 25)]


def test_tempo_from_even_beats_is_120():
    tempo = tempo_from_beats(BEATS, [0.5, 2.5])
    assert tempo.bpm == pytest.approx(120.0)
    assert tempo.downbeats == [0.5, 2.5]


def test_three_beats_per_bar():
    assert time_signature(BEATS, [0.5, 2.0, 3.5, 5.0]) == (3, 4)


def test_default_four_four_without_downbeats():
    assert time_signature(BEATS, []) == (4, 4)
