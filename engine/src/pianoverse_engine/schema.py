"""Write the Song JSON Schema: `uv run python -m pianoverse_engine.schema ../schema/song.schema.json`."""
import json
import sys
from pathlib import Path

from .models import Song


def main(out: str | None = None) -> None:
    text = json.dumps(Song.model_json_schema(), indent=2, ensure_ascii=False) + "\n"
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        Path(out).write_text(text)
    else:
        sys.stdout.write(text)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
