from helpers import make_song
from pianoverse_engine import cli
from pianoverse_engine.errors import AudioError


def test_cli_writes_outputs(tmp_path, monkeypatch):
    monkeypatch.setattr(cli, "run_pipeline", lambda *a, **k: make_song())
    src = tmp_path / "in.mp3"
    src.write_bytes(b"x")
    assert cli.main([str(src), "--out", str(tmp_path / "out")]) == 0
    assert (tmp_path / "out" / "song.json").exists()
    assert (tmp_path / "out" / "easy.mid").exists()


def test_cli_reports_engine_errors(tmp_path, monkeypatch, capsys):
    def boom(*a, **k):
        raise AudioError("too_short", "Η ηχογράφηση είναι πολύ μικρή.")
    monkeypatch.setattr(cli, "run_pipeline", boom)
    src = tmp_path / "in.mp3"
    src.write_bytes(b"x")
    assert cli.main([str(src), "--out", str(tmp_path / "out")]) == 1
    assert "too_short" in capsys.readouterr().err
