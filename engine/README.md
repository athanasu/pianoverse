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

Chords come from BTC (Bi-directional Transformer for Chord recognition, Park et al. ISMIR 2019), vendored in `src/pianoverse_engine/vendor/btc/` under its MIT license. Its 12 MB checkpoint is downloaded on first use to `~/.cache/pianoverse/` and verified by SHA-256.

## Test

```bash
uv run pytest            # fast suite
uv run pytest -m slow    # real models (minutes)
```

## Evaluate

Put songs in `samples/` (git-ignored). Optional reference chords go in `samples/<name>.chords.lab` (MIREX format). To force a song's type (e.g. a solo-piano recording the stem classifier calls instrumental), add `samples/<name>.mode` containing `vocal`, `instrumental` or `solo_piano`.

```bash
uv run python -m pianoverse_engine.evaluate samples out/eval
```

Then listen to `out/eval/<song>/overlay-<level>.wav` and read `out/eval/report.md`.
