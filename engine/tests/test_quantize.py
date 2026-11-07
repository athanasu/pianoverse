import numpy as np
import pytest

from pianoverse_engine.arrange.quantize import beat_grid, quantize_monophonic
from pianoverse_engine.models import RawNote


def test_beat_grid_extends_before_and_after_beats():
    grid = beat_grid([0.5, 1.0, 1.5, 2.0], duration=2.5, subdivisions=2)
    assert np.allclose(grid, np.arange(0.0, 2.51, 0.25))


def test_quantize_snaps_to_grid():
    grid = np.arange(0.0, 2.01, 0.25)
    out = quantize_monophonic([RawNote(72, 0.26, 0.74)], grid)
    assert out == [RawNote(72, 0.25, 0.75)]


def test_quantize_extends_zero_length_notes():
    grid = np.arange(0.0, 2.01, 0.25)
    out = quantize_monophonic([RawNote(72, 0.49, 0.51)], grid)
    assert out == [RawNote(72, 0.5, 0.75)]


def test_quantize_trims_overlaps():
    grid = np.arange(0.0, 2.01, 0.25)
    out = quantize_monophonic([RawNote(72, 0.0, 1.0), RawNote(74, 0.5, 1.0)], grid)
    assert out == [RawNote(72, 0.0, 0.5), RawNote(74, 0.5, 1.0)]


def test_quantize_keeps_one_note_per_onset():
    grid = np.arange(0.0, 2.01, 0.25)
    out = quantize_monophonic([RawNote(76, 0.01, 0.5), RawNote(72, 0.02, 0.5)], grid)
    assert [n.pitch for n in out] == [76]
    assert out[0].start == pytest.approx(0.0)


def test_beat_grid_covers_lead_in_before_first_beat():
    grid = beat_grid([0.3, 0.8, 1.3], duration=1.5, subdivisions=2)
    assert grid[0] == 0.0
    assert np.isclose(grid, 0.3).any()
    assert np.isclose(grid, 0.55).any()
    assert grid[-1] >= 1.5
