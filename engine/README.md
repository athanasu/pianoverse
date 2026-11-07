# pianoverse-engine

Song audio → playable piano arrangement (Song JSON + MIDI). Design: `docs/superpowers/specs/2026-11-07-pianoverse-design.md`.

## Setup

```bash
brew install ffmpeg
brew install wget   # piano model downloads its weights with wget on first use
uv sync
```

## Run

```bash
uv run pianoverse-engine path/to/song.mp3 --out out/song
uv run pianoverse-engine piano.m4a --out out/piano --mode solo_piano
```

Writes `song.json` and `easy.mid`, `medium.mid`, `hard.mid` (and `original.mid` for solo piano). First run downloads model weights.

## Test

```bash
uv run pytest            # fast suite
uv run pytest -m slow    # real models (minutes)
```

## Evaluate

Put songs in `samples/` (git-ignored). Optional reference chords go in `samples/<name>.chords.lab` (MIREX format).

```bash
uv run python -m pianoverse_engine.evaluate samples out/eval
```

Then listen to `out/eval/<song>/overlay-<level>.wav` and read `out/eval/report.md`.
