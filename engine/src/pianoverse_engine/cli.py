import argparse
import sys
from pathlib import Path

from .errors import EngineError
from .export import write_outputs
from .models import Preview
from .pipeline import run_pipeline


def _print_preview(preview: Preview) -> None:
    beats, unit = preview.timeSignature
    print(f"found: {preview.key.tonic} {preview.key.mode} · {preview.bpm:.0f} BPM · {beats}/{unit} · "
          f"{' '.join(preview.chords)}", file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pianoverse-engine",
                                     description="Song → piano arrangement")
    parser.add_argument("input", type=Path, help="audio file (mp3, wav, m4a, …)")
    parser.add_argument("--out", type=Path, required=True, help="output folder")
    parser.add_argument("--title", help="title (default: file name)")
    parser.add_argument("--mode", default="auto",
                        choices=["auto", "vocal", "instrumental", "solo_piano"])
    args = parser.parse_args(argv)

    def progress(stage: str, fraction: float) -> None:
        print(f"[{fraction:4.0%}] {stage}", file=sys.stderr)

    try:
        song = run_pipeline(args.input, args.out / "work", title=args.title or args.input.stem,
                            mode=args.mode, progress=progress, on_preview=_print_preview)
    except EngineError as err:
        print(f"Error ({err.code}): {err.message}", file=sys.stderr)
        return 1
    write_outputs(song, args.out)
    print(args.out / "song.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
