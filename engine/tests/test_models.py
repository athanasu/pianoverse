import pytest
from pydantic import ValidationError

from helpers import make_song
from pianoverse_engine.models import Note, Song


def test_song_round_trips_through_json():
    song = make_song()
    assert Song.model_validate_json(song.model_dump_json()) == song


def test_note_end_must_follow_start():
    with pytest.raises(ValidationError):
        Note(pitch=60, start=1.0, end=1.0, velocity=80, hand="R")


def test_note_pitch_must_be_on_piano():
    with pytest.raises(ValidationError):
        Note(pitch=120, start=0, end=1, velocity=80, hand="R")


def test_unknown_level_rejected():
    with pytest.raises(ValidationError):
        make_song(arrangements={"expert": {"notes": []}})


def test_schema_has_all_top_level_fields():
    props = set(Song.model_json_schema()["properties"])
    assert props == {
        "schemaVersion", "id", "title", "durationSec", "sourceType", "tempo",
        "timeSignature", "key", "chords", "arrangements", "warnings",
    }
