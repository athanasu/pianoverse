"""Rebuild songs already in the local library with the current engine."""
import argparse
import sys

from ..errors import EngineError
from ..pipeline import run_pipeline
from .blobs import LocalBlobs
from .config import Settings
from .store import Store
from .worker import reprocess_song


def _progress(stage: str, fraction: float) -> None:
    print(f"  [{fraction:4.0%}] {stage}", file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="pianoverse-reanalyze",
        description="Run the current engine again on stored songs, from their original audio. "
                    "Titles and ids stay; the arrangements are replaced.")
    parser.add_argument("song_ids", nargs="*", metavar="SONG_ID", help="songs to redo (default: every song)")
    args = parser.parse_args(argv)

    settings = Settings.from_env()
    if settings.runner != "local":
        raise ValueError("pianoverse-reanalyze only works on the local library (PIANOVERSE_RUNNER=local)")
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    store = Store(settings.database_url)
    blobs = LocalBlobs(settings.data_dir / "blobs")

    song_ids = args.song_ids or [song.id for song in reversed(store.list_songs())]
    failed = 0
    for song_id in song_ids:
        record = store.get_song(song_id)
        if record is None:
            print(f"Error: no song with id {song_id}.", file=sys.stderr)
            failed += 1
            continue
        print(f"{record.title} ({song_id})", flush=True)
        try:
            reprocess_song(song_id, store, blobs, run=run_pipeline, progress=_progress)
        except EngineError as err:
            print(f"Error ({err.code}): {err.message}", file=sys.stderr)
            failed += 1
        except KeyError:
            print(f"Error: the original audio of {song_id} is missing.", file=sys.stderr)
            failed += 1
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
