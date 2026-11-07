from pianoverse_engine.melody import clean_notes, drop_ghost_notes, fit_octave, skyline
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


def test_ghost_overtone_above_loud_note_is_dropped():
    notes = [RawNote(76, 0, 1, 100), RawNote(95, 0, 1, 40)]
    assert drop_ghost_notes(notes) == [RawNote(76, 0, 1, 100)]


def test_equally_loud_overlapping_notes_are_both_kept():
    notes = [RawNote(72, 0, 1, 90), RawNote(76, 0.5, 1.5, 90)]
    assert drop_ghost_notes(notes) == notes


def test_quiet_note_without_loud_overlap_is_kept():
    notes = [RawNote(76, 0, 1, 100), RawNote(95, 1.0, 2.0, 40)]
    assert drop_ghost_notes(notes) == notes


def test_skyline_after_ghost_removal_returns_the_melody():
    melody = [RawNote(72 + i, i * 0.5, i * 0.5 + 0.4, 100) for i in range(6)]
    ghosts = [RawNote(n.pitch + 24, n.start, n.end, 40) for n in melody]
    assert skyline(drop_ghost_notes(melody + ghosts)) == melody
