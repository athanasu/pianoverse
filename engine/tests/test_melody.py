from pianoverse_engine.melody import clean_notes, drop_ghost_notes, fit_octave, plain_line, settle_register, skyline
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


def _line(pitches: list[int], step: float = 0.5) -> list[RawNote]:
    return [RawNote(p, i * step, (i + 1) * step) for i, p in enumerate(pitches)]


def test_settle_register_keeps_an_ordinary_tune():
    tune = _line([60, 62, 64, 65, 67, 72, 67, 64, 60])
    assert settle_register(tune, polyphonic=False) == tune
    assert settle_register(tune, polyphonic=True) == tune


def test_settle_register_moves_an_octave_error_back():
    tune = _line([60, 62, 76, 62, 60, 62, 48, 60])
    assert [n.pitch for n in settle_register(tune, polyphonic=False)] == [60, 62, 64, 62, 60, 62, 60, 60]


def test_settle_register_drops_accompaniment_below_a_polyphonic_tune():
    tune = _line([70, 72, 46, 72, 70, 68, 70])
    assert [n.pitch for n in settle_register(tune, polyphonic=True)] == [70, 72, 72, 70, 68, 70]


def test_settle_register_drops_notes_too_far_to_be_an_octave_error():
    tune = _line([60, 62, 96, 62, 60])
    assert [n.pitch for n in settle_register(tune, polyphonic=False)] == [60, 62, 62, 60]


def test_settle_register_drops_an_inner_voice_between_two_tune_notes():
    tune = _line([70, 63, 70, 72, 65, 73])
    assert [n.pitch for n in settle_register(tune, polyphonic=True)] == [70, 70, 72, 73]
    assert settle_register(tune, polyphonic=False) == tune


def test_settle_register_follows_a_tune_that_changes_register():
    tune = _line([60, 62, 64] * 8 + [76, 77, 79] * 8)
    settled = settle_register(tune, polyphonic=False)
    assert [n.pitch % 12 for n in settled] == [n.pitch % 12 for n in tune]
    # only a note right at the seam may be read as belonging to the register it leaves
    assert sum(a != b for a, b in zip(settled, tune)) <= 1


def test_settle_register_of_nothing_is_nothing():
    assert settle_register([], polyphonic=True) == []


def test_plain_line_holds_through_a_semitone_flick():
    notes = [RawNote(60, 0.0, 0.4), RawNote(59, 0.4, 0.55), RawNote(60, 0.55, 1.0), RawNote(64, 1.0, 1.5)]
    assert plain_line(notes) == [RawNote(60, 0.0, 1.0), RawNote(64, 1.0, 1.5)]


def test_plain_line_keeps_a_real_neighbour_note():
    slow = [RawNote(60, 0.0, 0.4), RawNote(59, 0.4, 0.9), RawNote(60, 0.9, 1.4)]
    step = [RawNote(60, 0.0, 0.4), RawNote(58, 0.4, 0.55), RawNote(60, 0.55, 1.0)]
    apart = [RawNote(60, 0.0, 0.4), RawNote(59, 0.6, 0.75), RawNote(60, 0.75, 1.0)]
    for notes in (slow, step, apart):
        assert plain_line(notes) == notes
