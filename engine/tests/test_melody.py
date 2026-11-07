from pianoverse_engine.melody import clean_notes, fit_octave, skyline
from pianoverse_engine.models import RawNote


def test_clean_notes_drops_blips():
    notes = [RawNote(60, 0.0, 0.03), RawNote(62, 0.1, 0.5)]
    assert clean_notes(notes) == [RawNote(62, 0.1, 0.5)]


def test_skyline_keeps_highest_of_a_chord():
    notes = [RawNote(60, 0, 1), RawNote(64, 0, 1), RawNote(67, 0, 1)]
    assert skyline(notes) == [RawNote(67, 0, 1)]


def test_skyline_truncates_lower_note_when_higher_enters():
    notes = [RawNote(60, 0.0, 1.0), RawNote(72, 0.5, 1.0)]
    assert skyline(notes) == [RawNote(60, 0.0, 0.5), RawNote(72, 0.5, 1.0)]


def test_skyline_drops_lower_overlapping_note():
    notes = [RawNote(72, 0.0, 1.0), RawNote(60, 0.5, 1.5)]
    assert skyline(notes) == [RawNote(72, 0.0, 1.0)]


def test_fit_octave_moves_low_melody_into_right_hand_range():
    notes = [RawNote(p, i, i + 0.5) for i, p in enumerate([48, 50, 52, 53, 55])]
    fitted = fit_octave(notes)
    assert [n.pitch for n in fitted] == [72, 74, 76, 77, 79]


def test_fit_octave_folds_outliers():
    fitted = fit_octave([RawNote(72, 0, 1), RawNote(96, 1, 2), RawNote(40, 2, 3)])
    assert all(60 <= n.pitch <= 84 for n in fitted)
