import pytest

from pianoverse_engine.arrange.levels import (
    MIN_ARRANGED_NOTE, arrange_easy, arrange_hard, arrange_medium, arrange_original,
)
from pianoverse_engine.models import Arrangement, ChordSegment, RawNote

BEATS = [i * 0.5 for i in range(16)]
DOWNBEATS = [0.0, 2.0, 4.0, 6.0]
DURATION = 8.0
CHORDS = [
    ChordSegment(start=0, end=2, symbol="C", root="C", quality="maj"),
    ChordSegment(start=2, end=4, symbol="Am", root="A", quality="min"),
    ChordSegment(start=4, end=6, symbol="F", root="F", quality="maj"),
    ChordSegment(start=6, end=8, symbol="G7", root="G", quality="7"),
]
MELODY = [RawNote(p, i * 0.5 + 0.02, i * 0.5 + 0.45, 90)
          for i, p in enumerate([48, 50, 52, 53, 55, 57, 59, 60, 59, 57, 55, 53, 52, 50, 48, 47])]
LEVELS = [arrange_easy, arrange_medium, arrange_hard]


def _sounding(arr: Arrangement, hand: str, t: float) -> list[int]:
    return [n.pitch for n in arr.notes if n.hand == hand and n.start <= t < n.end]


def assert_playable(arr: Arrangement) -> None:
    for n in arr.notes:
        left, right = _sounding(arr, "L", n.start), _sounding(arr, "R", n.start)
        for pitches in (left, right):
            if pitches:
                assert max(pitches) - min(pitches) <= 12
        if left and right:
            assert max(left) < min(right)
    assert all(60 <= n.pitch <= 84 for n in arr.notes if n.hand == "R")


@pytest.mark.parametrize("arrange", LEVELS)
def test_levels_are_playable(arrange):
    arr = arrange(MELODY, CHORDS, BEATS, DOWNBEATS, DURATION)
    assert any(n.hand == "R" for n in arr.notes)
    assert any(n.hand == "L" for n in arr.notes)
    assert_playable(arr)


@pytest.mark.parametrize("arrange", LEVELS)
def test_every_chord_starts_a_left_hand_note(arrange):
    arr = arrange(MELODY, CHORDS, BEATS, DOWNBEATS, DURATION)
    for chord in CHORDS:
        assert any(n.hand == "L" and abs(n.start - chord.start) < 1e-6 for n in arr.notes)


def test_easy_left_hand_is_one_bass_note_per_chord():
    arr = arrange_easy(MELODY, CHORDS, BEATS, DOWNBEATS, DURATION)
    left = [n for n in arr.notes if n.hand == "L"]
    assert [n.pitch % 12 for n in left] == [0, 9, 5, 7]


def test_easy_uses_slash_bass():
    chords = [ChordSegment(start=0, end=2, symbol="C/E", root="C", quality="maj", bass="E")]
    arr = arrange_easy(MELODY[:4], chords, BEATS, DOWNBEATS, DURATION)
    assert [n.pitch % 12 for n in arr.notes if n.hand == "L"] == [4]


def test_medium_restrikes_on_downbeats():
    chords = [ChordSegment(start=0, end=4, symbol="C", root="C", quality="maj")]
    arr = arrange_medium(MELODY[:8], chords, BEATS, [0.0, 2.0], DURATION)
    assert sorted({n.start for n in arr.notes if n.hand == "L"}) == [0.0, 2.0]


def test_hard_adds_harmony_to_the_right_hand():
    melody_only = arrange_medium(MELODY, CHORDS, BEATS, DOWNBEATS, DURATION)
    hard = arrange_hard(MELODY, CHORDS, BEATS, DOWNBEATS, DURATION)
    r_medium = [n for n in melody_only.notes if n.hand == "R"]
    r_hard = [n for n in hard.notes if n.hand == "R"]
    assert len(r_hard) > len(r_medium)


def test_original_splits_hands_at_middle_c():
    arr = arrange_original([RawNote(48, 0, 1, 70), RawNote(64, 0, 1, 70)])
    assert [(n.pitch, n.hand) for n in arr.notes] == [(48, "L"), (64, "R")]


def test_hard_has_no_sliver_notes_when_beats_start_just_after_zero():
    beats = [0.03 + i * 0.5 for i in range(16)]
    arr = arrange_hard(MELODY, CHORDS, beats, DOWNBEATS, DURATION)
    assert min(n.end - n.start for n in arr.notes) >= MIN_ARRANGED_NOTE
