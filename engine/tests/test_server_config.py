from pathlib import Path

import pytest

from pianoverse_engine.server.config import ENGINE_DIR, Settings


def test_defaults_are_local_and_closed():
    settings = Settings.from_env({})
    assert settings.api_key is None
    assert settings.host == "127.0.0.1"
    assert settings.port == 8000
    assert settings.runner == "local"
    assert settings.data_dir == ENGINE_DIR / "data"
    assert settings.database_url == f"sqlite:///{ENGINE_DIR / 'data' / 'pianoverse.db'}"
    assert settings.cors_origins == ["http://localhost:5173"]
    assert settings.max_upload_bytes == 50 * 1024 * 1024
    assert settings.stale_after_sec == 1200
    assert (ENGINE_DIR / "pyproject.toml").exists()


def test_reads_every_variable(tmp_path):
    settings = Settings.from_env({
        "PIANOVERSE_API_KEY": "secret",
        "PIANOVERSE_DATA_DIR": str(tmp_path),
        "PIANOVERSE_DATABASE_URL": "postgresql+psycopg://u:p@db/x",
        "PIANOVERSE_CORS_ORIGINS": "https://a.pages.dev, http://localhost:5173 ,",
        "PIANOVERSE_RUNNER": "modal",
        "PIANOVERSE_HOST": "0.0.0.0",
        "PIANOVERSE_PORT": "9000",
        "SUPABASE_URL": "https://x.supabase.co",
        "SUPABASE_SERVICE_KEY": "service",
    })
    assert settings.api_key == "secret"
    assert settings.data_dir == Path(tmp_path)
    assert settings.database_url == "postgresql+psycopg://u:p@db/x"
    assert settings.cors_origins == ["https://a.pages.dev", "http://localhost:5173"]
    assert settings.runner == "modal"
    assert (settings.host, settings.port) == ("0.0.0.0", 9000)
    assert (settings.supabase_url, settings.supabase_service_key) == ("https://x.supabase.co", "service")


def test_database_defaults_inside_the_data_dir(tmp_path):
    settings = Settings.from_env({"PIANOVERSE_DATA_DIR": str(tmp_path)})
    assert settings.database_url == f"sqlite:///{tmp_path / 'pianoverse.db'}"


def test_blank_api_key_counts_as_missing():
    assert Settings.from_env({"PIANOVERSE_API_KEY": "  "}).api_key is None


def test_open_host_without_api_key_is_refused():
    with pytest.raises(ValueError, match="PIANOVERSE_API_KEY"):
        Settings.from_env({"PIANOVERSE_HOST": "0.0.0.0"})


def test_unknown_runner_is_refused():
    with pytest.raises(ValueError, match="PIANOVERSE_RUNNER"):
        Settings.from_env({"PIANOVERSE_RUNNER": "cloud"})
