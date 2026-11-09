from helpers import make_song
from pianoverse_engine import cli
from pianoverse_engine.errors import AudioError
from pianoverse_engine.models import Key, Preview


def test_cli_writes_outputs(tmp_path, monkeypatch):
    monkeypatch.setattr(cli, "run_pipeline", lambda *a, **k: make_song())
    src = tmp_path / "in.mp3"
    src.write_bytes(b"x")
    assert cli.main([str(src), "--out", str(tmp_path / "out")]) == 0
    assert (tmp_path / "out" / "song.json").exists()
    assert (tmp_path / "out" / "easy.mid").exists()


def test_cli_reports_engine_errors(tmp_path, monkeypatch, capsys):
    def boom(*a, **k):
        raise AudioError("too_short", "The recording is too short.")
    monkeypatch.setattr(cli, "run_pipeline", boom)
    src = tmp_path / "in.mp3"
    src.write_bytes(b"x")
    assert cli.main([str(src), "--out", str(tmp_path / "out")]) == 1
    assert "too_short" in capsys.readouterr().err


def test_cli_prints_the_preview(tmp_path, monkeypatch, capsys):
    def fake_run(*args, on_preview, **kwargs):
        on_preview(Preview(key=Key(tonic="A", mode="minor"), bpm=90.4, timeSignature=(3, 4),
                           chords=["Am", "F", "C", "G"]))
        return make_song()

    monkeypatch.setattr(cli, "run_pipeline", fake_run)
    src = tmp_path / "in.mp3"
    src.write_bytes(b"x")
    assert cli.main([str(src), "--out", str(tmp_path / "out")]) == 0
    assert "found: A minor · 90 BPM · 3/4 · Am F C G" in capsys.readouterr().err
