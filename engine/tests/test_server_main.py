from importlib.metadata import entry_points

from fastapi import FastAPI

from pianoverse_engine.server import main


def test_pianoverse_server_script_is_registered():
    scripts = {ep.name: ep.value for ep in entry_points(group="console_scripts")}
    assert scripts["pianoverse-server"] == "pianoverse_engine.server.main:main"


def test_main_serves_the_app_on_the_configured_address(tmp_path, monkeypatch):
    for name in ("PIANOVERSE_API_KEY", "PIANOVERSE_HOST", "PIANOVERSE_DATABASE_URL", "PIANOVERSE_RUNNER"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("PIANOVERSE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PIANOVERSE_PORT", "9123")
    calls = []
    monkeypatch.setattr(main.uvicorn, "run", lambda app, **kwargs: calls.append((app, kwargs)))
    main.main()
    [(app, kwargs)] = calls
    assert isinstance(app, FastAPI)
    assert kwargs == {"host": "127.0.0.1", "port": 9123}
    assert (tmp_path / "pianoverse.db").exists()
