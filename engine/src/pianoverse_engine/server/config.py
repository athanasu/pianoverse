import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast

ENGINE_DIR = Path(__file__).resolve().parents[3]
LOCALHOST = "127.0.0.1"
RUNNERS = ("local", "modal")


@dataclass(frozen=True)
class Settings:
    api_key: str | None
    data_dir: Path
    database_url: str
    cors_origins: list[str]
    runner: Literal["local", "modal"]
    host: str
    port: int
    supabase_url: str | None
    supabase_service_key: str | None
    max_upload_bytes: int = 50 * 1024 * 1024
    stale_after_sec: int = 1200

    @classmethod
    def from_env(cls, env: Mapping[str, str] = os.environ) -> "Settings":
        def get(name: str) -> str | None:
            return env.get(name, "").strip() or None

        api_key = get("PIANOVERSE_API_KEY")
        host = get("PIANOVERSE_HOST") or LOCALHOST
        if api_key is None and host != LOCALHOST:
            raise ValueError("PIANOVERSE_API_KEY is required when PIANOVERSE_HOST is not 127.0.0.1")
        runner = get("PIANOVERSE_RUNNER") or "local"
        if runner not in RUNNERS:
            raise ValueError(f"PIANOVERSE_RUNNER must be one of {', '.join(RUNNERS)}")
        data_dir = Path(get("PIANOVERSE_DATA_DIR") or ENGINE_DIR / "data")
        origins = get("PIANOVERSE_CORS_ORIGINS") or "http://localhost:5173"
        return cls(
            api_key=api_key,
            data_dir=data_dir,
            database_url=get("PIANOVERSE_DATABASE_URL") or f"sqlite:///{data_dir / 'pianoverse.db'}",
            cors_origins=[o.strip() for o in origins.split(",") if o.strip()],
            runner=cast(Literal["local", "modal"], runner),
            host=host,
            port=int(get("PIANOVERSE_PORT") or 8000),
            supabase_url=get("SUPABASE_URL"),
            supabase_service_key=get("SUPABASE_SERVICE_KEY"),
        )
