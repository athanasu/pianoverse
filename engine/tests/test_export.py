import pretty_midi

from helpers import make_song
from pianoverse_engine.export import write_outputs
from pianoverse_engine.models import Song, SongWarning


def test_write_outputs(tmp_path):
    song = make_song(title="Café — live", warnings=[SongWarning(
        code="melody_sparse", message="Melody detected in only 20% of the song.")])
    write_outputs(song, tmp_path / "out")
    raw = (tmp_path / "out" / "song.json").read_bytes()
    text = raw.decode("utf-8")
    assert "Café — live" in text
    assert '"bass"' not in text   # None fields are omitted
    assert Song.model_validate_json(text) == song
    pm = pretty_midi.PrettyMIDI(str(tmp_path / "out" / "easy.mid"))
    assert [i.name for i in pm.instruments] == ["Right hand", "Left hand"]
    assert [len(i.notes) for i in pm.instruments] == [1, 1]
    assert pm.instruments[0].notes[0].pitch == 72
