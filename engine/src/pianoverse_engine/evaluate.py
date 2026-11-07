"""Run the engine on every audio file in a folder; write listening renders and a report.

Usage: uv run python -m pianoverse_engine.evaluate SAMPLES_DIR OUT_DIR
"""
import sys
import time
import traceback
from pathlib import Path

import mir_eval
import numpy as np
import soundfile as sf

from .audio import load_mono
from .errors import EngineError
from .export import arrangement_to_midi, write_outputs
from .models import Arrangement, Song
from .pipeline import run_pipeline
from .theory import pc_of, to_mirex

AUDIO_EXT = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac"}
RENDER_SR = 22050
FORCED_MODES = {"vocal", "instrumental", "solo_piano"}


def _peak_normalize(x: np.ndarray) -> np.ndarray:
    return x / (np.abs(x).max() + 1e-9)


def overlay(original: np.ndarray, sr: int, arr: Arrangement, bpm: float) -> np.ndarray:
    """Original song (quieter) under a sine render of the arrangement."""
    piano = arrangement_to_midi(arr, bpm).synthesize(fs=sr)
    n = max(len(original), len(piano))
    a = np.pad(original, (0, n - len(original)))
    b = np.pad(piano, (0, n - len(piano)))
    return (0.45 * _peak_normalize(a) + 0.55 * _peak_normalize(b)).astype(np.float32)


def chord_score(song: Song, lab: Path) -> float:
    """MIREX major/minor chord accuracy against a reference .lab file."""
    ref_intervals, ref_labels = mir_eval.io.load_labeled_intervals(str(lab))
    intervals: list[list[float]] = []
    labels: list[str] = []
    cursor = 0.0
    for c in song.chords:
        if c.start > cursor + 1e-6:
            intervals.append([cursor, c.start])
            labels.append("N")
        intervals.append([c.start, c.end])
        labels.append(to_mirex(pc_of(c.root), c.quality))
        cursor = c.end
    end = float(ref_intervals.max())
    if cursor < end:
        intervals.append([cursor, end])
        labels.append("N")
    scores = mir_eval.chord.evaluate(ref_intervals, ref_labels, np.array(intervals), labels)
    return float(scores["majmin"])


def _forced_mode(sidecar: Path) -> str | None:
    if not sidecar.exists():
        return None
    mode = sidecar.read_text(encoding="utf-8").strip()
    if mode not in FORCED_MODES:
        raise EngineError("bad_mode", "Μη έγκυρος τύπος στο αρχείο .mode.")
    return mode


def _evaluate_song(path: Path, samples: Path, dest: Path, started: float) -> str:
    mode = _forced_mode(samples / f"{path.stem}.mode")
    song = run_pipeline(path, dest / "work", title=path.stem, mode=mode or "auto")
    write_outputs(song, dest)
    original, sr = load_mono(dest / "work" / "input.wav", sr=RENDER_SR)
    for level, arr in song.arrangements.items():
        sf.write(dest / f"overlay-{level}.wav", overlay(original, sr, arr, song.tempo.bpm), sr)
    lab = samples / f"{path.stem}.chords.lab"
    score = f"{chord_score(song, lab):.0%}" if lab.exists() else "—"
    return (
        f"| {path.stem} | {song.sourceType} ({'ορίστηκε' if mode else 'αυτόματα'}) | {song.key.tonic} {song.key.mode} | "
        f"{song.tempo.bpm:.0f} | {len(song.chords)} | {score} | {len(song.warnings)} | "
        f"{time.time() - started:.0f}s |"
    )


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    samples, out = Path(args[0]), Path(args[1])
    out.mkdir(parents=True, exist_ok=True)
    rows: list[str] = []
    for path in sorted(samples.iterdir()):
        if path.suffix.lower() not in AUDIO_EXT:
            continue
        dest = out / path.stem
        started = time.time()
        print(f"→ {path.name}", file=sys.stderr)
        try:
            rows.append(_evaluate_song(path, samples, dest, started))
        except EngineError as err:
            rows.append(f"| {path.stem} | ✗ {err.code} | | | | | | |")
        except Exception as err:   # one bad song must not lose the rest of the report
            dest.mkdir(parents=True, exist_ok=True)
            (dest / "error.log").write_text(traceback.format_exc(), encoding="utf-8")
            rows.append(f"| {path.stem} | ✗ {type(err).__name__} | | | | | | |")
    report = (
        "# Engine evaluation\n\n"
        "| Τραγούδι | Τύπος | Τονικότητα | BPM | Συγχορδίες | Chord acc. (majmin) | Warnings | Χρόνος |\n"
        "|---|---|---|---|---|---|---|---|\n" + "\n".join(rows) + "\n"
    )
    (out / "report.md").write_text(report, encoding="utf-8")
    print(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
