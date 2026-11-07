import warnings

import librosa
import numpy as np
import pytest

from helpers import synth
from pianoverse_engine.chords import _bounds, _merge_ranges, estimate_tuning, recognize_chords, with_bass
from pianoverse_engine.models import ChordSegment

SR = 22050
BEATS = [i * 0.5 for i in range(1, 16)]


def test_recognizes_pop_progression():
    prog = [([48, 52, 55, 60], 0, 2), ([45, 48, 52, 57], 2, 4),
            ([41, 48, 53, 57], 4, 6), ([43, 50, 55, 59], 6, 8)]
    y = synth([(p, s, e) for ps, s, e in prog for p in ps], SR)
    segments, uncertain = recognize_chords(y, SR, BEATS, duration=8.0)
    assert [s.symbol for s in segments] == ["C", "Am", "F", "G"]
    assert segments[1].start == pytest.approx(2.0, abs=0.01)
    assert segments[1].root == "A" and segments[1].quality == "min"
    assert uncertain == []


def test_detects_dominant_seventh():
    y = synth([(p, 0, 4) for p in (43, 47, 50, 53)], SR)
    segments, _ = recognize_chords(y, SR, BEATS[:7], duration=4.0)
    assert [s.symbol for s in segments] == ["G7"]


def test_slash_chord_from_bass_stem():
    y = synth([(p, 0, 4) for p in (60, 64, 67)], SR)
    bass = synth([(40, 0, 4)], SR)
    segments, _ = recognize_chords(y, SR, BEATS[:7], duration=4.0, bass_y=bass)
    assert [s.symbol for s in segments] == ["C/E"]
    assert segments[0].bass == "E"


def test_silence_has_no_chords():
    segments, _ = recognize_chords(np.zeros(SR * 4, dtype=np.float32), SR, BEATS[:7], duration=4.0)
    assert segments == []


def test_merge_ranges():
    assert _merge_ranges([]) == []
    assert _merge_ranges([(0.0, 1.0), (1.0, 2.0)]) == [(0.0, 2.0)]
    assert _merge_ranges([(0.0, 1.0), (2.0, 3.0)]) == [(0.0, 1.0), (2.0, 3.0)]


def test_lone_note_is_flagged_uncertain():
    y = synth([(60, 0, 4)], SR)
    segments, uncertain = recognize_chords(y, SR, BEATS[:7], duration=4.0)
    assert len(segments) == 1
    assert uncertain == [(segments[0].start, segments[0].end)]


def test_estimate_tuning_of_concert_pitch_is_zero():
    t = np.arange(int(12 * SR)) / SR
    sine = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    assert abs(estimate_tuning(sine, SR)) <= 0.05


def test_estimate_tuning_suppresses_empty_frequency_warning():
    quiet = np.full(12 * SR, 1e-9, dtype=np.float32)
    with pytest.warns(UserWarning, match="empty frequency set"):
        librosa.estimate_tuning(y=quiet, sr=SR)
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        assert estimate_tuning(quiet, SR) == 0.0
    assert not [w for w in caught if "empty frequency set" in str(w.message)]


def test_with_bass_adds_slash_only_for_chord_tones():
    segments = [ChordSegment(start=0.0, end=2.0, symbol="C", root="C", quality="maj"),
                ChordSegment(start=2.0, end=4.0, symbol="Am", root="A", quality="min")]
    bass = synth([(40, 0, 2), (39, 2, 4)], SR)          # E under C, Eb under Am
    out = with_bass(segments, bass, SR, _bounds(BEATS[:7], 4.0))
    assert [(s.symbol, s.bass) for s in out] == [("C/E", "E"), ("Am", None)]
